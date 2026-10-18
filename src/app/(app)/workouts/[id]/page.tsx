import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, RotateCcwIcon, Trash2Icon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { dateOf, formatDay } from "@/lib/dates";
import { WEIGHT_UNIT } from "@/lib/weight";
import { PR_LABELS, formatDuration, formatSet, sessionPRs, sessionStats, setPRs } from "@/lib/workouts";
import { deleteWorkout, startWorkout } from "../actions";
import { getActiveWorkoutId, getBests, getExercises, getLastSets, getWorkout, type WorkoutDetail } from "../data";
import { ActiveWorkout } from "../_components/active-workout";
import { SaveTemplateForm } from "../_components/save-template-form";

export const metadata: Metadata = { title: "Workout" };

export default function WorkoutPage({ params }: PageProps<"/workouts/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Workouts
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Workout params={params} />
      </Suspense>
    </div>
  );
}

async function Workout({ params }: { params: PageProps<"/workouts/[id]">["params"] }) {
  const { id } = await params;
  const workout = await getWorkout(id);
  if (!workout) notFound();

  const exerciseIds = [...new Set(workout.workout_exercises.map((we) => we.exercise!.id))];
  const [previous, bests] = await Promise.all([
    getLastSets(exerciseIds, workout.started_at),
    getBests(exerciseIds, workout.started_at),
  ]);

  if (!workout.ended_at) {
    const library = await getExercises();
    return (
      <ActiveWorkout
        workout={{ id: workout.id, name: workout.name, started_at: workout.started_at }}
        initial={workout.workout_exercises.map((we) => ({
          id: we.id,
          position: we.position,
          rest_seconds: we.rest_seconds,
          notes: we.notes,
          exercise: we.exercise!,
          sets: we.workout_sets.map((s) => ({ ...s, weight: s.weight == null ? null : Number(s.weight) })),
        }))}
        previous={previous}
        bests={bests}
        library={library}
        unit={WEIGHT_UNIT}
      />
    );
  }

  return <Summary workout={workout} bests={bests} />;
}

async function Summary({ workout, bests }: { workout: WorkoutDetail; bests: Awaited<ReturnType<typeof getBests>> }) {
  const activeId = await getActiveWorkoutId();
  const all = workout.workout_exercises.flatMap((we) => we.workout_sets);
  const stats = sessionStats(all.map((s) => ({ weight: s.weight == null ? null : Number(s.weight), reps: s.reps })));
  const prCount = workout.workout_exercises.reduce(
    (n, we) =>
      n + sessionPRs(we.workout_sets.map((s) => ({ weight: s.weight == null ? null : Number(s.weight), reps: s.reps })), we.exercise!.kind, bests[we.exercise!.id]).length,
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workout.name}</h1>
        <p className="text-sm text-muted-foreground">{formatDay(dateOf(workout.started_at))}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Duration", value: formatDuration(Date.parse(workout.ended_at!) - Date.parse(workout.started_at)) },
          { label: "Sets", value: stats.sets },
          { label: "Volume", value: `${Math.round(stats.volume).toLocaleString()} ${WEIGHT_UNIT}` },
          { label: "PRs", value: prCount },
        ].map((t) => (
          <Card key={t.label} size="sm">
            <CardContent>
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="text-lg font-semibold tabular-nums">{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workout.workout_exercises.map((we) => {
        const kind = we.exercise!.kind;
        const sets = we.workout_sets.map((s) => ({ ...s, weight: s.weight == null ? null : Number(s.weight) }));
        const prs = sessionPRs(sets, kind, bests[we.exercise!.id]);
        return (
          <Card key={we.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`/workouts/exercises/${we.exercise!.id}`} className="hover:underline">
                  {we.exercise!.name}
                </Link>
              </CardTitle>
              {prs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {prs.map((pr) => (
                    <span key={pr} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <TrophyIcon className="size-3" /> {PR_LABELS[pr]}
                    </span>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ol className="space-y-1 text-sm tabular-nums">
                {sets.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <span>{formatSet(s, kind, WEIGHT_UNIT)}</span>
                    {setPRs(s, kind, bests[we.exercise!.id]).length > 0 && (
                      <TrophyIcon className="size-3.5 text-amber-500" aria-label="Personal record" />
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-3">
          <SaveTemplateForm workoutId={workout.id} defaultName={workout.name} />
          <div className="flex gap-2">
            {!activeId && (
              <form action={startWorkout} className="flex-1">
                <input type="hidden" name="from_workout_id" value={workout.id} />
                <Button type="submit" variant="secondary" className="w-full">
                  <RotateCcwIcon /> Repeat workout
                </Button>
              </form>
            )}
            <form action={deleteWorkout.bind(null, workout.id)}>
              <ConfirmSubmit variant="ghost" message="Delete this workout from your history?">
                <Trash2Icon /> Delete
              </ConfirmSubmit>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
