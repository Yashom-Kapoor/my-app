"use client";

import { useEffect, useRef, useState } from "react";
import { TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/workouts";

export type RestState = { endsAt: number; duration: number };

/** Sticky countdown bar. Beeps and vibrates once when it reaches zero. */
export function RestTimer({
  rest,
  onChange,
  beep,
}: {
  rest: RestState | null;
  onChange: (rest: RestState | null) => void;
  beep: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const alertedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.endsAt && alertedFor.current !== rest.endsAt) {
        alertedFor.current = rest.endsAt;
        beep();
        navigator.vibrate?.([200, 100, 200]);
      }
      // Hide a few seconds after it finishes.
      if (t >= rest.endsAt + 4000) onChange(null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rest, onChange, beep]);

  if (!rest || now == null) return null;
  const remaining = Math.ceil((rest.endsAt - now) / 1000);
  const done = remaining <= 0;
  const pct = Math.min(100, Math.max(0, ((rest.duration * 1000 - (rest.endsAt - now)) / (rest.duration * 1000)) * 100));

  const adjust = (delta: number) =>
    onChange({ endsAt: Math.max(Date.now(), rest.endsAt + delta * 1000), duration: Math.max(1, rest.duration + delta) });

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-4 md:left-56">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border bg-popover shadow-lg">
        <div className="h-1 bg-muted">
          <div className="h-full bg-chart-line transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <TimerIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-lg font-semibold tabular-nums" aria-live="polite">
            {done ? "Rest done" : formatClock(remaining)}
          </span>
          {!done && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => adjust(-15)}>
                −15s
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => adjust(15)}>
                +15s
              </Button>
            </>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange(null)}>
            {done ? "Close" : "Skip"}
          </Button>
        </div>
      </div>
    </div>
  );
}
