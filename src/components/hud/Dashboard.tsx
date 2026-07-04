"use client";

export interface DashboardItem {
  title: string;
  detail?: string;
  url?: string;
  imageUrl?: string;
}

export interface DashboardData {
  title: string;
  summary?: string;
  items?: DashboardItem[];
}

export interface DashboardEntry {
  id: number;
  data: DashboardData;
}

/**
 * Same element structure for both variants, deliberately - only the
 * classes differ. That's what lets a card smoothly shrink into "previous"
 * instead of disappearing and being replaced: React sees the same
 * component at the same key and patches it in place, so the CSS
 * transition actually has something continuous to animate between.
 *
 * The "previous" treatment is deliberately dramatic, not subtle - a real
 * card-stack look: noticeably narrower, noticeably smaller, tucked partly
 * behind the current card via a negative margin, sitting at a lower
 * z-index so it visibly reads as "pushed back," not just "slightly dimmed."
 */
function DashboardCard(props: {
  data: DashboardData;
  variant: "current" | "previous";
  onDismiss: () => void;
}) {
  const data = props.data;
  const onDismiss = props.onDismiss;
  const isPrevious = props.variant === "previous";

  const cardClass = isPrevious
    ? "hud-panel pointer-events-auto relative z-0 w-[72%] max-w-sm scale-[0.8] -mb-5 overflow-hidden px-4 py-2 opacity-40 transition-all duration-700 ease-out"
    : "hud-panel pointer-events-auto relative z-10 w-full max-w-xl overflow-hidden px-5 py-4 dashboard-zip-in opacity-100 transition-all duration-700 ease-out";

  const titleClass = isPrevious
    ? "truncate font-medium leading-snug text-ink transition-all duration-700 text-[12px]"
    : "truncate font-medium leading-snug text-ink transition-all duration-700 text-[16px]";

  const closeLabel = isPrevious ? "X" : "CLOSE";

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className={titleClass}>{data.title}</h2>
          {!isPrevious && data.summary && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{data.summary}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full px-2.5 py-1 font-hud text-[10px] tracking-widest text-dim transition-colors hover:text-ink"
          aria-label="Dismiss"
        >
          {closeLabel}
        </button>
      </div>

      {!isPrevious && data.items && data.items.length > 0 && (
        <div className="mt-3 flex max-h-[34vh] flex-col gap-2 overflow-y-auto border-t border-white/5 pt-3">
          {data.items.map((item, i) => {
            const hasUrl = Boolean(item.url);
            const itemClass = hasUrl
              ? "rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-pulseblue/30 hover:bg-white/[0.04]"
              : "rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5";

            const itemBody = (
              <div className="flex items-center gap-3">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                    onError={function hideBrokenImage(event) {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium leading-snug text-ink/95">{item.title}</p>
                  {item.detail && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-dim">{item.detail}</p>
                  )}
                </div>
              </div>
            );

            if (hasUrl) {
              return (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={itemClass}
                >
                  {itemBody}
                </a>
              );
            }

            return (
              <div key={i} className={itemClass}>
                {itemBody}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A small stack, newest at the front (bottom, most prominent). No gap
 * between entries - the negative margin on the "previous" card is what
 * creates the intentional tucked-behind overlap, so an extra gap would
 * fight that rather than help it.
 */
export default function Dashboard(props: {
  entries: DashboardEntry[];
  onDismiss: (id: number) => void;
}) {
  const entries = props.entries;
  const onDismiss = props.onDismiss;

  if (entries.length === 0) return null;
  const currentIndex = entries.length - 1;

  return (
    <div className="flex w-full max-w-xl flex-col items-center">
      {entries.map((entry, i) => {
        const variant = i === currentIndex ? "current" : "previous";
        return (
          <DashboardCard
            key={entry.id}
            data={entry.data}
            variant={variant}
            onDismiss={() => onDismiss(entry.id)}
          />
        );
      })}
    </div>
  );
}
