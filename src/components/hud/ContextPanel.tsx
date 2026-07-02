"use client";

export default function ContextPanel({
  presence,
  scene,
  phase,
  capabilitiesEnabled,
  capabilitiesTotal,
}: {
  presence: string;
  scene: string;
  phase: string;
  capabilitiesEnabled: number;
  capabilitiesTotal: number;
}) {
  const rows = [
    ["Presence", presence],
    ["Scene", scene.replace("_", " ")],
    ["Phase", phase],
    ["Capabilities", `${capabilitiesEnabled} / ${capabilitiesTotal}`],
  ];
  return (
    <div className="hud-panel pointer-events-auto p-4">
      <p className="hud-label mb-3">Context</p>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-6">
            <dt className="font-hud text-[11px] text-dim">{label}</dt>
            <dd className="font-hud text-[11px] uppercase text-ink/90">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
