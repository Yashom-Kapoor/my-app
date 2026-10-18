"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/dates";

export type ChartPoint = { date: string; value: number; detail?: string };

const RANGES = [
  { key: "1m", label: "1M", weeks: 5 },
  { key: "3m", label: "3M", weeks: 13 },
  { key: "6m", label: "6M", weeks: 26 },
  { key: "1y", label: "1Y", weeks: 52 },
  { key: "all", label: "All", weeks: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

function dateMs(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** ~4 clean y ticks covering [min, max]. */
function niceTicks(min: number, max: number) {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 10) / 10);
  return { lo, hi, ticks };
}

type Props = {
  points: ChartPoint[];
  unit: string;
  /** Latest date the range picker counts back from (usually today). */
  end: string;
  /** Prefix for the tooltip date, e.g. "Week of ". */
  labelPrefix?: string;
  ariaLabel: string;
  defaultRange?: RangeKey;
};

/** Single-series line chart over dates with a range picker and hover tooltip. */
export function LineChart({ points: allPoints, unit, end, labelPrefix = "", ariaLabel, defaultRange = "6m" }: Props) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    if (r.weeks === Infinity) return allPoints;
    const from = addDays(end, -7 * r.weeks);
    return allPoints.filter((p) => p.date > from);
  }, [allPoints, range, end]);

  const geo = useMemo(() => {
    if (shown.length === 0 || width === 0) return null;
    const { lo, hi, ticks } = niceTicks(Math.min(...shown.map((p) => p.value)), Math.max(...shown.map((p) => p.value)));
    const x0 = dateMs(shown[0].date);
    const x1 = dateMs(shown[shown.length - 1].date);
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (date: string) => PAD.left + (x1 === x0 ? innerW / 2 : ((dateMs(date) - x0) / (x1 - x0)) * innerW);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * innerH;
    const points = shown.map((p) => ({ ...p, px: x(p.date), py: y(p.value) }));
    const xTickCount = Math.max(2, Math.min(5, Math.floor(innerW / 90)));
    const xTicks = Array.from({ length: Math.min(xTickCount, points.length) }, (_, i) =>
      points[Math.round((i * (points.length - 1)) / Math.max(1, Math.min(xTickCount, points.length) - 1))],
    );
    return { points, ticks, y, xTicks };
  }, [shown, width]);

  const active = hover != null && geo ? geo.points[hover] : null;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    if (!geo) return;
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left + PAD.left;
    let best = 0;
    geo.points.forEach((p, i) => {
      if (Math.abs(p.px - mx) < Math.abs(geo.points[best].px - mx)) best = i;
    });
    setHover(best);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "rounded-md px-2.5 py-1 text-muted-foreground transition-colors",
                range === r.key && "bg-background text-foreground shadow-sm",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {shown.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nothing in this range yet.
          </div>
        ) : (
          geo && (
            <svg width={width} height={HEIGHT} className="overflow-visible" role="img" aria-label={ariaLabel}>
              {geo.ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="stroke-border" strokeWidth={1} />
                  <text x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {geo.xTicks.map((p) => (
                <text key={p.date} x={p.px} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {formatDate(p.date)}
                </text>
              ))}

              <path
                d={`M${geo.points[0].px},${HEIGHT - PAD.bottom} ${geo.points.map((p) => `L${p.px},${p.py}`).join(" ")} L${geo.points[geo.points.length - 1].px},${HEIGHT - PAD.bottom} Z`}
                className="fill-chart-line/10"
              />
              <polyline
                points={geo.points.map((p) => `${p.px},${p.py}`).join(" ")}
                fill="none"
                className="stroke-chart-line"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {active && (
                <line x1={active.px} x2={active.px} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-muted-foreground/40" strokeWidth={1} />
              )}
              {geo.points.map((p, i) =>
                i === geo.points.length - 1 || i === hover ? (
                  <circle key={p.date} cx={p.px} cy={p.py} r={4.5} className="fill-chart-line stroke-card" strokeWidth={2} />
                ) : null,
              )}

              <rect
                x={PAD.left}
                y={0}
                width={Math.max(0, width - PAD.left - PAD.right)}
                height={HEIGHT}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHover(null)}
              />
            </svg>
          )
        )}

        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(active.px, 70), width - 70),
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-muted-foreground">
              {labelPrefix}
              {formatDate(active.date)}
            </div>
            <div className="font-semibold tabular-nums text-foreground">
              {active.value} {unit}
              {active.detail && <span className="font-normal text-muted-foreground"> {active.detail}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
