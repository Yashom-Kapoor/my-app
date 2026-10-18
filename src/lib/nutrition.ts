import type { Enums, Tables } from "@/lib/supabase/database.types";

export type Nutrient = Enums<"nutrient">;
export type Macros = Record<Nutrient, number>;
export type Goal = { nutrient: Nutrient; min: number | null; max: number | null };
export type Food = Tables<"foods">;
export type FoodLog = Tables<"food_logs">;

export const NUTRIENTS: { key: Nutrient; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fiber_g", label: "Fiber", unit: "g" },
];

export const EMPTY_MACROS: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

export { TIMEZONE, addDays, formatDay, isDateString, today } from "@/lib/dates";
import { addDays } from "@/lib/dates";

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function totalsOf(logs: Pick<FoodLog, Nutrient | "servings">[]): Macros {
  const t = { ...EMPTY_MACROS };
  for (const log of logs) {
    for (const { key } of NUTRIENTS) t[key] += Number(log[key]) * Number(log.servings);
  }
  for (const { key } of NUTRIENTS) t[key] = round1(t[key]);
  return t;
}

export function meetsGoal(value: number, goal: Goal): boolean {
  const v = round1(value);
  return (goal.min == null || v >= goal.min) && (goal.max == null || v <= goal.max);
}

/** A day is a hit when every goal is met. No goals → never a hit. */
export function isHit(totals: Macros | undefined, goals: Goal[]): boolean {
  if (!totals || goals.length === 0) return false;
  return goals.every((g) => meetsGoal(totals[g.nutrient], g));
}

/**
 * Consecutive hit days ending today. If today isn't a hit yet, the streak
 * runs through yesterday so it doesn't reset before you've eaten.
 */
export function currentStreak(byDay: Map<string, Macros>, goals: Goal[], todayStr: string): number {
  let day = isHit(byDay.get(todayStr), goals) ? todayStr : addDays(todayStr, -1);
  let streak = 0;
  while (isHit(byDay.get(day), goals)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
