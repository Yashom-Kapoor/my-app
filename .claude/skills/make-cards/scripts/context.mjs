// Write .cards/<id>/context.json: the material's pages (and its solutions' pages), other concepts in the course, and what is already saved.
// Usage: node .claude/skills/make-cards/scripts/context.mjs <material-id>
import { mkdirSync, writeFileSync } from "node:fs";
import { db, fail, ownerId } from "../../ingest-materials/scripts/lib.mjs";

const id = process.argv[2];
if (!id) fail("usage: context.mjs <material-id>");
const userId = await ownerId();
const ok = (r) => {
  if (r.error) fail(r.error.message);
  return r.data;
};

const m = ok(
  await db.from("materials").select("id, kind, title, week_label, course_id, status, course:courses ( code )").eq("id", id).eq("user_id", userId).maybeSingle(),
);
if (!m) fail(`material ${id} not found`);
if (m.status !== "ready") fail(`material ${id} is ${m.status}, not ready`);

const pagesOf = async (materialId) =>
  ok(await db.from("material_pages").select("page, markdown").eq("material_id", materialId).eq("user_id", userId).order("page"));

const context = {
  material: { id: m.id, kind: m.kind, title: m.title, week_label: m.week_label, course: m.course.code },
  pages: await pagesOf(id),
};
const children = ok(await db.from("materials").select("id").eq("parent_id", id).eq("user_id", userId).eq("kind", "solutions").eq("status", "ready"));
if (children.length) context.solutions_pages = (await Promise.all(children.map((c) => pagesOf(c.id)))).flat();

const others = ok(
  await db
    .from("concepts")
    .select("id, title, material:materials!inner ( title, week_label )")
    .eq("user_id", userId)
    .eq("course_id", m.course_id)
    .neq("material_id", id)
    .is("deleted_at", null)
    .order("position"),
);
context.course_concepts = others.map((c) => ({ id: c.id, title: c.title, material_title: c.material.title, week_label: c.material.week_label }));

context.existing = {
  concepts: ok(await db.from("concepts").select("id, key, title, position, deleted_at").eq("material_id", id).eq("user_id", userId).order("position")),
  cards: ok(await db.from("cards").select("id, key, concept_id, other_concept_id, level, page, front, back, deleted_at").eq("material_id", id).eq("user_id", userId).order("key")),
};

const dir = `.cards/${id}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/context.json`, JSON.stringify(context, null, 1));
console.log(
  `${dir}/context.json: ${context.pages.length} pages, ${context.solutions_pages?.length ?? 0} solutions pages, ${context.course_concepts.length} course concepts, ${context.existing.concepts.length} existing concepts, ${context.existing.cards.length} existing cards`,
);
