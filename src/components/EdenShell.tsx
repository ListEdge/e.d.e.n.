"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EdenOrb from "./orb/EdenOrb";
import TopBar from "./hud/TopBar";
import SystemPanel, { type EngineStatus } from "./hud/SystemPanel";
import ContextPanel from "./hud/ContextPanel";
import EventStream, { type StreamEvent } from "./hud/EventStream";
import CommandBar from "./hud/CommandBar";

interface SystemStatus {
  ai: { provider: string; model: string; online: boolean };
  database: { provider: string; persistent: boolean };
  voice: { available: boolean };
  engines: EngineStatus[];
  capabilities: Array<{ id: string; enabled: boolean }>;
  presence: string;
  scene: string;
  context: { phase?: string };
  identity: { userTitle: string };
}

const MUTE_STORAGE_KEY = "eden_voice_muted";

/** Finds complete sentences at the start of `text`. Returns each sentence
 *  (including its trailing punctuation/space) plus whatever's left over
 *  and not yet terminated by ./!/? */
function extractCompleteSentences(text: string): { sentences: string[]; rest: string } {
  const matches = text.match(/[^.!?]*[.!?]+(\s+|$)/g);
  if (!matches) return { sentences: [], rest: text };
  const consumed = matches.join("");
  return { sentences: matches.map((s) => s.trim()).filter(Boolean), rest: text.slice(consumed.length) };
}

export default function EdenShell() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const conversationId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generation counter: invalidates stale speech loops when a new message
  // is sent or voice is muted mid-reply.
  const speechGen = useRef(0);
  const speechQueueRef = useRef<Promise<string | null>[]>([]);
  const playerRunningRef = useRef(false);

  // Restore the mute preference once, on first mount, client-side only.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === "true");
    } catch {
      /* localStorage unavailable — default to unmuted */
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* HUD degrades gracefully */
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      /* HUD degrades gracefully */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshEvents();
    const id = setInterval(refreshEvents, 6000);
    return () => clearInterval(id);
  }, [refreshStatus, refreshEvents]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch {
        /* ignore — preference just won't persist */
      }
      if (next) {
        speechGen.current += 1;
        speechQueueRef.current = [];
        audioRef.current?.pause();
      }
      return next;
    });
  }, []);

  /** Fetches one sentence's audio clip. Never throws — a failed clip is
   *  just skipped rather than stalling the rest of the reply. */
  const fetchClip = useCallback(async (text: string, gen: number): Promise<string | null> => {
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (speechGen.current !== gen) return null; // superseded while downloading
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

  /** Plays whatever's in the speech queue, in order, gaplessly. Only one
   *  loop ever runs at a time; enqueueSentence starts it if it's idle. */
  const runPlayerLoop = useCallback(async (gen: number) => {
    if (playerRunningRef.current) return;
    playerRunningRef.current = true;
    try {
      const audio = audioRef.current;
      while (speechQueueRef.current.length > 0) {
        if (speechGen.current !== gen || !audio) return;
        const clip = speechQueueRef.current.shift();
        if (!clip) continue;
        const url = await clip;
        if (!url || speechGen.current !== gen) {
          if (url) URL.revokeObjectURL(url);
          continue;
        }
        audio.src = url;
        const finished = new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        await audio.play().catch(() => {
          /* autoplay can be blocked by the browser — the text reply already shown is enough */
        });
        await finished;
        URL.revokeObjectURL(url);
      }
    } finally {
      playerRunningRef.current = false;
    }
  }, []);

  const enqueueSentence = useCallback(
    (text: string, gen: number) => {
      if (!text.trim() || muted || !status?.voice.available) return;
      speechQueueRef.current.push(fetchClip(text, gen));
      runPlayerLoop(gen);
    },
    [muted, status?.voice.available, fetchClip, runPlayerLoop]
  );

  const sendIntent = useCallback(
    async (text: string) => {
      // Cut off anything still playing from the previous turn.
      const gen = ++speechGen.current;
      speechQueueRef.current = [];
      audioRef.current?.pause();

      setBusy(true);
      setReply(null);

      let fullText = "";
      let spokenUpTo = 0;

      const speakReadySentences = (finalFlush: boolean) => {
        const { sentences, rest } = extractCompleteSentences(fullText.slice(spokenUpTo));
        for (const sentence of sentences) {
          enqueueSentence(sentence, gen);
        }
        spokenUpTo = fullText.length - rest.length;
        if (finalFlush && rest.trim()) {
          enqueueSentence(rest.trim(), gen);
          spokenUpTo = fullText.length;
        }
      };

      try {
        const res = await fetch("/api/conversation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: conversationId.current }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          setReply(`Something went wrong: ${data.error ?? "unknown error"}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: { type: string; [key: string]: unknown };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === "conversationId") {
              conversationId.current = evt.conversationId as string;
            } else if (evt.type === "delta") {
              fullText += evt.text as string;
              setReply(fullText);
              speakReadySentences(false);
            } else if (evt.type === "error") {
              const message = (evt.error as string) || "Something went wrong.";
              fullText = fullText || message;
              setReply(fullText);
            } else if (evt.type === "done") {
              fullText = (evt.reply as string) ?? fullText;
              setReply(fullText);
            }
          }
        }

        speakReadySentences(true);
      } catch {
        setReply("I couldn't reach my own core. Check the deployment logs.");
      } finally {
        setBusy(false);
        refreshEvents();
        refreshStatus();
      }
    },
    [refreshEvents, refreshStatus, enqueueSentence]
  );

  const capsEnabled = status?.capabilities.filter((c) => c.enabled).length ?? 0;

  return (
    <main className="core-glow relative h-dvh w-full overflow-hidden">
      {/* The Eden Core */}
      <EdenOrb state={busy ? "thinking" : "idle"} />

      {/* Off-screen player for spoken replies */}
      <audio ref={audioRef} className="hidden" />

      <TopBar
        provider={status?.ai.provider ?? "…"}
        persistent={status?.database.persistent ?? false}
        presence={status?.presence ?? "unknown"}
        voiceAvailable={status?.voice.available ?? false}
        muted={muted}
        onToggleMute={toggleMute}
      />

      {/* Left rail — engines */}
      <div className="pointer-events-none absolute inset-y-0 left-5 z-10 hidden items-center lg:flex xl:left-8">
        <SystemPanel engines={status?.engines ?? []} />
      </div>

      {/* Right rail — context + event stream */}
      <div className="pointer-events-none absolute inset-y-0 right-5 z-10 hidden w-64 flex-col justify-center gap-3 lg:flex xl:right-8">
        <ContextPanel
          presence={status?.presence ?? "unknown"}
          scene={status?.scene ?? "ambient"}
          phase={status?.context?.phase ?? "—"}
          capabilitiesEnabled={capsEnabled}
          capabilitiesTotal={status?.capabilities.length ?? 0}
        />
        <div className="flex h-64 flex-col">
          <EventStream events={events} />
        </div>
      </div>

      {/* Bottom — Eden's reply + command bar */}
      <div className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl px-5 pb-6 sm:pb-8">
        {(reply || busy) && (
          <div className="hud-panel mb-3 max-h-56 overflow-y-auto px-5 py-4">
            {reply ? (
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink/95">
                {reply}
                {busy && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle bg-ink/60" />
                )}
              </p>
            ) : (
              <p className="font-hud text-[12px] tracking-widest text-dim">EDEN IS THINKING…</p>
            )}
          </div>
        )}
        <CommandBar onSubmit={sendIntent} busy={busy} />
        <p className="mt-2.5 text-center font-hud text-[10px] tracking-[0.25em] text-dim/60">
          HUMAN INTENTION IN · COMPLETED OUTCOMES OUT
        </p>
      </div>
    </main>
  );
}
