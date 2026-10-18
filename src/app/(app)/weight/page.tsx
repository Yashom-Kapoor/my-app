import type { Metadata } from "next";
import { Suspense } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/line-chart";
import { createClient } from "@/lib/supabase/server";
import { formatDay, today } from "@/lib/nutrition";
import { WEIGHT_UNIT, weeklyAverages } from "@/lib/weight";
import { deleteWeight } from "./actions";
import { WeightForm } from "./_components/weight-form";

export const metadata: Metadata = { title: "Weight" };

export default function WeightPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Weight</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <WeightView />
      </Suspense>
    </div>
  );
}

async function WeightView() {
  const supabase = await createClient();
  const { data } = await supabase.from("weight_entries").select("logged_on, weight").order("logged_on");
  const entries = (data ?? []).map((e) => ({ ...e, weight: Number(e.weight) }));
  const todayStr = today();
  const weeks = weeklyAverages(entries);
  const latest = weeks.at(-1);
  const previous = weeks.at(-2);
  const delta = latest && previous ? Math.round((latest.avg - previous.avg) * 10) / 10 : null;
  const todays = entries.find((e) => e.logged_on === todayStr);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <WeightForm today={todayStr} unit={WEIGHT_UNIT} todaysWeight={todays?.weight} />
          {todays && (
            <p className="mt-2 text-xs text-muted-foreground">
              Today: {todays.weight} {WEIGHT_UNIT}. Saving again replaces it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly average</CardTitle>
          {latest && (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{latest.avg}</span>
              <span className="text-sm text-muted-foreground">{WEIGHT_UNIT}</span>
              {delta != null && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                  {Math.abs(delta)} vs last week
                </span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <LineChart
            points={weeks.map((w) => ({
              date: w.week,
              value: w.avg,
              detail: `avg · ${w.count} entr${w.count === 1 ? "y" : "ies"}`,
            }))}
            unit={WEIGHT_UNIT}
            end={todayStr}
            labelPrefix="Week of "
            ariaLabel={`Weekly average weight, ${weeks.length} weeks`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <ul className="divide-y">
              {entries
                .slice(-30)
                .reverse()
                .map((e) => (
                  <li key={e.logged_on} className="flex items-center justify-between py-2">
                    <span className="text-sm">{e.logged_on === todayStr ? "Today" : formatDay(e.logged_on)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {e.weight} {WEIGHT_UNIT}
                      </span>
                      <form action={deleteWeight.bind(null, e.logged_on)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${e.logged_on}`}>
                          <Trash2Icon />
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
