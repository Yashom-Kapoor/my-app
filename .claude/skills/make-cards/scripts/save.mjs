// Validate a cards.json, then save it incrementally (see merge.mjs) and mark the material's cards as up to date.
// Usage: node .claude/skills/make-cards/scripts/save.mjs <material-id> <cards.json>
// cards.json: { concepts: [{key,title,position}], cards: [{key,concept,other_concept_id?,level,page,front,back}] }
// concept is a key in this file (or already saved for this material), or "id:<uuid>" for an existing concept of the course.
// Everything is validated before anything is written.
import { readFileSync } from "node:fs";
import { db, fail, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { cardsMarker, planSave } from "./merge.mjs";

const [id, file] = process.argv.slice(2);
if (!id || !file) fail("usage: save.mjs <material-id> <cards.json>");
const userId = await ownerId();
const ok = (r) => {
  if (r.error) fail(r.error.message);
  return r.data;
};

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
  concepts: ok(await db.from("concepts").select("id, key, title, position, deleted_at").eq("material_id", id).eq("user_id", userId)),
  cards: ok(await db.from("cards").select("id, key, front, back, page, level, deleted_at").eq("material_id", id).eq("user_id", userId)),
};

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
  if (typeof c.concept === "string" && c.concept.startsWith("id:")) wanted.add(c.concept.slice(3));
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
    if (!Number.isInteger(c.page) || c.page < 1 || (m.page_count != null && c.page > m.page_count)) errors.push(`${at}: page ${c.page} is outside 1..${m.page_count}`);
  }
  if (typeof c.concept !== "string" || !c.concept) errors.push(`${at}: needs a concept (every card, including contrast)`);
  else if (c.concept.startsWith("id:")) {
    if (UUID.test(c.concept.slice(3)) && !usable(c.concept.slice(3))) errors.push(`${at}: concept ${c.concept} ${whyNot(c.concept.slice(3))}`);
  } else if (!conceptKeys.has(c.concept) && !savedKeys.has(c.concept)) errors.push(`${at}: unknown concept ${c.concept}`);
  if (c.level === "contrast" && !c.other_concept_id) errors.push(`${at}: contrast cards need other_concept_id`);
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
  concept_id: c.concept.startsWith("id:") ? c.concept.slice(3) : idByKey.get(c.concept),
  other_concept_id: c.other_concept_id ?? null,
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
