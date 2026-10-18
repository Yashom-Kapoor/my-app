import { addDays, weekStart } from "@/lib/dates";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export type Exercise = Tables<"exercises">;
export type ExerciseKind = Enums<"exercise_kind">;
export type MuscleGroup = Enums<"muscle_group">;
export type Equipment = Enums<"equipment">;
export type SetValues = { weight: number | null; reps: number | null };

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string }[] = [
  { key: "chest", label: "Chest" },
  { key: "back", label: "Back" },
  { key: "shoulders", label: "Shoulders" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "forearms", label: "Forearms" },
  { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" },
  { key: "glutes", label: "Glutes" },
  { key: "calves", label: "Calves" },
  { key: "core", label: "Core" },
  { key: "full_body", label: "Full body" },
];

export const EQUIPMENT: { key: Equipment; label: string }[] = [
  { key: "barbell", label: "Barbell" },
  { key: "dumbbell", label: "Dumbbell" },
  { key: "machine", label: "Machine" },
  { key: "cable", label: "Cable" },
  { key: "bodyweight", label: "Bodyweight" },
  { key: "kettlebell", label: "Kettlebell" },
  { key: "band", label: "Band" },
  { key: "other", label: "Other" },
];

export const muscleLabel = (m: MuscleGroup) => MUSCLE_GROUPS.find((g) => g.key === m)?.label ?? m;
export const equipmentLabel = (e: Equipment) => EQUIPMENT.find((g) => g.key === e)?.label ?? e;

export const DEFAULT_REST_SECONDS = 120;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Epley estimated one-rep max. A single is its own 1RM; >15 reps is too noisy to estimate. */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (!weight || weight <= 0 || !reps || reps < 1 || reps > 15) return null;
  return reps === 1 ? weight : round1(weight * (1 + reps / 30));
}

/** weight × reps; bodyweight sets only count added weight. */
export function setVolume({ weight, reps }: SetValues): number {
  return (weight ?? 0) * (reps ?? 0);
}

export function formatSet({ weight, reps }: SetValues, kind: ExerciseKind, unit: string): string {
  if (kind === "bodyweight") {
    if (weight) return `+${weight} ${unit} × ${reps ?? 0}`;
    return `${reps ?? 0} reps`;
  }
  return `${weight ?? 0} × ${reps ?? 0}`;
}

export type Bests = { weight: number; e1rm: number; reps: number; volume: number };
export type PR = "weight" | "e1rm" | "reps" | "volume";

export const PR_LABELS: Record<PR, string> = {
  weight: "Heaviest weight",
  e1rm: "Best est. 1RM",
  reps: "Most reps",
  volume: "Best session volume",
};

/** Best values across sessions. `sessions` is a list of sets per session. */
export function bestsFrom(sessions: SetValues[][]): Bests | null {
  if (sessions.length === 0) return null;
  const b: Bests = { weight: 0, e1rm: 0, reps: 0, volume: 0 };
  for (const sets of sessions) {
    let vol = 0;
    for (const s of sets) {
      b.weight = Math.max(b.weight, s.weight ?? 0);
      b.e1rm = Math.max(b.e1rm, e1rm(s.weight, s.reps) ?? 0);
      b.reps = Math.max(b.reps, s.reps ?? 0);
      vol += setVolume(s);
    }
    b.volume = Math.max(b.volume, round1(vol));
  }
  return b;
}

/**
 * PRs a single set beats versus previous bests. No PRs on an exercise's first
 * session (there's nothing to beat). Bodyweight exercises track reps (and added
 * weight if used); weighted exercises track weight and estimated 1RM.
 */
export function setPRs(set: SetValues, kind: ExerciseKind, bests: Bests | null): PR[] {
  if (!bests || !set.reps) return [];
  const prs: PR[] = [];
  if (kind === "bodyweight") {
    if (!set.weight && set.reps > bests.reps) prs.push("reps");
    if (set.weight && set.weight > bests.weight) prs.push("weight");
    return prs;
  }
  if (set.weight && set.weight > bests.weight) prs.push("weight");
  const est = e1rm(set.weight, set.reps);
  if (est != null && est > bests.e1rm) prs.push("e1rm");
  return prs;
}

/** PRs achieved in a whole session (each type counted once). */
export function sessionPRs(sets: SetValues[], kind: ExerciseKind, bests: Bests | null): PR[] {
  if (!bests) return [];
  const prs = new Set<PR>(sets.flatMap((s) => setPRs(s, kind, bests)));
  const vol = round1(sets.reduce((sum, s) => sum + setVolume(s), 0));
  if (vol > 0 && vol > bests.volume) prs.add("volume");
  return [...prs];
}

export type SessionStats = {
  sets: number;
  volume: number;
  bestE1rm: number | null;
  maxWeight: number;
  maxReps: number;
};

export function sessionStats(sets: SetValues[]): SessionStats {
  let bestE1rm: number | null = null;
  for (const s of sets) {
    const est = e1rm(s.weight, s.reps);
    if (est != null && (bestE1rm == null || est > bestE1rm)) bestE1rm = est;
  }
  return {
    sets: sets.length,
    volume: round1(sets.reduce((sum, s) => sum + setVolume(s), 0)),
    bestE1rm,
    maxWeight: Math.max(0, ...sets.map((s) => s.weight ?? 0)),
    maxReps: Math.max(0, ...sets.map((s) => s.reps ?? 0)),
  };
}

/** Workouts per Monday-start week for the `weeks` weeks ending at `end`, oldest first. */
export function weeklyCounts(dates: string[], end: string, weeks: number): { week: string; count: number }[] {
  const last = weekStart(end);
  const counts = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) counts.set(addDays(last, -7 * i), 0);
  for (const d of dates) {
    const w = weekStart(d);
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }
  return [...counts.entries()].map(([week, count]) => ({ week, count }));
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const ss = String(s % 60).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${ss}`;
  return `${Math.floor(s / 60)}:${ss}`;
}
