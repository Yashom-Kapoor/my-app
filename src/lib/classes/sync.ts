import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { decrypt } from "./crypto";
import { fetchCanvas } from "./canvas";
import { fetchEd } from "./ed";
import { fetchGradescope } from "./gradescope";
import { ExpiredError, type Provider, type RemoteAnnouncement, type RemoteAssignment, type RemoteCourse } from "./types";

type Client = SupabaseClient<Database>;
type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
type IdColumn = "gradescope_id" | "canvas_id" | "ed_id";

const ID_COLUMN: Record<Provider, IdColumn> = { gradescope: "gradescope_id", canvas: "canvas_id", ed: "ed_id" };

const linkTo = (column: IdColumn, id: string) => ({ [column]: id }) as { [K in IdColumn]?: string };

/** Skip automatic syncs that ran more recently than this. */
export const STALE_AFTER_MS = 30 * 60_000;

// Department spellings that differ between sites, and cross-listed classes that are one course.
const DEPT_ALIASES: Record<string, string> = { COMPSCI: "CS", PHILOSOPHY: "PHILOS", PHIL: "PHILOS" };
const CROSS_LISTED = [["DATA101", "CS187"]];

/** Course keys like "CS161" pulled from a code or name ("COMPSCI 161", "DATA C101/CS C187"). */
export function courseKeys(...texts: (string | null)[]): Set<string> {
  const keys = new Set<string>();
  for (const text of texts) {
    for (const [, dept, num] of (text ?? "").toUpperCase().matchAll(/\b([A-Z]{2,12})\s*C?(\d{1,3}[A-Z]{0,2})\b/g)) {
      keys.add(`${DEPT_ALIASES[dept] ?? dept}${num}`);
    }
  }
  for (const group of CROSS_LISTED) if (group.some((k) => keys.has(k))) group.forEach((k) => keys.add(k));
  return keys;
}

/** Drop a trailing section suffix: "COMPSCI C187-LEC-001" → "COMPSCI C187". */
export function cleanCode(code: string) {
  return code.replace(/[-\s](LEC|DIS|LAB|SEM|IND)[-\s]?\d+$/i, "").trim() || code.trim();
}

/**
 * Map each remote course to a courses row: reuse the row already linked to it, else attach it to
 * an unlinked row with a matching course code, else create a row. Names and codes are only set on
 * create so renames in settings stick.
 */
async function linkCourses(supabase: Client, userId: string, provider: Provider, remote: RemoteCourse[]) {
  const column = ID_COLUMN[provider];
  const { data } = await supabase.from("courses").select().eq("user_id", userId);
  const rows: CourseRow[] = data ?? [];
  const ids = new Map<string, string>();

  for (const remoteCourse of remote) {
    const course = { ...remoteCourse, code: cleanCode(remoteCourse.code) };
    let row = rows.find((r) => r[column] === course.id);
    if (!row) {
      const keys = courseKeys(course.code, course.name);
      row = rows.find((r) => !r[column] && [...courseKeys(r.code, r.name)].some((k) => keys.has(k)));
      if (row) {
        const { error } = await supabase.from("courses").update(linkTo(column, course.id)).eq("id", row.id);
        if (error) throw new Error(error.message);
        row[column] = course.id;
      } else {
        const { data: created, error } = await supabase
          .from("courses")
          .insert({ user_id: userId, name: course.name, code: course.code, term: course.term, ...linkTo(column, course.id) })
          .select()
          .single();
        if (error) throw new Error(error.message);
        row = created;
        rows.push(created);
      }
    }
    ids.set(course.id, row.id);
  }
  return ids;
}

async function saveAssignments(supabase: Client, userId: string, ids: Map<string, string>, items: RemoteAssignment[]) {
  const rows = items
    .filter((a) => ids.has(a.courseId))
    .map((a) => ({
      user_id: userId,
      course_id: ids.get(a.courseId)!,
      external_id: a.externalId,
      title: a.title,
      url: a.url,
      released_at: a.releasedAt,
      due_at: a.dueAt,
      late_due_at: a.lateDueAt,
      status: a.status,
      score: a.score,
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("assignments").upsert(rows, { onConflict: "user_id,external_id" });
  if (error) throw new Error(error.message);
}

async function saveAnnouncements(
  supabase: Client,
  userId: string,
  source: "canvas" | "ed",
  ids: Map<string, string>,
  items: RemoteAnnouncement[],
) {
  const rows = items
    .filter((a) => ids.has(a.courseId))
    .map((a) => ({
      user_id: userId,
      course_id: ids.get(a.courseId)!,
      source,
      external_id: a.externalId,
      title: a.title,
      body: a.body,
      author: a.author,
      url: a.url,
      posted_at: a.postedAt,
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("announcements").upsert(rows, { onConflict: "user_id,source,external_id" });
  if (error) throw new Error(error.message);
}

async function syncProvider(supabase: Client, userId: string, provider: Provider, secret: string) {
  if (provider === "gradescope") {
    const { courses, assignments } = await fetchGradescope(secret);
    await saveAssignments(supabase, userId, await linkCourses(supabase, userId, provider, courses), assignments);
  } else {
    const { courses, announcements } = provider === "canvas" ? await fetchCanvas(secret) : await fetchEd(secret);
    await saveAnnouncements(supabase, userId, provider, await linkCourses(supabase, userId, provider, courses), announcements);
  }
}

export type SyncResult = { provider: Provider; ok: boolean; error?: string };

/**
 * Sync every connected source for one user. Sources run one after another (they share the
 * courses table) and a failure in one never stops the rest. With `onlyStale`, sources synced in
 * the last STALE_AFTER_MS are skipped.
 */
export async function syncAll(supabase: Client, userId: string, { onlyStale = false } = {}): Promise<SyncResult[]> {
  const { data: connections } = await supabase.from("class_connections").select().eq("user_id", userId);
  const results: SyncResult[] = [];
  // Gradescope first, so its courses become the rows the others attach to.
  const order: Provider[] = ["gradescope", "canvas", "ed"];
  const sorted = [...(connections ?? [])].sort(
    (a, b) => order.indexOf(a.provider as Provider) - order.indexOf(b.provider as Provider),
  );

  for (const conn of sorted) {
    const provider = conn.provider as Provider;
    if (onlyStale && conn.last_synced_at && Date.now() - Date.parse(conn.last_synced_at) < STALE_AFTER_MS) continue;
    // A rejected credential stays rejected until the user reconnects; don't retry it automatically.
    if (onlyStale && conn.status === "expired") continue;

    let update: { status: string; last_error: string | null; last_synced_at?: string };
    try {
      await syncProvider(supabase, userId, provider, decrypt(conn.secret));
      update = { status: "ok", last_error: null, last_synced_at: new Date().toISOString() };
      results.push({ provider, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      update = { status: e instanceof ExpiredError ? "expired" : "error", last_error: message };
      results.push({ provider, ok: false, error: message });
    }
    await supabase.from("class_connections").update(update).eq("user_id", userId).eq("provider", provider);
  }
  return results;
}
