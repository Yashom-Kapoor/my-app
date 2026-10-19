// Validate a cards.json, then save it incrementally (see merge.mjs) and mark the material's cards as up to date.
// Usage: node .claude/skills/make-cards/scripts/save.mjs <material-id> <cards.json>
// cards.json: { concepts: [{key,title,position}], cards: [{key,concept,other_concept_id?,level,page,front,back}] }
// concept (required on every card, including contrast): a key in this file (or already saved for this material),
//   or "id:<uuid>" for an existing concept of the same course (enrich mode).
// Contrast cards also need a second concept, as either other_concept (same format as concept) or other_concept_id (a bare uuid).
// A card's page may point into the parent worksheet's solutions pages, so the range check allows the largest page of either.
// Everything is validated before anything is written.
// Zero-card materials (link-only pages, admin pages, duplicates): save.mjs <material-id> --none "reason" marks them carded without writing cards.
// Children (any material with a parent) and non-ready materials are rejected: save through the parent.
// other_concept / other_concept_id are allowed on contrast cards only.
import { readFileSync } from "node:fs";
import { db, fail, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { cardsMarker, checkSavable, planSave, referencedIds, resolveConceptRef, validateCards } from "./merge.mjs";
import { fetchAll, ok } from "./util.mjs";

const [id, file, reason] = process.argv.slice(2);
const none = file === "--none";
if (!id || !file || (none && !reason?.trim())) fail('usage: save.mjs <material-id> <cards.json> | save.mjs <material-id> --none "reason"');
const userId = await ownerId();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const incoming = none ? { concepts: [], cards: [] } : JSON.parse(readFileSync(file, "utf8"));
const cards = incoming.cards ?? [];

const m = ok(
  await db.from("materials").select("id, kind, status, parent_id, course_id, page_count, content_hash, processed_at").eq("id", id).eq("user_id", userId).maybeSingle(),
);
if (!m) fail(`material ${id} not found`);
const unsavable = checkSavable(m);
if (unsavable) fail(`not saved: ${unsavable}`);
const existing = {
  concepts: await fetchAll(() => db.from("concepts").select("id, key, title, position, deleted_at").eq("material_id", id).eq("user_id", userId).order("id")),
  cards: await fetchAll(() => db.from("cards").select("id, key, front, back, page, level, deleted_at").eq("material_id", id).eq("user_id", userId).order("id")),
};

// Highest page a card may cite: the material's own pages or its solutions' pages. Unknown page_count skips the check.
let maxPage = m.page_count;
if (maxPage != null) {
  const kids = ok(await db.from("materials").select("id").eq("parent_id", id).eq("user_id", userId));
  for (const k of kids) {
    const top = ok(await db.from("material_pages").select("page").eq("material_id", k.id).order("page", { ascending: false }).limit(1));
    if (top[0]) maxPage = Math.max(maxPage, top[0].page);
  }
}

const found = new Map();
const lookup = referencedIds(cards).filter((u) => UUID.test(u));
if (lookup.length) {
  for (const r of ok(await db.from("concepts").select("id, course_id, deleted_at").eq("user_id", userId).in("id", lookup))) found.set(r.id, r);
}
const errors = validateCards(incoming, { courseId: m.course_id, maxPage, savedConcepts: existing.concepts, found });
if (errors.length) fail(`not saved, ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);

if (none && existing.cards.some((c) => !c.deleted_at)) fail("not marked: this material already has cards, so it is not a zero-card material");
const plan = planSave(existing, incoming);
const base = { user_id: userId, course_id: m.course_id, material_id: id };

const inserted = plan.insertConcepts.length
  ? ok(await db.from("concepts").insert(plan.insertConcepts.map((c) => ({ ...base, ...c }))).select("id, key"))
  : [];
const idByKey = new Map([...existing.concepts.filter((c) => !c.deleted_at), ...inserted].map((c) => [c.key, c.id]));
for (const c of plan.updateConcepts) ok(await db.from("concepts").update({ title: c.title, position: c.position }).eq("id", c.id).eq("user_id", userId));

const cardRows = plan.insertCards.map((c) => ({
  ...base,
  key: c.key,
  concept_id: resolveConceptRef(c.concept, idByKey),
  other_concept_id: c.other_concept != null ? resolveConceptRef(c.other_concept, idByKey) : (c.other_concept_id ?? null),
  level: c.level,
  page: c.page ?? null,
  front: c.front,
  back: c.back,
}));
if (cardRows.length) ok(await db.from("cards").insert(cardRows).select("id"));
for (const { id: cardId, ...fields } of plan.updateCards) ok(await db.from("cards").update(fields).eq("id", cardId).eq("user_id", userId));

// Mark this material and its solutions (handled together) as up to date.
const marker = cardsMarker(m);
ok(await db.from("materials").update({ cards_hash: marker }).eq("id", id).eq("user_id", userId).select("id"));
const kids = ok(await db.from("materials").select("id").eq("parent_id", id).eq("user_id", userId));
if (kids.length) ok(await db.from("materials").update({ cards_hash: marker }).in("id", kids.map((k) => k.id)).eq("user_id", userId).select("id"));

if (none) {
  console.log(`marked as carded with zero cards (${reason.trim()})`);
  process.exit(0);
}
console.log(
  `concepts: +${plan.insertConcepts.length} ~${plan.updateConcepts.length}; cards: +${plan.insertCards.length} ~${plan.updateCards.length}; skipped ${cards.length - plan.insertCards.length - plan.updateCards.length} unchanged or deleted`,
);
