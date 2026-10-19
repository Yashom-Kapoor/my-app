"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { encrypt } from "@/lib/classes/crypto";
import { normalizeCookie } from "@/lib/classes/gradescope";
import { discoverMaterials } from "@/lib/classes/materials/discover";
import { syncAll } from "@/lib/classes/sync";
import type { Provider } from "@/lib/classes/types";

export type ActionState = { ok: boolean; error?: string };

const providerSchema = z.enum(["gradescope", "canvas", "ed"]);

async function sync(onlyStale: boolean) {
  const user = await getUser();
  if (!user) return [];
  return syncAll(await createClient(), user.sub, { onlyStale });
}

/** Save (or replace) a source's credential, then sync it right away to check it works. */
export async function saveConnection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const provider = providerSchema.safeParse(formData.get("provider"));
  if (!provider.success) return { ok: false, error: "Unknown source" };
  let secret = String(formData.get("secret") ?? "").trim();
  if (provider.data === "gradescope") secret = normalizeCookie(secret);
  if (secret.length < 10) return { ok: false, error: "Paste the full value" };

  const supabase = await createClient();
  const { error } = await supabase.from("class_connections").upsert(
    {
      provider: provider.data,
      secret: encrypt(secret),
      status: "ok",
      last_error: null,
      last_synced_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) return { ok: false, error: error.message };

  const result = (await sync(true)).find((r) => r.provider === provider.data);
  refresh();
  return result && !result.ok ? { ok: false, error: `Saved, but sync failed: ${result.error}` } : { ok: true };
}

export async function removeConnection(provider: Provider) {
  const supabase = await createClient();
  await supabase.from("class_connections").delete().eq("provider", providerSchema.parse(provider));
  refresh();
}

/** Full sync, plus materials discovery (skipped on page-open syncs to keep those quick). */
export async function syncNow(): Promise<ActionState> {
  const errors = (await sync(false)).filter((r) => !r.ok).map((r) => `${r.provider}: ${r.error}`);
  const user = await getUser();
  if (user) errors.push(...(await discoverMaterials(await createClient(), user.sub)));
  refresh();
  return errors.length ? { ok: false, error: errors.join("; ") } : { ok: true };
}

/** Called when the Classes page opens; only syncs sources older than the stale window. */
export async function syncIfStale() {
  const results = await sync(true);
  if (results.length) refresh();
}

export async function setDone(id: string, done: boolean) {
  const supabase = await createClient();
  await supabase
    .from("assignments")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", z.uuid().parse(id));
  refresh();
}

export async function markRead(id: string) {
  const supabase = await createClient();
  await supabase
    .from("announcements")
    .update({ read_at: new Date().toISOString() })
    .eq("id", z.uuid().parse(id))
    .is("read_at", null);
  refresh();
}

export async function markAllRead(courseId?: string) {
  const supabase = await createClient();
  let query = supabase.from("announcements").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (courseId) query = query.eq("course_id", z.uuid().parse(courseId));
  await query;
  refresh();
}

const courseSchema = z.object({
  id: z.uuid(),
  code: z.string().trim().min(1, "Enter a code").max(40),
  name: z.string().trim().min(1, "Enter a name").max(120),
  hidden: z.boolean(),
  website_url: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a full https:// URL" })]).transform((u) => u || null),
});

export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = courseSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
    hidden: formData.get("hidden") === "on",
    website_url: String(formData.get("website_url") ?? "").trim(),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("courses").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/**
 * Fold one course into another (e.g. an Ed course that didn't auto-match its Gradescope course):
 * moves its assignments and announcements, copies its source links, and deletes it.
 */
export async function mergeCourse(sourceId: string, targetId: string): Promise<ActionState> {
  const ids = z.tuple([z.uuid(), z.uuid()]).safeParse([sourceId, targetId]);
  if (!ids.success || sourceId === targetId) return { ok: false, error: "Pick another course" };
  const supabase = await createClient();
  const { data: rows } = await supabase.from("courses").select().in("id", [sourceId, targetId]);
  const source = rows?.find((r) => r.id === sourceId);
  const target = rows?.find((r) => r.id === targetId);
  if (!source || !target) return { ok: false, error: "Course not found" };

  const links = {
    gradescope_id: target.gradescope_id ?? source.gradescope_id,
    canvas_id: target.canvas_id ?? source.canvas_id,
    ed_id: target.ed_id ?? source.ed_id,
  };
  for (const table of ["assignments", "announcements"] as const) {
    const { error } = await supabase.from(table).update({ course_id: targetId }).eq("course_id", sourceId);
    if (error) return { ok: false, error: error.message };
  }
  // Delete first: the source still holds the unique source ids the target is about to take.
  const { error: deleteError } = await supabase.from("courses").delete().eq("id", sourceId);
  if (deleteError) return { ok: false, error: deleteError.message };
  const { error } = await supabase.from("courses").update(links).eq("id", targetId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
