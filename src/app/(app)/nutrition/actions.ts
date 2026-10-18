"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NUTRIENTS, isDateString, type Nutrient } from "@/lib/nutrition";

export type ActionState = { ok: boolean; error?: string };

const amount = z.coerce.number().min(0).max(100000).catch(0);
const macrosSchema = z.object({
  calories: amount,
  protein_g: amount,
  carbs_g: amount,
  fat_g: amount,
  fiber_g: amount,
});

const newFoodSchema = macrosSchema.extend({
  name: z.string().trim().min(1, "Name is required"),
  serving: z.string().trim().max(60).optional(),
});

const servingsSchema = z.coerce.number().positive("Servings must be more than 0").max(100);

function fail(error: string): ActionState {
  return { ok: false, error };
}

/** Log a food. Either `food_id` (a saved food) or a new item; `save` also adds it to My foods. */
export async function logFood(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const date = formData.get("date");
  if (!isDateString(date)) return fail("Invalid date");
  const servings = servingsSchema.safeParse(formData.get("servings") || 1);
  if (!servings.success) return fail(servings.error.issues[0].message);

  const supabase = await createClient();
  const foodId = formData.get("food_id");

  if (typeof foodId === "string" && foodId) {
    const { data: food, error } = await supabase.from("foods").select().eq("id", foodId).single();
    if (error || !food) return fail("Food not found");
    const { error: insertError } = await supabase.from("food_logs").insert({
      logged_on: date,
      food_id: food.id,
      name: food.name,
      servings: servings.data,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
    });
    if (insertError) return fail(insertError.message);
    refresh();
    return { ok: true };
  }

  const parsed = newFoodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { serving, ...item } = parsed.data;

  let savedId: string | null = null;
  if (formData.get("save") === "on") {
    const { data, error } = await supabase
      .from("foods")
      .insert({ ...item, serving: serving || null })
      .select("id")
      .single();
    if (error) return fail(error.message);
    savedId = data.id;
  }

  const { error } = await supabase
    .from("food_logs")
    .insert({ ...item, logged_on: date, servings: servings.data, food_id: savedId });
  if (error) return fail(error.message);

  refresh();
  return { ok: true };
}

export async function deleteLog(id: string) {
  const supabase = await createClient();
  await supabase.from("food_logs").delete().eq("id", id);
  refresh();
}

export async function updateFood(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return fail("Missing food");
  const parsed = newFoodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase
    .from("foods")
    .update({ ...parsed.data, serving: parsed.data.serving || null })
    .eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

export async function deleteFood(id: string) {
  const supabase = await createClient();
  await supabase.from("foods").delete().eq("id", id);
  refresh();
}

const goalBound = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().min(0).max(100000).nullable(),
);

/** Upsert goals; a nutrient with both fields blank has its goal removed. */
export async function saveGoals(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const upserts: { nutrient: Nutrient; min: number | null; max: number | null }[] = [];
  const cleared: Nutrient[] = [];

  for (const { key, label } of NUTRIENTS) {
    const min = goalBound.safeParse(formData.get(`${key}.min`));
    const max = goalBound.safeParse(formData.get(`${key}.max`));
    if (!min.success || !max.success) return fail(`${label}: enter a number`);
    if (min.data != null && max.data != null && min.data > max.data) {
      return fail(`${label}: min can't be more than max`);
    }
    if (min.data == null && max.data == null) cleared.push(key);
    else upserts.push({ nutrient: key, min: min.data, max: max.data });
  }

  const supabase = await createClient();
  if (upserts.length) {
    const { error } = await supabase.from("nutrition_goals").upsert(upserts, { onConflict: "user_id,nutrient" });
    if (error) return fail(error.message);
  }
  if (cleared.length) {
    const { error } = await supabase.from("nutrition_goals").delete().in("nutrient", cleared);
    if (error) return fail(error.message);
  }
  refresh();
  return { ok: true };
}
