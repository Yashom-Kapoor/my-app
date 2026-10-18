import { weekStart } from "@/lib/dates";

export { weekStart };

export const WEIGHT_UNIT = process.env.NEXT_PUBLIC_WEIGHT_UNIT ?? "lb";

export type WeightEntry = { logged_on: string; weight: number };
export type WeekAverage = { week: string; avg: number; count: number };

/** Average weight per Monday-start week, oldest first. */
export function weeklyAverages(entries: WeightEntry[]): WeekAverage[] {
  const weeks = new Map<string, { sum: number; count: number }>();
  for (const { logged_on, weight } of entries) {
    const w = weekStart(logged_on);
    const acc = weeks.get(w) ?? { sum: 0, count: 0 };
    acc.sum += Number(weight);
    acc.count++;
    weeks.set(w, acc);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, { sum, count }]) => ({ week, avg: Math.round((sum / count) * 10) / 10, count }));
}
