// Check saved transcriptions: page counts, flagged pages, and whether page 1 belongs to the material.
// Usage: node .claude/skills/ingest-materials/scripts/check.mjs [--since 2026-10-19T00:00Z] [<material-id> ...]
// Prints one tab-separated line per material: status, course, saved/expected pages, flagged, title | page 1's first line.
// A line starting with "!" has a page-count mismatch.
import { db, fail, ownerId } from "./lib.mjs";

const args = process.argv.slice(2);
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--since");
if (!since && !ids.length) fail("usage: check.mjs [--since ISO] [<material-id> ...]");

const userId = await ownerId();
let query = db
  .from("materials")
  .select("id, title, status, page_count, course:courses ( code )")
  .eq("user_id", userId)
  .neq("format", "html")
  .order("processed_at");
if (ids.length) query = query.in("id", ids);
if (since) query = query.gte("processed_at", since);
const { data: materials, error } = await query;
if (error) fail(error.message);

for (const m of materials) {
  const { data: pages } = await db.from("material_pages").select("page, markdown, needs_review").eq("material_id", m.id).order("page");
  const first = (pages[0]?.markdown ?? "").split("\n").find((l) => l.trim()) ?? "";
  const flagged = pages.filter((p) => p.needs_review).length;
  const mark = pages.length === m.page_count ? " " : "!";
  console.log(
    `${mark} ${m.status}\t${m.course.code}\t${pages.length}/${m.page_count}\tflagged=${flagged}\t${m.title} | ${first.slice(0, 80)}`,
  );
}
console.log(`${materials.length} checked`);
