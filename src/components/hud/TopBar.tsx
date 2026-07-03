"use client";

import { useEffect, useState } from "react";

export default function TopBar({
  provider,
  persistent,
  presence,
  voiceAvailable,
  muted,
  onToggleMute,
}: {
  provider: string;
  persistent: boolean;
  presence: string;
  voiceAvailable: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const speakerTitle = !voiceAvailable
    ? "Voice not connected — add OPENAI_API_KEY"
    : muted
      ? "Unmute Eden"
      : "Mute Eden";

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-medium tracking-[0.55em] text-ink">EDEN</span>
        <span className="hud-label hidden sm:inline">AI Operating System</span>
      </div>
      <div className="flex items-center gap-4 font-hud text-[11px] text-dim">
        <span className="hidden items-center gap-2 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-pulseviolet dot-online" />
          {presence.toUpperCase()}
        </span>
        <span className="hidden items-center gap-2 md:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${provider === "offline" ? "bg-red-400" : "bg-pulseblue"} dot-online`}
          />
          {provider.toUpperCase()}
        </span>
        <span className="hidden items-center gap-2 md:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${persistent ? "bg-pulsemagenta" : "bg-yellow-400"} dot-online`}
          />
          {persistent ? "MEMORY: PERSISTENT" : "MEMORY: VOLATILE"}
        </span>
        <button
          type="button"
          onClick={onToggleMute}
          disabled={!voiceAvailable}
          title={speakerTitle}
          aria-label={speakerTitle}
          aria-pressed={muted}
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full text-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-dim"
        >
          {muted || !voiceAvailable ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M4 9v6h4l5 5V4L8 9H4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M4 9v6h4l5 5V4L8 9H4z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <span suppressHydrationWarning>{time}</span>
      </div>
    </header>
  );
}
