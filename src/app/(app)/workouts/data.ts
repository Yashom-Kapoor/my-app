import "server-only";
import { createClient } from "@/lib/supabase/server";
import { bestsFrom, type Bests, type SetValues } from "@/lib/workouts";

export async function getExercises() {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select().eq("archived", false).order("name");
  return data ?? [];
}

export async function getActiveWorkoutId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("workouts").select("id").is("ended_at", null).maybeSingle();
  return data?.id ?? null;
}

const WORKOUT_DETAIL = `
  id, name, started_at, ended_at, notes, template_id,
  workout_exercises (
    id, position, rest_seconds, notes,
    exercise:exercises ( id, name, kind, muscle_group, equipment, user_id, archived, created_at ),
    workout_sets ( id, position, weight, reps, completed_at )
  )
`;

export async function getWorkout(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("workouts").select(WORKOUT_DETAIL).eq("id", id).maybeSingle();
  if (!data) return null;
  const exercises = [...data.workout_exercises]
    .sort((a, b) => a.position - b.position)
    .map((we) => ({ ...we, workout_sets: [...we.workout_sets].sort((a, b) => a.position - b.position) }));
  return { ...data, workout_exercises: exercises };
}
export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;

export async function getRecentWorkouts(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select(
      "id, name, started_at, ended_at, workout_exercises ( exercise:exercises ( name, muscle_group ), workout_sets ( weight, reps, completed_at ) )",
    )
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getWorkoutDatesSince(since: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select("started_at")
    .not("ended_at", "is", null)
    .gte("started_at", since);
  return (data ?? []).map((w) => w.started_at);
}

export async function getTemplates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_templates")
    .select("id, name, notes, template_exercises ( id, position, target_sets, target_reps, rest_seconds, exercise:exercises ( id, name, kind ) )")
    .order("name");
  return (data ?? []).map((t) => ({
    ...t,
    template_exercises: [...t.template_exercises].sort((a, b) => a.position - b.position),
  }));
}
export type Template = Awaited<ReturnType<typeof getTemplates>>[number];

/** Completed sets from finished workouts for the given exercises, grouped by exercise then workout (oldest first). */
export async function getHistory(exerciseIds: string[], before?: string) {
  const byExercise = new Map<string, { workoutId: string; startedAt: string; sets: SetValues[] }[]>();
  if (exerciseIds.length === 0) return byExercise;
  const supabase = await createClient();
  let query = supabase
    .from("exercise_set_history")
    .select("exercise_id, workout_id, started_at, position, weight, reps")
    .in("exercise_id", exerciseIds)
    .order("started_at")
    .order("position");
  if (before) query = query.lt("started_at", before);
  const { data } = await query;

  for (const row of data ?? []) {
    if (!row.exercise_id || !row.workout_id || !row.started_at) continue;
    const sessions = byExercise.get(row.exercise_id) ?? [];
    let session = sessions.at(-1);
    if (!session || session.workoutId !== row.workout_id) {
      session = { workoutId: row.workout_id, startedAt: row.started_at, sets: [] };
      sessions.push(session);
    }
    session.sets.push({ weight: row.weight == null ? null : Number(row.weight), reps: row.reps });
    byExercise.set(row.exercise_id, sessions);
  }
  return byExercise;
}

export async function getBests(exerciseIds: string[], before?: string): Promise<Record<string, Bests | null>> {
  const history = await getHistory(exerciseIds, before);
  return Object.fromEntries(exerciseIds.map((id) => [id, bestsFrom((history.get(id) ?? []).map((s) => s.sets))]));
}

/** Last session's completed sets per exercise. */
export async function getLastSets(exerciseIds: string[], before?: string): Promise<Record<string, SetValues[]>> {
  if (exerciseIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("last_sets", { exercise_ids: exerciseIds, ...(before ? { before } : {}) });
  const out: Record<string, SetValues[]> = {};
  for (const row of data ?? []) {
    (out[row.exercise_id] ??= []).push({ weight: row.weight == null ? null : Number(row.weight), reps: row.reps });
  }
  return out;
}
