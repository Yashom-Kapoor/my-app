import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DumbbellIcon, LayoutListIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, dateOf, formatDay, today, weekStart } from "@/lib/dates";
import { WEIGHT_UNIT } from "@/lib/weight";
import { MUSCLE_GROUPS, formatDuration, setVolume, weeklyCounts } from "@/lib/workouts";
import { startWorkout } from "./actions";
import { getActiveWorkoutId, getRecentWorkouts, getTemplates, getWorkoutDatesSince } from "./data";
import { WeeklyBars } from "./_components/weekly-bars";

export const metadata: Metadata = { title: "Workouts" };

const WEEKS = 12;

export default function WorkoutsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Workouts</h1>
        <div className="flex gap-1">
          <Link href="/workouts/exercises" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <DumbbellIcon /> Exercises
          </Link>
          <Link href="/workouts/templates" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <LayoutListIcon /> Templates
          </Link>
        </div>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <WorkoutsHome />
      </Suspense>
    </div>
  );
}

async function WorkoutsHome() {
  await connection();
  const todayStr = today();
  const since = addDays(weekStart(todayStr), -7 * (WEEKS - 1));
  const [activeId, templates, recent, dates] = await Promise.all([
    getActiveWorkoutId(),
    getTemplates(),
    getRecentWorkouts(),
    getWorkoutDatesSince(`${since}T00:00:00Z`),
  ]);

  const weeks = weeklyCounts(dates.map(dateOf), todayStr, WEEKS).map((w) => ({
    ...w,
    label: new Date(`${w.week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  }));

  // Sets per muscle group this week.
  const thisWeek = weekStart(todayStr);
  const muscleSets = new Map<string, number>();
  for (const w of recent) {
    if (dateOf(w.started_at) < thisWeek) continue;
    for (const we of w.workout_exercises) {
      if (!we.exercise) continue;
      muscleSets.set(we.exercise.muscle_group, (muscleSets.get(we.exercise.muscle_group) ?? 0) + we.workout_sets.length);
    }
  }
  const muscleRows = MUSCLE_GROUPS.filter((m) => muscleSets.has(m.key)).map((m) => ({ ...m, sets: muscleSets.get(m.key)! }));
  const maxMuscle = Math.max(1, ...muscleRows.map((m) => m.sets));

  return (
    <div className="space-y-4">
      {activeId ? (
        <Link href={`/workouts/${activeId}`} className="block">
          <Card className="border-emerald-500/40 bg-emerald-500/5 transition-colors hover:bg-emerald-500/10">
            <CardContent className="flex items-center gap-3">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="flex-1 font-medium">Workout in progress</span>
              <span className="text-sm text-muted-foreground">Resume →</span>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <form action={startWorkout}>
          <Button type="submit" size="lg" className="h-11 w-full">
            <PlayIcon /> Start empty workout
          </Button>
        </form>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Templates</CardTitle>
          <Link href="/workouts/templates" className="text-xs text-muted-foreground hover:text-foreground">
            Manage
          </Link>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. <Link href="/workouts/templates" className="underline underline-offset-2">Create one</Link>, or save a
              finished workout as a template.
            </p>
          ) : (
            <ul className="divide-y">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.template_exercises.map((te) => te.exercise?.name).join(", ") || "No exercises"}
                    </div>
                  </div>
                  {!activeId && (
                    <form action={startWorkout}>
                      <input type="hidden" name="template_id" value={t.id} />
                      <Button type="submit" size="sm" variant="secondary" disabled={t.template_exercises.length === 0}>
                        <PlayIcon /> Start
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workouts per week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <WeeklyBars weeks={weeks} />
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Sets per muscle group this week</div>
            {muscleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet this week.</p>
            ) : (
              <ul className="space-y-1.5">
                {muscleRows.map((m) => (
                  <li key={m.key} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="h-2.5 rounded-r-[4px] bg-chart-line" style={{ width: `${(m.sets / maxMuscle) * 100}%` }} />
                    <span className="text-right tabular-nums">{m.sets}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Finished workouts show up here.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((w) => {
                const sets = w.workout_exercises.flatMap((we) => we.workout_sets);
                const volume = Math.round(sets.reduce((sum, s) => sum + setVolume({ weight: s.weight, reps: s.reps }), 0));
                return (
                  <li key={w.id} className="flex items-center gap-2 py-2.5">
                    <Link href={`/workouts/${w.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{w.name}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {formatDay(dateOf(w.started_at))} · {formatDuration(Date.parse(w.ended_at!) - Date.parse(w.started_at))} ·{" "}
                        {sets.length} sets{volume > 0 && ` · ${volume.toLocaleString()} ${WEIGHT_UNIT}`}
                      </div>
                    </Link>
                    {!activeId && (
                      <form action={startWorkout}>
                        <input type="hidden" name="from_workout_id" value={w.id} />
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Repeat ${w.name}`}>
                          <RotateCcwIcon />
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
