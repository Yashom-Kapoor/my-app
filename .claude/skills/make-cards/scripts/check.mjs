// One line per material with cards: concepts, then cards per level. "!" flags a slides or notes material with 0 explain cards.
// Usage: node .claude/skills/make-cards/scripts/check.mjs [--since 2026-10-19T00:00Z]
import { db, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { fetchAll } from "./util.mjs";

const args = process.argv.slice(2);
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;
const userId = await ownerId();

const materials = await fetchAll(() =>
  db.from("materials").select("id, kind, title, cards_hash, course:courses ( code )").eq("user_id", userId).eq("status", "ready").neq("kind", "solutions").order("sort_date", { nullsFirst: false }).order("id"),
);
const concepts = await fetchAll(() => db.from("concepts").select("material_id").eq("user_id", userId).is("deleted_at", null).order("id"));
const cards = await fetchAll(() => db.from("cards").select("material_id, level, created_at").eq("user_id", userId).is("deleted_at", null).order("id"));

const LEVELS = ["explain", "why", "apply", "contrast", "trap"];
let shown = 0;
for (const m of materials) {
  const mine = cards.filter((c) => c.material_id === m.id);
  const nConcepts = concepts.filter((c) => c.material_id === m.id).length;
  if (!mine.length && !nConcepts) continue;
  if (since && !mine.some((c) => c.created_at >= since)) continue;
  const per = Object.fromEntries(LEVELS.map((l) => [l, mine.filter((c) => c.level === l).length]));
  const flag = per.explain === 0 && ["slides", "notes"].includes(m.kind) ? "!" : " ";
  console.log(`${flag} ${m.course.code}\t${m.title}\tconcepts=${nConcepts}\t${LEVELS.map((l) => `${l}=${per[l]}`).join(" ")}`);
  shown++;
}
console.log(`${shown} checked`);
