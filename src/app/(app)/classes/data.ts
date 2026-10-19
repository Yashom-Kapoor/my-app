import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getConnections() {
  const supabase = await createClient();
  // Never select `secret`: connection status is all the UI needs.
  const { data } = await supabase.from("class_connections").select("provider, status, last_error, last_synced_at");
  return data ?? [];
}

export async function getCourses() {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select().order("code");
  return data ?? [];
}

/** Every assignment in visible courses; the page hides completed ones, so old unsubmitted work stays overdue. */
export async function getAssignments() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select("id, title, url, due_at, late_due_at, status, score, done_at, course:courses!inner ( id, code, hidden )")
    .eq("course.hidden", false)
    .order("due_at", { ascending: true, nullsFirst: false });
  return data ?? [];
}
export type Assignment = Awaited<ReturnType<typeof getAssignments>>[number];

export async function getAnnouncements() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, author, url, source, posted_at, read_at, course:courses!inner ( id, code, hidden )")
    .eq("course.hidden", false)
    .order("posted_at", { ascending: false })
    .limit(200);
  return data ?? [];
}
export type Announcement = Awaited<ReturnType<typeof getAnnouncements>>[number];
