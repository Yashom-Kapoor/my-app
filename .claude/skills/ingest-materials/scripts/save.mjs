// Save a material's transcription and mark it ready, or record a failure.
// Usage: node .claude/skills/ingest-materials/scripts/save.mjs <material-id> <pages.json>
//        node .claude/skills/ingest-materials/scripts/save.mjs <material-id> --fail "reason"
// pages.json: [{ "page": 1, "markdown": "...", "unreadable": false }, ...] covering every page.
import { readFileSync, rmSync } from "node:fs";
import { WORK_DIR, db, fail, ownerId } from "./lib.mjs";

const [id, arg, reason] = process.argv.slice(2);
if (!id || !arg) fail("usage: save.mjs <material-id> <pages.json> | --fail <reason>");
const userId = await ownerId();

if (arg === "--fail") {
  await db.from("materials").update({ status: "failed", error: reason ?? "transcription failed" }).eq("id", id).eq("user_id", userId);
  console.log("marked failed");
  process.exit(0);
}

const pages = JSON.parse(readFileSync(arg, "utf8"));
const { data: m } = await db.from("materials").select("page_count").eq("id", id).eq("user_id", userId).single();
if (!m) fail(`material ${id} not found`);
const got = new Set(pages.map((p) => p.page));
const missing = [...Array(m.page_count ?? 0).keys()].map((i) => i + 1).filter((n) => !got.has(n));
if (missing.length) fail(`pages.json is missing pages: ${missing.join(", ")}`);
if (pages.some((p) => typeof p.markdown !== "string")) fail("every page needs a markdown string");

const rows = pages.map((p) => ({
  material_id: id,
  user_id: userId,
  page: p.page,
  markdown: p.markdown.trim(),
  needs_review: !!p.unreadable,
}));
const { error } = await db.from("material_pages").upsert(rows, { onConflict: "material_id,page" });
if (error) fail(error.message);
// Drop pages beyond the current count, left from an older version of the file.
await db.from("material_pages").delete().eq("material_id", id).gt("page", m.page_count);
await db
  .from("materials")
  .update({ status: "ready", error: null, processed_at: new Date().toISOString() })
  .eq("id", id);
rmSync(`${WORK_DIR}/${id}`, { recursive: true, force: true });
console.log(`saved ${rows.length} pages (${rows.filter((r) => r.needs_review).length} flagged for review)`);
