import "server-only";
import { fetchAll } from "@/lib/classes/cards/fetch-all";
import { rawToBlob } from "@/lib/classes/materials/notebook";
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
export async function getAssignments(courseId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("assignments")
    .select("id, title, url, due_at, late_due_at, status, score, done_at, course:courses!inner ( id, code, hidden )")
    .eq("course.hidden", false)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (courseId) query = query.eq("course_id", courseId);
  const { data } = await query;
  return data ?? [];
}
export type Assignment = Awaited<ReturnType<typeof getAssignments>>[number];

export async function getAnnouncements(courseId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("announcements")
    .select("id, title, body, author, url, source, posted_at, read_at, course:courses!inner ( id, code, hidden )")
    .eq("course.hidden", false)
    .order("posted_at", { ascending: false })
    .limit(200);
  if (courseId) query = query.eq("course_id", courseId);
  const { data } = await query;
  return data ?? [];
}
export type Announcement = Awaited<ReturnType<typeof getAnnouncements>>[number];

export async function getCourse(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select("id, code, name, website_url").eq("id", id).maybeSingle();
  return data;
}

/** Materials still waiting for the ingest-materials skill (HTML readings and notebooks convert on their own). Hidden courses excluded. */
export async function getWaitingMaterialCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("materials")
    .select("id, course:courses!inner ( hidden )", { count: "exact", head: true })
    .eq("course.hidden", false)
    .not("format", "in", "(html,ipynb)")
    .in("status", ["pending", "processing", "failed"]);
  return count ?? 0;
}

/** The waiting materials themselves, for /classes/waiting. Same filter as getWaitingMaterialCount. */
export async function getWaitingMaterials() {
  const supabase = await createClient();
  return fetchAll(async (from, to) =>
    supabase
      .from("materials")
      .select("id, course_id, kind, title, status, error, source_url, course:courses!inner ( id, code, hidden )")
      .eq("course.hidden", false)
      .not("format", "in", "(html,ipynb)")
      .in("status", ["pending", "processing", "failed"])
      .order("sort_date", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
}
export type WaitingMaterial = Awaited<ReturnType<typeof getWaitingMaterials>>[number];

/**
 * Ready, parentless materials whose cards are missing or stale. Mirrors needsCards / cardsMarker in
 * .claude/skills/make-cards/scripts/merge.mjs: the marker is content_hash, else processed_at as an ISO string;
 * cards are needed when cards_hash is null or differs from the marker.
 */
export async function getMaterialsNeedingCards() {
  const supabase = await createClient();
  const rows = await fetchAll(async (from, to) =>
    supabase
      .from("materials")
      .select("id, course_id, kind, title, content_hash, processed_at, cards_hash, course:courses!inner ( id, code, hidden )")
      .eq("course.hidden", false)
      .eq("status", "ready")
      .is("parent_id", null)
      .order("sort_date", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
  return rows.filter((m) => {
    const marker = m.content_hash ?? (m.processed_at ? new Date(m.processed_at).toISOString() : null);
    return m.cards_hash == null || m.cards_hash !== marker;
  });
}

export async function getMaterials(courseId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, kind, title, week_label, sort_date, status, error, parent_id, page_count, cards(count)")
    .eq("course_id", courseId)
    .is("cards.deleted_at", null)
    .order("sort_date", { ascending: false, nullsFirst: false })
    .order("title");
  return data ?? [];
}
export type MaterialRow = Awaited<ReturnType<typeof getMaterials>>[number];

/** Live (non-deleted) cards in the deck; a head count, so no rows are loaded. */
export async function getDeckSize(courseId?: string) {
  const supabase = await createClient();
  let q = supabase.from("cards").select("id", { count: "exact", head: true }).is("deleted_at", null);
  if (courseId) q = q.eq("course_id", courseId);
  const { count } = await q;
  return count ?? 0;
}

/** A material with its pages, plus any solutions attached to it (also with pages). */
export async function getMaterial(id: string) {
  const supabase = await createClient();
  const select =
    "id, course_id, kind, title, week_label, source_url, storage_path, status, parent_id, material_pages ( page, markdown, needs_review )";
  const [{ data: material }, { data: solutions }] = await Promise.all([
    supabase.from("materials").select(select).eq("id", id).maybeSingle(),
    supabase.from("materials").select(select).eq("parent_id", id).order("title"),
  ]);
  if (!material) return null;
  const sorted = <T extends { material_pages: { page: number }[] }>(m: T) => ({
    ...m,
    material_pages: [...m.material_pages].sort((a, b) => a.page - b.page),
  });
  return { ...sorted(material), solutions: (solutions ?? []).map(sorted) };
}
export type MaterialDetail = NonNullable<Awaited<ReturnType<typeof getMaterial>>>;

/** Short-lived link to the stored original, falling back to where it was found. */
export async function getOriginalUrl(material: { storage_path: string | null; source_url: string }) {
  if (!material.storage_path) return rawToBlob(material.source_url) ?? material.source_url;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("materials").createSignedUrl(material.storage_path, 60 * 60);
  return data?.signedUrl ?? material.source_url;
}
