"use client";

export interface EngineStatus {
  id: string;
  name: string;
  online: boolean;
}

export default function SystemPanel({ engines }: { engines: EngineStatus[] }) {
  return (
    <aside className="hud-panel pointer-events-auto hidden w-56 p-4 lg:block">
      <p className="hud-label mb-3">Engines</p>
      <ul className="space-y-2">
        {engines.map((engine) => (
          <li key={engine.id} className="flex items-center gap-2.5 font-hud text-[11px] text-dim">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${engine.online ? "bg-emerald-400 dot-online" : "bg-red-400"}`}
            />
            {engine.name.replace(" Engine", "")}
          </li>
        ))}
      </ul>
    </aside>
  );
}
