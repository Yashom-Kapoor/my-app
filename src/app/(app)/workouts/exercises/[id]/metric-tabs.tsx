"use client";

import { useState } from "react";
import { LineChart, type ChartPoint } from "@/components/line-chart";
import { cn } from "@/lib/utils";

type Metric = { key: string; label: string; unit: string; points: ChartPoint[] };

export function MetricTabs({ metrics, end }: { metrics: Metric[]; end: string }) {
  const [key, setKey] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];
  const latest = metric.points.at(-1);

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium" role="tablist">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === key}
            onClick={() => setKey(m.key)}
            className={cn("flex-1 rounded-md px-2.5 py-1 text-muted-foreground", m.key === key && "bg-background text-foreground shadow-sm")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {latest && (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{latest.value.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">{metric.unit} · last session</span>
        </div>
      )}
      <LineChart key={metric.key} points={metric.points} unit={metric.unit} end={end} ariaLabel={`${metric.label} per session`} defaultRange="all" />
    </div>
  );
}
