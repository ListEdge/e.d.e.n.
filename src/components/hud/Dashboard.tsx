"use client";

export type DashboardRegion = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "full";
export type DashboardSize = "quadrant" | "full";

export interface DashboardItem {
  title: string;
  detail?: string;
  url?: string;
  imageUrl?: string;
}

export interface DashboardChart {
  labels: string[];
  values: number[];
}

export interface DashboardData {
  title: string;
  summary?: string;
  items?: DashboardItem[];
  chart?: DashboardChart;
}

export interface DashboardSlot {
  id: number;
  region: DashboardRegion;
  data: DashboardData;
}

/** A plain hand-built SVG bar chart - no charting library. */
function BarChart(props: { chart: DashboardChart }) {
  const values = props.chart.values;
  const labels = props.chart.labels;
  const max = values.reduce(function (a, b) {
    return Math.max(a, b);
  }, 0) || 1;

  const width = 100;
  const height = 56;
  const gap = 2;
  const count = values.length;
  const barWidth = count > 0 ? (width - gap * (count - 1)) / count : width;

  return (
    <svg viewBox={"0 0 " + width + " " + (height + 12)} className="w-full" style={{ maxHeight: "150px" }}>
      <defs>
        <linearGradient id="edenBarGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3B7BFF" />
          <stop offset="100%" stopColor="#E23FFF" />
        </linearGradient>
      </defs>
      {values.map(function (value, i) {
        const barHeight = max > 0 ? (Math.max(value, 0) / max) * height : 0;
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const label = labels[i] ? String(labels[i]).slice(0, 8) : "";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={1} fill="url(#edenBarGradient)" />
            <text x={x + barWidth / 2} y={height + 9} fontSize="4.2" textAnchor="middle" fill="#8E88AD">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DashboardCard(props: { data: DashboardData; full: boolean }) {
  const data = props.data;
  const full = props.full;
  const titleClass = full
    ? "truncate text-[16px] font-medium leading-snug text-ink"
    : "truncate text-[12.5px] font-medium leading-snug text-ink";
  const summaryClass = full
    ? "mt-1 text-[13px] leading-relaxed text-ink/80"
    : "mt-0.5 text-[10.5px] leading-snug text-ink/80";

  return (
    <div className="hud-panel dashboard-zip-in pointer-events-auto flex h-full w-full flex-col overflow-hidden px-4 py-3">
      <h2 className={titleClass}>{data.title}</h2>
      {data.summary ? <p className={summaryClass}>{data.summary}</p> : null}

      {data.chart && data.chart.values && data.chart.values.length > 0 ? (
        <div className="mt-2">
          <BarChart chart={data.chart} />
        </div>
      ) : null}

      {data.items && data.items.length > 0 ? (
        <div className="mt-2 flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {data.items.slice(0, full ? 12 : 4).map(function (item, i) {
            const hasUrl = Boolean(item.url);
            const itemClass = hasUrl
              ? "rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2 transition-colors hover:border-pulseblue/30 hover:bg-white/[0.04]"
              : "rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2";

            const body = (
              <div className="flex items-center gap-2">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-8 w-8 shrink-0 rounded object-cover"
                    onError={function (e) {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium leading-snug text-ink/95">{item.title}</p>
                  {item.detail && full ? (
                    <p className="mt-0.5 truncate text-[10.5px] leading-snug text-dim">{item.detail}</p>
                  ) : null}
                </div>
              </div>
            );

            if (hasUrl) {
              return (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={itemClass}>
                  {body}
                </a>
              );
            }
            return (
              <div key={i} className={itemClass}>
                {body}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A 2x2 grid of independent corners, plus a "full" mode that takes the
 * whole area for one prominent item. Nothing renders for an empty
 * corner - no borders, no placeholders, zero visual presence until
 * something actually occupies it.
 */
export default function Dashboard(props: { slots: DashboardSlot[] }) {
  const slots = props.slots;
  if (slots.length === 0) return null;

  const fullSlot = slots.find(function (s) {
    return s.region === "full";
  });

  if (fullSlot) {
    return (
      <div className="mx-auto h-full w-full max-w-2xl">
        <DashboardCard key={fullSlot.id} data={fullSlot.data} full />
      </div>
    );
  }

  const topLeft = slots.find(function (s) {
    return s.region === "topLeft";
  });
  const topRight = slots.find(function (s) {
    return s.region === "topRight";
  });
  const bottomLeft = slots.find(function (s) {
    return s.region === "bottomLeft";
  });
  const bottomRight = slots.find(function (s) {
    return s.region === "bottomRight";
  });

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-3">
      <div className="col-start-1 row-start-1 overflow-hidden">
        {topLeft ? <DashboardCard key={topLeft.id} data={topLeft.data} full={false} /> : null}
      </div>
      <div className="col-start-2 row-start-1 overflow-hidden">
        {topRight ? <DashboardCard key={topRight.id} data={topRight.data} full={false} /> : null}
      </div>
      <div className="col-start-1 row-start-2 overflow-hidden">
        {bottomLeft ? <DashboardCard key={bottomLeft.id} data={bottomLeft.data} full={false} /> : null}
      </div>
      <div className="col-start-2 row-start-2 overflow-hidden">
        {bottomRight ? <DashboardCard key={bottomRight.id} data={bottomRight.data} full={false} /> : null}
      </div>
    </div>
  );
}
