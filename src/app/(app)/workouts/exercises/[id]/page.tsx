import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, TrophyIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateOf, formatDay, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { WEIGHT_UNIT } from "@/lib/weight";
import { PR_LABELS, bestsFrom, type Exercise, equipmentLabel, formatSet, muscleLabel, sessionStats, type PR } from "@/lib/workouts";
import { getHistory } from "../../data";
import { ManageExercise } from "./manage-exercise";
import { MetricTabs } from "./metric-tabs";

export const metadata: Metadata = { title: "Exercise" };

export default function ExercisePage({ params }: PageProps<"/workouts/exercises/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/workouts/exercises" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Exercises
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <ExerciseDetail params={params} />
      </Suspense>
    </div>
  );
}

async function ExerciseDetail({ params }: { params: PageProps<"/workouts/exercises/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select().eq("id", id).maybeSingle();
  if (!exercise) notFound();

  const sessions = (await getHistory([id])).get(id) ?? [];
  const bests = bestsFrom(sessions.map((s) => s.sets));
  const kind = exercise.kind;
  const todayStr = today();

  const rows = sessions.map((s) => ({ date: dateOf(s.startedAt), sets: s.sets, stats: sessionStats(s.sets) }));
  const metrics =
    kind === "weighted"
      ? [
          { key: "e1rm", label: "Est. 1RM", unit: WEIGHT_UNIT, points: rows.filter((r) => r.stats.bestE1rm != null).map((r) => ({ date: r.date, value: r.stats.bestE1rm! })) },
          { key: "weight", label: "Top weight", unit: WEIGHT_UNIT, points: rows.map((r) => ({ date: r.date, value: r.stats.maxWeight })) },
          { key: "volume", label: "Volume", unit: WEIGHT_UNIT, points: rows.map((r) => ({ date: r.date, value: r.stats.volume })) },
        ]
      : [
          { key: "reps", label: "Max reps", unit: "reps", points: rows.map((r) => ({ date: r.date, value: r.stats.maxReps })) },
          { key: "total", label: "Total reps", unit: "reps", points: rows.map((r) => ({ date: r.date, value: r.sets.reduce((n, s) => n + (s.reps ?? 0), 0) })) },
        ];

  const prRows: { key: PR; value: string }[] = bests
    ? kind === "weighted"
      ? [
          { key: "e1rm", value: `${bests.e1rm} ${WEIGHT_UNIT}` },
          { key: "weight", value: `${bests.weight} ${WEIGHT_UNIT}` },
          { key: "reps", value: `${bests.reps}` },
          { key: "volume", value: `${bests.volume.toLocaleString()} ${WEIGHT_UNIT}` },
        ]
      : [
          { key: "reps", value: `${bests.reps}` },
          ...(bests.weight > 0 ? [{ key: "weight" as PR, value: `+${bests.weight} ${WEIGHT_UNIT}` }] : []),
        ]
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{exercise.name}</h1>
        <p className="text-sm text-muted-foreground">
          {muscleLabel(exercise.muscle_group)} · {equipmentLabel(exercise.equipment)} · {kind === "weighted" ? "Weight × reps" : "Bodyweight"}
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No sessions yet. Progress shows up here after you finish a workout with this exercise.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <MetricTabs metrics={metrics} end={todayStr} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrophyIcon className="size-4 text-amber-500" /> Personal records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3">
                {prRows.map((p) => (
                  <div key={p.key}>
                    <dt className="text-xs text-muted-foreground">{PR_LABELS[p.key]}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {[...rows].reverse().map((r, i) => (
                  <li key={`${r.date}-${i}`} className="py-2.5">
                    <Link href={`/workouts/${sessions[rows.length - 1 - i].workoutId}`} className="block">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium">{formatDay(r.date)}</span>
                        {r.stats.bestE1rm != null && kind === "weighted" && (
                          <span className="text-xs tabular-nums text-muted-foreground">e1RM {r.stats.bestE1rm}</span>
                        )}
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {r.sets.map((s) => formatSet(s, kind, WEIGHT_UNIT)).join(", ")}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {exercise.user_id && <ExerciseUsage exercise={exercise} />}
    </div>
  );
}

async function ExerciseUsage({ exercise }: { exercise: Exercise }) {
  const supabase = await createClient();
  const [{ data: inWorkouts }, { count: templates }] = await Promise.all([
    supabase.from("workout_exercises").select("workout_id").eq("exercise_id", exercise.id),
    supabase.from("template_exercises").select("id", { count: "exact", head: true }).eq("exercise_id", exercise.id),
  ]);
  const workouts = new Set((inWorkouts ?? []).map((w) => w.workout_id)).size;
  return <ManageExercise exercise={exercise} workouts={workouts} templates={templates ?? 0} />;
}
