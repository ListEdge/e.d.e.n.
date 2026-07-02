"use client";

import { useEffect, useState } from "react";

export default function TopBar({
  provider,
  persistent,
  presence,
}: {
  provider: string;
  persistent: boolean;
  presence: string;
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
        <span suppressHydrationWarning>{time}</span>
      </div>
    </header>
  );
}
