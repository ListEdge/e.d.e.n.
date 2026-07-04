"use client";

export interface DashboardItem {
  title: string;
  detail?: string;
  url?: string;
}

export interface DashboardData {
  title: string;
  summary?: string;
  items?: DashboardItem[];
}

/**
 * A floating panel Eden uses to show things, not just describe them —
 * search results, comparisons, lists. Triggered by the show_dashboard
 * tool (registered in CapabilityManager); the tool's result is exactly
 * this shape, so nothing translates it — it's just rendered directly.
 */
export default function Dashboard({
  data,
  onDismiss,
}: {
  data: DashboardData | null;
  onDismiss: () => void;
}) {
  if (!data) return null;

  return (
    <div
      key={data.title + (data.items?.length ?? 0)}
      className="hud-panel dashboard-zip-in pointer-events-auto mx-auto w-full max-w-xl px-5 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium leading-snug text-ink">{data.title}</h2>
          {data.summary && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{data.summary}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full px-2.5 py-1 font-hud text-[10px] tracking-widest text-dim transition-colors hover:text-ink"
          aria-label="Dismiss"
        >
          CLOSE
        </button>
      </div>

      {data.items && data.items.length > 0 && (
        <div className="mt-3 flex max-h-[46vh] flex-col gap-2 overflow-y-auto border-t border-white/5 pt-3">
          {data.items.map((item, i) => {
            const Wrapper = item.url ? "a" : "div";
            return (
              <Wrapper
                key={i}
                {...(item.url ? { href: item.url, target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 ${
                  item.url ? "transition-colors hover:border-pulseblue/30 hover:bg-white/[0.04]" : ""
                }`}
              >
                <p className="text-[13.5px] font-medium leading-snug text-ink/95">{item.title}</p>
                {item.detail && (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-dim">{item.detail}</p>
                )}
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
