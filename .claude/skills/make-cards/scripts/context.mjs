// Write .cards/<id>/context.json: the material's pages, its children's pages (solutions, notebooks), other concepts in the course,
// existing card fronts from same-week materials, and what is already saved.
// Usage: node .claude/skills/make-cards/scripts/context.mjs <material-id>
import { mkdirSync, writeFileSync } from "node:fs";
import { db, fail, ownerId } from "../../ingest-materials/scripts/lib.mjs";
import { fetchAll, ok } from "./util.mjs";

const id = process.argv[2];
if (!id) fail("usage: context.mjs <material-id>");
const userId = await ownerId();

const m = ok(
  await db.from("materials").select("id, kind, title, week_label, course_id, status, parent_id, course:courses ( code )").eq("id", id).eq("user_id", userId).maybeSingle(),
);
if (!m) fail(`material ${id} not found`);
if (m.status !== "ready") fail(`material ${id} is ${m.status}, not ready`);

const pagesOf = async (materialId) =>
  fetchAll(() => db.from("material_pages").select("page, markdown").eq("material_id", materialId).eq("user_id", userId).order("page"));

const context = {
  material: { id: m.id, kind: m.kind, title: m.title, week_label: m.week_label, course: m.course.code },
  pages: await pagesOf(id),
};
const kids = ok(
  await db.from("materials").select("id, kind, title, sort_date").eq("parent_id", id).eq("user_id", userId).eq("status", "ready").order("sort_date", { nullsFirst: true }).order("id"),
);
if (kids.length) {
  context.children = [];
  for (const k of kids) context.children.push({ id: k.id, kind: k.kind, title: k.title, pages: await pagesOf(k.id) });
}

const others = await fetchAll(() =>
  db
    .from("concepts")
    .select("id, title, material:materials!inner ( title, week_label )")
    .eq("user_id", userId)
    .eq("course_id", m.course_id)
    .neq("material_id", id)
    .is("deleted_at", null)
    .order("id"),
);
context.course_concepts = others.map((c) => ({ id: c.id, title: c.title, material_title: c.material.title, week_label: c.material.week_label }));

context.existing = {
  concepts: await fetchAll(() => db.from("concepts").select("id, key, title, position, deleted_at").eq("material_id", id).eq("user_id", userId).order("position").order("id")),
  cards: await fetchAll(() => db.from("cards").select("id, key, concept_id, other_concept_id, level, page, front, back, deleted_at").eq("material_id", id).eq("user_id", userId).order("key")),
};

// Existing card fronts from this material's parent/children and from other same-course materials in the same week,
// so duplicates can be skipped. Capped; fronts truncated.
const CARD_CAP = 400;
const sameWeek = m.week_label
  ? await fetchAll(() =>
      db.from("materials").select("id, title").eq("user_id", userId).eq("course_id", m.course_id).eq("week_label", m.week_label).neq("id", id).order("sort_date", { ascending: true, nullsFirst: false }).order("id"),
    )
  : [];
// Priority order for the cap: parent, then children, then same-week materials oldest first.
const related = new Map();
if (m.parent_id) {
  const parent = ok(await db.from("materials").select("id, title").eq("id", m.parent_id).eq("user_id", userId).maybeSingle());
  if (parent) related.set(parent.id, parent.title);
}
for (const k of kids) related.set(k.id, k.title);
for (const x of sameWeek) if (!related.has(x.id)) related.set(x.id, x.title);
context.course_cards = [];
if (related.size) {
  const rows = await fetchAll(() =>
    db.from("cards").select("material_id, level, front").eq("user_id", userId).in("material_id", [...related.keys()]).is("deleted_at", null).order("material_id").order("key"),
  );
  const order = [...related.keys()];
  rows.sort((a, b) => order.indexOf(a.material_id) - order.indexOf(b.material_id));
  const kept = rows.slice(0, CARD_CAP);
  context.course_cards = kept.map((c) => ({ material_title: related.get(c.material_id), level: c.level, front: c.front.length > 240 ? `${c.front.slice(0, 240)}...` : c.front }));
  if (rows.length > CARD_CAP) {
    const cut = new Set(rows.slice(CARD_CAP).map((c) => related.get(c.material_id)));
    console.log(`course_cards capped at ${CARD_CAP} of ${rows.length}; truncated or dropped: ${[...cut].join("; ")}`);
  }
}

const dir = `.cards/${id}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/context.json`, JSON.stringify(context, null, 1));
console.log(
  `${dir}/context.json: ${context.pages.length} pages, ${(context.children ?? []).map((c) => `${c.pages.length} ${c.kind} pages`).join(", ") || "no children"}, ${context.course_concepts.length} course concepts, ${context.course_cards.length} course cards, ${context.existing.concepts.length} existing concepts, ${context.existing.cards.length} existing cards`,
);
