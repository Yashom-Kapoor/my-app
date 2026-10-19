// Validate a cards.json, then save it incrementally (see merge.mjs) and mark the material's cards as up to date.
// Usage: node .claude/skills/make-cards/scripts/save.mjs <material-id> <cards.json>
// cards.json: { concepts: [{key,title,position}], cards: [{key,concept,other_concept_id?,level,page,front,back}] }
// concept (required on every card, including contrast): a key in this file (or already saved for this material),
//   or "id:<uuid>" for an existing concept of the same course (enrich mode).
// Contrast cards also need a second concept, as either other_concept (same format as concept) or other_concept_id (a bare uuid).
// A card's page may point into the parent worksheet's solutions pages, so the range check allows the largest page of either.
// Everything is validated before anything is written.
import { readFileSync } from "node:fs";
import { db, fail, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { cardsMarker, parseConceptRef, planSave, resolveConceptRef } from "./merge.mjs";
import { fetchAll, ok } from "./util.mjs";

const [id, file] = process.argv.slice(2);
if (!id || !file) fail("usage: save.mjs <material-id> <cards.json>");
const userId = await ownerId();

const LEVELS = ["explain", "why", "apply", "contrast", "trap"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const incoming = JSON.parse(readFileSync(file, "utf8"));
const concepts = incoming.concepts ?? [];
const cards = incoming.cards ?? [];

const m = ok(
  await db.from("materials").select("id, course_id, page_count, content_hash, processed_at").eq("id", id).eq("user_id", userId).maybeSingle(),
);
if (!m) fail(`material ${id} not found`);
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

const errors = [];
const seen = (list, what) => {
  const keys = new Set();
  for (const x of list) {
    if (typeof x.key !== "string" || !x.key) errors.push(`${what} without a key`);
    else if (keys.has(x.key)) errors.push(`duplicate ${what} key ${x.key}`);
    else keys.add(x.key);
  }
  return keys;
};
const conceptKeys = seen(concepts, "concept");
seen(cards, "card");
for (const c of concepts) {
  if (typeof c.title !== "string" || !c.title.trim()) errors.push(`concept ${c.key} needs a title`);
  if (!Number.isInteger(c.position)) errors.push(`concept ${c.key} needs an integer position`);
}

// "id:<uuid>" references and other_concept_id must exist, belong to this user and course, and not be deleted.
const wanted = new Set();
for (const c of cards) {
  for (const ref of [c.concept, c.other_concept]) {
    const p = parseConceptRef(ref);
    if (p?.id) wanted.add(p.id);
  }
  if (c.other_concept_id) wanted.add(c.other_concept_id);
}
const badUuid = [...wanted].filter((u) => !UUID.test(u));
if (badUuid.length) errors.push(`not a uuid: ${badUuid.join(", ")}`);
const found = new Map();
const lookup = [...wanted].filter((u) => UUID.test(u));
if (lookup.length) {
  for (const r of ok(await db.from("concepts").select("id, course_id, deleted_at").eq("user_id", userId).in("id", lookup))) found.set(r.id, r);
}
const usable = (u) => found.has(u) && found.get(u).course_id === m.course_id && !found.get(u).deleted_at;
const whyNot = (u) => (!found.has(u) ? "does not exist" : found.get(u).course_id !== m.course_id ? "is in another course" : "is deleted");

const savedKeys = new Set(existing.concepts.map((c) => c.key));
for (const c of cards) {
  const at = `card ${c.key}`;
  if (!LEVELS.includes(c.level)) errors.push(`${at}: level must be one of ${LEVELS.join(", ")}`);
  if (typeof c.front !== "string" || !c.front.trim() || typeof c.back !== "string" || !c.back.trim()) errors.push(`${at}: needs front and back text`);
  if (c.page != null) {
    if (!Number.isInteger(c.page) || c.page < 1 || (maxPage != null && c.page > maxPage)) errors.push(`${at}: page ${c.page} is outside 1..${maxPage ?? "?"}`);
  }
  const checkRef = (ref, field) => {
    const p = parseConceptRef(ref);
    if (!p) errors.push(`${at}: needs ${field}${field === "concept" ? " (every card, including contrast)" : ""}`);
    else if (p.id) {
      if (!UUID.test(p.id)) return;
      if (!usable(p.id)) errors.push(`${at}: ${field} ${ref} ${whyNot(p.id)}`);
    } else if (!conceptKeys.has(p.key) && !savedKeys.has(p.key)) errors.push(`${at}: unknown ${field} ${ref}`);
  };
  checkRef(c.concept, "concept");
  if (c.level === "contrast") {
    if (c.other_concept == null && !c.other_concept_id) errors.push(`${at}: contrast cards need other_concept (key or id:<uuid>)`);
    else if (c.other_concept != null) checkRef(c.other_concept, "other_concept");
  }
  if (c.other_concept_id && UUID.test(c.other_concept_id) && !usable(c.other_concept_id)) errors.push(`${at}: other_concept_id ${whyNot(c.other_concept_id)}`);
}
if (errors.length) fail(`not saved, ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);

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

console.log(
  `concepts: +${plan.insertConcepts.length} ~${plan.updateConcepts.length}; cards: +${plan.insertCards.length} ~${plan.updateCards.length}; skipped ${cards.length - plan.insertCards.length - plan.updateCards.length} unchanged or deleted`,
);
