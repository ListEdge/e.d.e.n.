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
      if (next) audioRef.current?.pause();
      return next;
    });
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (muted || !status?.voice.available || !audioRef.current) return;
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return; // voice failing is never allowed to disrupt the text reply
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = audioRef.current;
        audio.src = url;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play().catch(() => {
          /* autoplay can be blocked by the browser — the text reply already shown is enough */
        });
      } catch {
        /* voice is a bonus, never a blocker */
      }
    },
    [muted, status?.voice.available]
  );

  const sendIntent = useCallback(
    async (text: string) => {
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
