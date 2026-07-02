"use client";

import { useState } from "react";

export default function CommandBar({
  onSubmit,
  busy,
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    onSubmit(text);
  };

  return (
    <div className="hud-panel pointer-events-auto flex items-center gap-3 px-4 py-3">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${busy ? "bg-pulsemagenta dot-online" : "bg-pulseblue"}`}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="State your intent…"
        disabled={busy}
        autoFocus
        className="w-full bg-transparent font-display text-[15px] text-ink placeholder:text-dim/70 focus:outline-none disabled:opacity-50"
        aria-label="Command Eden"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="shrink-0 font-hud text-[10px] tracking-[0.2em] text-dim transition-colors hover:text-ink disabled:opacity-40"
      >
        SEND
      </button>
    </div>
  );
}
