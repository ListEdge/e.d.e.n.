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

export interface MindMapNode {
  id: number;
  label: string;
  detail?: string;
  parentId: number | null;
}

export interface DashboardData {
  title: string;
  summary?: string;
  items?: DashboardItem[];
  chart?: DashboardChart;
  mindmap?: MindMapNode[];
  /** Already-sanitized SVG markup, safe to render directly - sanitization
   *  happens once, at the point AI-generated content enters the client,
   *  in RealtimeVoice.tsx. Never trust this field if it originates
   *  anywhere else. */
  customGraphic?: string;
}

export interface DashboardSlot {
  id: number;
  region: DashboardRegion;
  data: DashboardData;
}

export function friendlyRegionName(region: DashboardRegion): string {
  if (region === "topLeft") return "top left";
  if (region === "topRight") return "top right";
  if (region === "bottomLeft") return "bottom left";
  if (region === "bottomRight") return "bottom right";
  return "middle";
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

/**
 * Pure radial-tree layout - no graph library. Each node gets an angular
 * slice proportional to how many leaf descendants it has, so siblings
 * never overlap by construction, at any depth or branching factor.
 * Radius grows with depth so generations fan outward from the root.
 */
function layoutMindMap(nodes: MindMapNode[]): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();
  const childrenOf = new Map<number, MindMapNode[]>();
  let root: MindMapNode | undefined;

  for (const n of nodes) {
    if (n.parentId === null) {
      root = n;
    } else {
      const list = childrenOf.get(n.parentId) ?? [];
      list.push(n);
      childrenOf.set(n.parentId, list);
    }
  }
  if (!root) return positions;

  function countLeaves(nodeId: number): number {
    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) return 1;
    return children.reduce(function (sum, c) {
      return sum + countLeaves(c.id);
    }, 0);
  }

  function assign(nodeId: number, startAngle: number, endAngle: number, depth: number) {
    const midAngle = (startAngle + endAngle) / 2;
    const radius = depth * 100;
    positions.set(nodeId, { x: radius * Math.cos(midAngle), y: radius * Math.sin(midAngle) });

    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) return;
    const totalLeaves = children.reduce(function (sum, c) {
      return sum + countLeaves(c.id);
    }, 0);
    let currentAngle = startAngle;
    for (const child of children) {
      const share = countLeaves(child.id) / totalLeaves;
      const childEndAngle = currentAngle + share * (endAngle - startAngle);
      assign(child.id, currentAngle, childEndAngle, depth + 1);
      currentAngle = childEndAngle;
    }
  }

  assign(root.id, 0, Math.PI * 2, 0);
  return positions;
}

function MindMapView(props: { nodes: MindMapNode[] }) {
  const nodes = props.nodes;
  const positions = layoutMindMap(nodes);
  if (positions.size === 0) return null;

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  positions.forEach(function (p) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const padding = 90;
  const viewMinX = minX - padding;
  const viewMinY = minY - padding;
  const viewWidth = maxX - minX + padding * 2;
  const viewHeight = maxY - minY + padding * 2;

  return (
    <svg
      viewBox={viewMinX + " " + viewMinY + " " + viewWidth + " " + viewHeight}
      className="h-full w-full"
    >
      {nodes.map(function (n) {
        if (n.parentId === null) return null;
        const from = positions.get(n.parentId);
        const to = positions.get(n.id);
        if (!from || !to) return null;
        return (
          <line
            key={"edge-" + n.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#8B6CFF"
            strokeOpacity={0.35}
            strokeWidth={1.5}
          />
        );
      })}
      {nodes.map(function (n) {
        const pos = positions.get(n.id);
        if (!pos) return null;
        const isRoot = n.parentId === null;
        return (
          <g key={"node-" + n.id} transform={"translate(" + pos.x + "," + pos.y + ")"}>
            <circle r={isRoot ? 8 : 5} fill={isRoot ? "#E23FFF" : "#3B7BFF"} />
            <text
              x={0}
              y={isRoot ? -14 : -10}
              fontSize={isRoot ? 13 : 10}
              textAnchor="middle"
              fill="#E8E6F5"
              fontWeight={isRoot ? 600 : 400}
            >
              {n.label.length > 24 ? n.label.slice(0, 24) + "…" : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const ALLOWED_SVG_TAGS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "defs", "lineargradient", "radialgradient", "stop",
  "animate", "animatetransform", "animatemotion", "marker", "clippath",
  "title", "desc", "use",
]);

const ALLOWED_SVG_ATTRS = new Set([
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "fill", "stroke", "stroke-width",
  "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
  "fill-opacity", "stroke-opacity", "transform", "viewbox", "class", "id",
  "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline",
  "offset", "stop-color", "stop-opacity", "attributename", "from", "to",
  "dur", "repeatcount", "values", "keytimes", "begin", "path",
  "gradientunits", "gradienttransform", "markerwidth", "markerheight",
  "orient", "refx", "refy", "preserveaspectratio", "xmlns",
]);

/**
 * Strict allowlist sanitizer for AI-generated SVG. This is the actual
 * security boundary, not the prompt asking the model to behave - never
 * trust generated markup by construction. Anything not on the allowlist
 * is removed outright: unknown elements are deleted entirely, unknown
 * attributes are stripped from elements that are otherwise kept. Every
 * event-handler-style attribute (onclick, onload, etc.), every inline
 * style attribute, and every external reference (href must be a local
 * #fragment or it's removed) is stripped unconditionally, regardless of
 * the allowlist. Returns null if the input doesn't even parse as SVG.
 */
export function sanitizeSvg(rawSvg: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;

    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;

    function cleanAttributes(el: Element) {
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith("on")) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (attrName === "style") {
          el.removeAttribute(attr.name);
          continue;
        }
        if (attrName === "href" || attrName === "xlink:href") {
          if (!attr.value.startsWith("#")) el.removeAttribute(attr.name);
          continue;
        }
        if (!ALLOWED_SVG_ATTRS.has(attrName)) {
          el.removeAttribute(attr.name);
        }
      }
    }

    function clean(node: Element) {
      for (const child of Array.from(node.children)) {
        if (!ALLOWED_SVG_TAGS.has(child.tagName.toLowerCase())) {
          child.remove();
          continue;
        }
        cleanAttributes(child);
        clean(child);
      }
    }

    cleanAttributes(root);
    clean(root);

    if (!root.getAttribute("viewBox")) {
      root.setAttribute("viewBox", "0 0 300 200");
    }

    return root.outerHTML;
  } catch {
    return null;
  }
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

      {data.mindmap && data.mindmap.length > 0 ? (
        <div className="mt-2 min-h-0 flex-1">
          <MindMapView nodes={data.mindmap} />
        </div>
      ) : null}

      {data.customGraphic ? (
        <div
          className="mt-2 min-h-0 flex-1 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: data.customGraphic }}
        />
      ) : null}

      {data.chart && data.chart.values && data.chart.values.length > 0 ? (
        <div className="mt-2">
          <BarChart chart={data.chart} />
        </div>
      ) : null}

      {data.items && data.items.length > 0 ? (
        <div className="mt-2 flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {data.items.slice(0, full ? 12 : 8).map(function (item, i) {
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
    <div className="grid h-full w-full grid-cols-1 grid-rows-4 gap-2 sm:grid-cols-2 sm:grid-rows-2 sm:gap-3">
      <div className="overflow-hidden sm:col-start-1 sm:row-start-1">
        {topLeft ? <DashboardCard key={topLeft.id} data={topLeft.data} full={false} /> : null}
      </div>
      <div className="overflow-hidden sm:col-start-2 sm:row-start-1">
        {topRight ? <DashboardCard key={topRight.id} data={topRight.data} full={false} /> : null}
      </div>
      <div className="overflow-hidden sm:col-start-1 sm:row-start-2">
        {bottomLeft ? <DashboardCard key={bottomLeft.id} data={bottomLeft.data} full={false} /> : null}
      </div>
      <div className="overflow-hidden sm:col-start-2 sm:row-start-2">
        {bottomRight ? <DashboardCard key={bottomRight.id} data={bottomRight.data} full={false} /> : null}
      </div>
    </div>
  );
}
