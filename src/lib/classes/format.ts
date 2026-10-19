import { TIMEZONE, addDays, dateOf } from "@/lib/dates";

// Display helpers for the Classes page. All "today"/"this week" boundaries use TIMEZONE.

/** Request time in ms. Server components call this after `connection()` (via createClient). */
export function currentTime() {
  return Date.now();
}

export type DueGroup = "overdue" | "today" | "week" | "later" | "undated";

export const DUE_GROUP_LABELS: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  undated: "No due date",
};

export function dueGroup(dueAt: string | null, now: number): DueGroup {
  if (!dueAt) return "undated";
  const due = Date.parse(dueAt);
  if (due < now) return "overdue";
  const todayStr = dateOf(new Date(now));
  const day = dateOf(dueAt);
  if (day === todayStr) return "today";
  return day <= addDays(todayStr, 7) ? "week" : "later";
}

/** "Tue, Oct 21, 11:59 PM" */
export function formatDateTime(timestamp: string) {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

/** "in 2d 4h", "in 35m", "3h ago". */
export function relativeTime(timestamp: string, now: number) {
  const diff = Date.parse(timestamp) - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const text =
    days > 0 ? (days >= 3 || !hours ? `${days}d` : `${days}d ${hours}h`) : hours > 0 ? `${hours}h` : `${Math.max(mins, 1)}m`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** Short age for feed items: "5m", "3h", "2d", or a date past a week. */
export function age(timestamp: string, now: number) {
  const mins = Math.max(0, Math.round((now - Date.parse(timestamp)) / 60_000));
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  if (mins < 7 * 1440) return `${Math.floor(mins / 1440)}d`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIMEZONE });
}

/** "21.0 / 61.0" → { earned: 21, max: 61 }. */
export function parseScore(score: string | null) {
  const m = score?.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
  if (!m) return null;
  const earned = Number(m[1]);
  const max = Number(m[2]);
  return isFinite(earned) && isFinite(max) && max > 0 ? { earned, max } : null;
}

/** "21/61 · 34%" */
export function formatScore({ earned, max }: { earned: number; max: number }) {
  return `${earned}/${max} · ${Math.round((earned / max) * 100)}%`;
}

export const PROVIDER_LABELS = { gradescope: "Gradescope", canvas: "bCourses", ed: "Ed" } as const;
