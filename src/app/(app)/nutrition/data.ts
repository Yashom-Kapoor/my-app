import "server-only";
import { createClient } from "@/lib/supabase/server";
import { NUTRIENTS, addDays, round1, type Goal, type Macros } from "@/lib/nutrition";

export async function getGoals(): Promise<Goal[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("nutrition_goals").select("nutrient, min, max");
  return data ?? [];
}

export async function getDayLogs(date: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_logs")
    .select()
    .eq("logged_on", date)
    .order("created_at");
  return data ?? [];
}

export async function getSavedFoods() {
  const supabase = await createClient();
  const { data } = await supabase.from("foods").select().order("name");
  return data ?? [];
}

/** Totals per day for the `days` days ending on `end`. */
export async function getDailyTotals(end: string, days: number): Promise<Map<string, Macros>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_daily_totals")
    .select()
    .gte("logged_on", addDays(end, -(days - 1)))
    .lte("logged_on", end);

  const byDay = new Map<string, Macros>();
  for (const row of data ?? []) {
    if (!row.logged_on) continue;
    const totals = {} as Macros;
    for (const { key } of NUTRIENTS) totals[key] = round1(Number(row[key] ?? 0));
    byDay.set(row.logged_on, totals);
  }
  return byDay;
}
