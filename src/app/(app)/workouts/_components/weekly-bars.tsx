"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Workouts per week as columns, with a hover/tap tooltip. */
export function WeeklyBars({ weeks }: { weeks: { week: string; label: string; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const H = 96;

  return (
    <div className="relative pl-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-full" style={{ height: H }} aria-hidden>
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-6 border-t border-border" style={{ bottom: (t / max) * H }}>
            <span className="absolute -top-2 -left-6 w-4 text-right text-[11px] leading-none tabular-nums text-muted-foreground">{t}</span>
          </div>
        ))}
      </div>
      <div className="relative flex items-end gap-0.5" style={{ height: H }} onPointerLeave={() => setActive(null)}>
        {weeks.map((w, i) => (
          <button
            key={w.week}
            type="button"
            className="group flex h-full flex-1 items-end justify-center"
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`Week of ${w.label}: ${w.count} workout${w.count === 1 ? "" : "s"}`}
          >
            <span
              className={cn(
                "w-full max-w-6 rounded-t-[4px] bg-chart-line transition-opacity",
                active != null && active !== i && "opacity-50",
              )}
              style={{ height: w.count ? Math.max(3, (w.count / max) * H) : 0 }}
            />
          </button>
        ))}
        {active != null && (
          <div
            className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 rounded-lg border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md"
            style={{ left: `${((active + 0.5) / weeks.length) * 100}%` }}
          >
            <span className="text-muted-foreground">Week of {weeks[active].label}: </span>
            <span className="font-semibold tabular-nums">{weeks[active].count}</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{weeks[0]?.label}</span>
        <span>This week</span>
      </div>
    </div>
  );
}
