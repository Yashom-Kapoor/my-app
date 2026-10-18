"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDateString, today } from "@/lib/nutrition";

export type ActionState = { ok: boolean; error?: string };

const weightSchema = z.coerce.number({ error: "Enter a weight" }).positive("Enter a weight").max(1499);

/** Save a weight for a day; re-saving the same day replaces it. */
export async function saveWeight(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const date = formData.get("date");
  if (!isDateString(date) || date > today()) return { ok: false, error: "Pick a valid date" };
  const weight = weightSchema.safeParse(formData.get("weight") || undefined);
  if (!weight.success) return { ok: false, error: weight.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("weight_entries")
    .upsert({ logged_on: date, weight: weight.data }, { onConflict: "user_id,logged_on" });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteWeight(date: string) {
  const supabase = await createClient();
  await supabase.from("weight_entries").delete().eq("logged_on", date);
  refresh();
}
