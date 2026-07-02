"use client";

export interface StreamEvent {
  id: string;
  type: string;
  source: string;
  at: string;
}

export default function EventStream({ events }: { events: StreamEvent[] }) {
  return (
    <div className="hud-panel pointer-events-auto flex min-h-0 flex-1 flex-col p-4">
      <p className="hud-label mb-3">Event Bus</p>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
        {events.length === 0 && (
          <li className="font-hud text-[11px] text-dim">Quiet. Awaiting intent.</li>
        )}
        {events.slice(0, 9).map((event) => (
          <li key={event.id} className="flex items-baseline justify-between gap-3">
            <span className="truncate font-hud text-[11px] text-ink/80">{event.type}</span>
            <span className="shrink-0 font-hud text-[10px] text-dim">
              {new Date(event.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
