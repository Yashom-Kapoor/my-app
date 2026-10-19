import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { decrypt } from "../crypto";
import { discoverCanvasAssignments, discoverCanvasFiles, type FoundAssignment } from "./canvas-files";
import { datahubToRaw, notebookToMarkdown } from "./notebook";
import { convertReading } from "./readings";
import { discoverCs161 } from "./sites/cs161";
import { discoverData101 } from "./sites/data101";
import type { FoundMaterial } from "./types";

type Client = SupabaseClient<Database>;

/** HTML readings converted per run; the rest wait for the next sync. */
const READINGS_PER_RUN = 40;

/** Course websites with a parser, by hostname. */
function siteAdapter(url: string) {
  const host = new URL(url).hostname;
  if (/^[a-z]{2}\d{2}\.cs161\.org$/.test(host)) return discoverCs161;
  if (host === "data101.org") return discoverData101;
  return null;
}

async function save(supabase: Client, userId: string, courseId: string, found: FoundMaterial[]) {
  if (!found.length) return;
  const toRow = (m: FoundMaterial) => ({
    user_id: userId,
    course_id: courseId,
    kind: m.kind,
    format: m.format,
    title: m.title,
    week_label: m.weekLabel,
    sort_date: m.sortDate,
    source_url: m.sourceUrl,
  });
  // Upserts never touch status or pages. Files refresh their metadata from the source each run;
  // HTML/notebook readings are insert-only because conversion replaces their title with the page heading.
  const isReading = (m: FoundMaterial) => m.format === "html" || m.format === "ipynb";
  const files = found.filter((m) => !isReading(m)).map(toRow);
  const readings = found.filter(isReading).map(toRow);
  for (const [rows, ignoreDuplicates] of [[files, false], [readings, true]] as const) {
    if (!rows.length) continue;
    const { error } = await supabase.from("materials").upsert(rows, { onConflict: "user_id,source_url", ignoreDuplicates });
    if (error) throw new Error(error.message);
  }

  const withParent = found.filter((m) => m.parentUrl);
  if (!withParent.length) return;
  const { data: rows } = await supabase
    .from("materials")
    .select("id, source_url, parent_id")
    .eq("user_id", userId)
    .eq("course_id", courseId);
  const idOf = new Map((rows ?? []).map((r) => [r.source_url, r]));
  for (const m of withParent) {
    const child = idOf.get(m.sourceUrl);
    const parent = idOf.get(m.parentUrl!);
    if (child && parent && child.parent_id !== parent.id) {
      await supabase.from("materials").update({ parent_id: parent.id }).eq("id", child.id);
    }
  }
}

/**
 * Assignment descriptions arrive already converted, so they are saved `ready` with their page in one
 * pass (convertReadings only fetches pending/failed rows, and these URLs need a login). The page and
 * `processed_at` are rewritten only when the Markdown changed, so make-cards sees real edits as stale.
 */
async function saveAssignments(supabase: Client, userId: string, courseId: string, found: FoundAssignment[]) {
  for (const { material: m, markdown } of found) {
    const { data: existing } = await supabase
      .from("materials")
      .select("id, title")
      .eq("user_id", userId)
      .eq("source_url", m.sourceUrl)
      .maybeSingle();
    const now = new Date().toISOString();
    let id = existing?.id;
    if (!id) {
      const { data, error } = await supabase
        .from("materials")
        .insert({
          user_id: userId, course_id: courseId, kind: m.kind, format: m.format, title: m.title, week_label: m.weekLabel,
          sort_date: m.sortDate, source_url: m.sourceUrl, status: "ready", page_count: 1, processed_at: now,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = data.id;
      const { error: pageError } = await supabase
        .from("material_pages")
        .upsert({ material_id: id, page: 1, user_id: userId, markdown }, { onConflict: "material_id,page" });
      if (pageError) {
        await supabase.from("materials").delete().eq("id", id);
        throw new Error(pageError.message);
      }
      continue;
    }
    const { data: page } = await supabase.from("material_pages").select("markdown").eq("material_id", id).eq("page", 1).maybeSingle();
    if (page?.markdown === markdown) {
      if (existing!.title !== m.title) {
        const { error } = await supabase.from("materials").update({ title: m.title }).eq("id", id);
        if (error) throw new Error(error.message);
      }
      continue;
    }
    const { error } = await supabase
      .from("material_pages")
      .upsert({ material_id: id, page: 1, user_id: userId, markdown }, { onConflict: "material_id,page" });
    if (error) throw new Error(error.message);
    const { error: updateError } = await supabase
      .from("materials")
      .update({ title: m.title, sort_date: m.sortDate, status: "ready", error: null, page_count: 1, processed_at: now })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);
  }
}

/** Notebooks are stored by their raw GitHub URL (or a DataHub link, which is mapped to one). */
async function convertNotebook(url: string): Promise<{ title: string | null; markdown: string }> {
  const raw = datahubToRaw(url) ?? url;
  const res = await fetch(raw, { cache: "no-store" });
  if (!res.ok) throw new Error(`Notebook fetch returned ${res.status}`);
  return { title: null, markdown: notebookToMarkdown(await res.json()) };
}

/** Convert pending HTML readings to Markdown right away; they don't need Claude. */
async function convertReadings(supabase: Client, userId: string) {
  const { data: pending } = await supabase
    .from("materials")
    .select("id, source_url, format")
    .eq("user_id", userId)
    .in("format", ["html", "ipynb"])
    .in("status", ["pending", "failed"])
    .limit(READINGS_PER_RUN);
  await Promise.all(
    (pending ?? []).map(async (m) => {
      try {
        const { title, markdown } = m.format === "ipynb" ? await convertNotebook(m.source_url) : await convertReading(m.source_url);
        const { error } = await supabase
          .from("material_pages")
          .upsert({ material_id: m.id, page: 1, user_id: userId, markdown }, { onConflict: "material_id,page" });
        if (error) throw new Error(error.message);
        await supabase
          .from("materials")
          .update({ status: "ready", error: null, page_count: 1, processed_at: new Date().toISOString(), ...(title && { title }) })
          .eq("id", m.id);
      } catch (e) {
        await supabase
          .from("materials")
          .update({ status: "failed", error: e instanceof Error ? e.message : "Conversion failed" })
          .eq("id", m.id);
      }
    }),
  );
}

/**
 * Find materials for every course: its website when we have a parser for it, otherwise bCourses
 * files. New ones are stored as `pending` for the ingest-materials skill to transcribe.
 */
export async function discoverMaterials(supabase: Client, userId: string) {
  const [{ data: courses }, { data: canvas }] = await Promise.all([
    supabase.from("courses").select("id, code, website_url, canvas_id, hidden").eq("user_id", userId),
    supabase.from("class_connections").select("secret, status").eq("user_id", userId).eq("provider", "canvas").maybeSingle(),
  ]);
  const canvasToken = canvas && canvas.status !== "expired" ? decrypt(canvas.secret) : null;
  const errors: string[] = [];

  for (const course of (courses ?? []).filter((c) => !c.hidden)) {
    try {
      const adapter = course.website_url ? siteAdapter(course.website_url) : null;
      const found = adapter
        ? await adapter(course.website_url!)
        : course.canvas_id && canvasToken
          ? await discoverCanvasFiles(canvasToken, course.canvas_id)
          : [];
      await save(supabase, userId, course.id, found);
    } catch (e) {
      errors.push(`${course.code}: ${e instanceof Error ? e.message : "discovery failed"}`);
    }
    if (!course.website_url || !siteAdapter(course.website_url)) {
      if (course.canvas_id && canvasToken) {
        try {
          await saveAssignments(supabase, userId, course.id, await discoverCanvasAssignments(canvasToken, course.canvas_id));
        } catch (e) {
          errors.push(`${course.code}: ${e instanceof Error ? e.message : "assignment discovery failed"}`);
        }
      }
    }
  }
  await convertReadings(supabase, userId);
  return errors;
}
