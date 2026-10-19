// List ready materials whose cards are missing or stale (cards_hash differs from the content marker), oldest first, as JSON lines.
// Solutions are handled together with their parent worksheet, so they are not listed.
// Usage: node .claude/skills/make-cards/scripts/pending.mjs [--limit N] [--course "CS 161"]
import { db, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { cardsMarker } from "./merge.mjs";
import { fetchAll } from "./util.mjs";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const limit = Number(opt("--limit") ?? 500);

const userId = await ownerId();
const build = () => {
  let query = db
  .from("materials")
  .select("id, kind, format, title, week_label, sort_date, page_count, content_hash, processed_at, cards_hash, course:courses!inner ( code )")
  .eq("user_id", userId)
  .eq("status", "ready")
  .neq("kind", "solutions")
  .order("sort_date", { ascending: true, nullsFirst: false })
  .order("id");
  if (opt("--course")) query = query.eq("course.code", opt("--course"));
  return query;
};
const data = await fetchAll(build);

const waiting = data.filter((m) => m.cards_hash == null || m.cards_hash !== cardsMarker(m)).slice(0, limit);
console.log(`${waiting.length} waiting`);
for (const m of waiting) {
  console.log(
    JSON.stringify({ id: m.id, course: m.course.code, kind: m.kind, title: m.title, week: m.week_label ?? undefined, pages: m.page_count ?? undefined, stale: m.cards_hash != null || undefined }),
  );
}
