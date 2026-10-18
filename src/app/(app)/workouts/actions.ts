"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/lib/workouts";

export type ActionState = { ok: boolean; error?: string };

type Plan = { exercise_id: string; rest_seconds: number; sets: number; notes?: string | null }[];

/**
 * Start a workout: empty, from a template, or repeating a past workout.
 * If one is already in progress, go to it instead.
 */
export async function startWorkout(formData: FormData) {
  const supabase = await createClient();
  const { data: active } = await supabase.from("workouts").select("id").is("ended_at", null).maybeSingle();
  if (active) redirect(`/workouts/${active.id}`);

  const templateId = formData.get("template_id");
  const fromWorkoutId = formData.get("from_workout_id");
  let name = "Workout";
  let plan: Plan = [];

  if (typeof templateId === "string" && templateId) {
    const { data: t } = await supabase
      .from("workout_templates")
      .select("name, template_exercises ( exercise_id, position, target_sets, target_reps, rest_seconds )")
      .eq("id", templateId)
      .single();
    if (t) {
      name = t.name;
      plan = [...t.template_exercises]
        .sort((a, b) => a.position - b.position)
        .map((te) => ({
          exercise_id: te.exercise_id,
          rest_seconds: te.rest_seconds,
          sets: te.target_sets,
          notes: te.target_reps ? `Target: ${te.target_sets} × ${te.target_reps}` : null,
        }));
    }
  } else if (typeof fromWorkoutId === "string" && fromWorkoutId) {
    const { data: w } = await supabase
      .from("workouts")
      .select("name, workout_exercises ( exercise_id, position, rest_seconds, notes, workout_sets ( id ) )")
      .eq("id", fromWorkoutId)
      .single();
    if (w) {
      name = w.name;
      plan = [...w.workout_exercises]
        .sort((a, b) => a.position - b.position)
        .map((we) => ({
          exercise_id: we.exercise_id,
          rest_seconds: we.rest_seconds,
          sets: Math.max(1, we.workout_sets.length),
          notes: we.notes,
        }));
    }
  }

  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({ name, template_id: typeof templateId === "string" && templateId ? templateId : null })
    .select("id")
    .single();
  if (error || !workout) throw new Error(error?.message ?? "Could not start workout");

  if (plan.length) {
    const { data: wes, error: weError } = await supabase
      .from("workout_exercises")
      .insert(
        plan.map((p, i) => ({ workout_id: workout.id, exercise_id: p.exercise_id, position: i, rest_seconds: p.rest_seconds, notes: p.notes ?? null })),
      )
      .select("id, position");
    if (weError) throw new Error(weError.message);
    const sets = (wes ?? []).flatMap((we) =>
      Array.from({ length: plan[we.position].sets }, (_, i) => ({ workout_exercise_id: we.id, position: i })),
    );
    if (sets.length) await supabase.from("workout_sets").insert(sets);
  }

  redirect(`/workouts/${workout.id}`);
}

/** Drop unchecked sets and empty exercises, then mark the workout done. Empty workouts are discarded. */
export async function finishWorkout(id: string) {
  const supabase = await createClient();
  const { data: wes } = await supabase
    .from("workout_exercises")
    .select("id, workout_sets ( id, completed_at )")
    .eq("workout_id", id);

  const unchecked = (wes ?? []).flatMap((we) => we.workout_sets.filter((s) => !s.completed_at).map((s) => s.id));
  const emptyExercises = (wes ?? []).filter((we) => !we.workout_sets.some((s) => s.completed_at)).map((we) => we.id);

  if (unchecked.length) await supabase.from("workout_sets").delete().in("id", unchecked);
  if (emptyExercises.length) await supabase.from("workout_exercises").delete().in("id", emptyExercises);

  if (emptyExercises.length === (wes ?? []).length) {
    await supabase.from("workouts").delete().eq("id", id);
    redirect("/workouts");
  }

  await supabase.from("workouts").update({ ended_at: new Date().toISOString() }).eq("id", id);
  redirect(`/workouts/${id}`);
}

export async function deleteWorkout(id: string) {
  const supabase = await createClient();
  await supabase.from("workouts").delete().eq("id", id);
  redirect("/workouts");
}

export async function saveAsTemplate(workoutId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the template a name" };

  const supabase = await createClient();
  const { data: w } = await supabase
    .from("workouts")
    .select("workout_exercises ( exercise_id, position, rest_seconds, workout_sets ( reps ) )")
    .eq("id", workoutId)
    .single();
  if (!w) return { ok: false, error: "Workout not found" };

  const { data: t, error } = await supabase.from("workout_templates").insert({ name }).select("id").single();
  if (error || !t) return { ok: false, error: error?.message ?? "Could not save" };

  const rows = [...w.workout_exercises]
    .sort((a, b) => a.position - b.position)
    .map((we, i) => {
      const reps = we.workout_sets.map((s) => s.reps).filter((r): r is number => r != null);
      const lo = Math.min(...reps);
      const hi = Math.max(...reps);
      return {
        template_id: t.id,
        exercise_id: we.exercise_id,
        position: i,
        target_sets: Math.min(20, Math.max(1, we.workout_sets.length)),
        target_reps: reps.length ? (lo === hi ? String(lo) : `${lo}-${hi}`) : null,
        rest_seconds: we.rest_seconds,
      };
    });
  if (rows.length) await supabase.from("template_exercises").insert(rows);
  refresh();
  return { ok: true };
}

export async function createTemplate(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "New template";
  const supabase = await createClient();
  const { data, error } = await supabase.from("workout_templates").insert({ name }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create template");
  redirect(`/workouts/templates/${data.id}`);
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  await supabase.from("workout_templates").delete().eq("id", id);
  redirect("/workouts/templates");
}

const exerciseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  muscle_group: z.enum(MUSCLE_GROUPS.map((m) => m.key) as [string, ...string[]]),
  equipment: z.enum(EQUIPMENT.map((e) => e.key) as [string, ...string[]]),
  kind: z.enum(["weighted", "bodyweight"]),
});

export type CreateExerciseState = ActionState & { id?: string };

export async function createExercise(_prev: CreateExerciseState, formData: FormData): Promise<CreateExerciseState> {
  const parsed = exerciseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exercises")
    .insert(parsed.data as TablesInsert<"exercises">)
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.code === "23505" ? "You already have an exercise with that name" : error.message };
  }
  refresh();
  return { ok: true, id: data.id };
}

export async function updateExercise(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = exerciseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  // RLS only lets you update your own exercises; built-ins match zero rows.
  const { data, error } = await supabase
    .from("exercises")
    .update(parsed.data as TablesUpdate<"exercises">)
    .eq("id", id)
    .select("id");
  if (error) {
    return { ok: false, error: error.code === "23505" ? "You already have an exercise with that name" : error.message };
  }
  if (!data?.length) return { ok: false, error: "Only your own exercises can be edited" };
  refresh();
  return { ok: true };
}

/**
 * Delete a custom exercise, along with every place it was used: its sets in
 * past workouts and its rows in templates. Finished workouts left with no
 * exercises are deleted too.
 */
export async function deleteExercise(id: string) {
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("user_id").eq("id", id).maybeSingle();
  if (!exercise?.user_id) throw new Error("Only your own exercises can be deleted");

  const { data: uses } = await supabase.from("workout_exercises").select("workout_id").eq("exercise_id", id);
  const affected = [...new Set((uses ?? []).map((u) => u.workout_id))];

  await supabase.from("template_exercises").delete().eq("exercise_id", id);
  await supabase.from("workout_exercises").delete().eq("exercise_id", id);
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (affected.length) {
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, ended_at, workout_exercises ( id )")
      .in("id", affected);
    const empty = (workouts ?? []).filter((w) => w.ended_at && w.workout_exercises.length === 0).map((w) => w.id);
    if (empty.length) await supabase.from("workouts").delete().in("id", empty);
  }

  redirect("/workouts/exercises");
}

