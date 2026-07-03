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

export default function EdenShell() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const conversationId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechGen = useRef(0);

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
        speechGen.current += 1; // stop any in-flight speaking loop
        audioRef.current?.pause();
      }
      return next;
    });
  }, []);

  /**
   * Splits a reply into speakable sentences so they can be synthesized in
   * parallel. Tiny leftover fragments (e.g. after "Mr.") get folded into
   * the previous chunk rather than spoken as their own clip.
   */
  const splitIntoSentences = (text: string): string[] => {
    const matches = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
    const parts = (matches ?? [text]).map((s) => s.trim()).filter(Boolean);
    const merged: string[] = [];
    for (const part of parts) {
      if (merged.length > 0 && part.length < 8) {
        merged[merged.length - 1] += " " + part;
      } else {
        merged.push(part);
      }
    }
    return merged.length > 0 ? merged : [text];
  };

  const speak = useCallback(
    async (text: string) => {
      if (muted || !status?.voice.available || !audioRef.current) return;
      const audio = audioRef.current;
      const myGen = ++speechGen.current;

      const chunks = splitIntoSentences(text);

      // Fire every sentence's TTS request at once. This is what actually
      // buys the speed: sentence one is ready far sooner than the whole
      // reply would have been, and by the time it finishes playing the
      // next sentence is very likely ready too — so it sounds continuous.
      const pending = chunks.map((chunk) =>
        fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: chunk }),
        })
          .then((res) => (res.ok ? res.blob() : null))
          .then((blob) => (blob ? URL.createObjectURL(blob) : null))
          .catch(() => null)
      );

      for (const clip of pending) {
        if (speechGen.current !== myGen) return; // a newer reply took over
        const url = await clip;
        if (!url) continue; // that sentence failed to synthesize — skip it, don't stall the rest
        if (speechGen.current !== myGen) {
          URL.revokeObjectURL(url);
          return;
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
    },
    [muted, status?.voice.available]
  );

  const sendIntent = useCallback(
    async (text: string) => {
      speechGen.current += 1; // cut off any speech still playing from the last reply
      audioRef.current?.pause();
      setBusy(true);
      setReply(null);
      try {
        const res = await fetch("/api/conversation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: conversationId.current }),
        });
        const data = await res.json();
        if (res.ok) {
          conversationId.current = data.conversationId;
          setReply(data.reply);
          speak(data.reply);
        } else {
          setReply(`Something went wrong: ${data.error ?? "unknown error"}`);
        }
      } catch {
        setReply("I couldn't reach my own core. Check the deployment logs.");
      } finally {
        setBusy(false);
        refreshEvents();
        refreshStatus();
      }
    },
    [refreshEvents, refreshStatus, speak]
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
            {busy ? (
              <p className="font-hud text-[12px] tracking-widest text-dim">EDEN IS THINKING…</p>
            ) : (
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink/95">
                {reply}
              </p>
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
