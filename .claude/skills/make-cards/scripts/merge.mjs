// Pure planning for an incremental, delete-safe save. No database access.
// existing: { concepts: [{id,key,title,position,deleted_at}], cards: [{id,key,front,back,page,level,deleted_at}] } (this material's rows)
// incoming: { concepts: [{key,title,position}], cards: [{key,concept,...}] }
// Soft-deleted rows are never updated or re-inserted, and cards of a deleted concept are skipped.
// Updates carry only text fields, so FSRS state is never touched. Existing keys absent from incoming are left alone.
export function planSave(existing, incoming) {
  const conceptByKey = new Map(existing.concepts.map((c) => [c.key, c]));
  const cardByKey = new Map(existing.cards.map((c) => [c.key, c]));
  const plan = { insertConcepts: [], updateConcepts: [], insertCards: [], updateCards: [] };

  for (const c of incoming.concepts ?? []) {
    const old = conceptByKey.get(c.key);
    if (!old) plan.insertConcepts.push({ key: c.key, title: c.title, position: c.position });
    else if (!old.deleted_at && (old.title !== c.title || old.position !== c.position)) {
      plan.updateConcepts.push({ id: old.id, title: c.title, position: c.position });
    }
  }

  for (const c of incoming.cards ?? []) {
    const ownConcept = conceptByKey.get(c.concept);
    if (ownConcept?.deleted_at) continue;
    const old = cardByKey.get(c.key);
    if (!old) plan.insertCards.push(c);
    else if (!old.deleted_at && (old.front !== c.front || old.back !== c.back || old.page !== c.page || old.level !== c.level)) {
      plan.updateCards.push({ id: old.id, front: c.front, back: c.back, page: c.page, level: c.level });
    }
  }
  return plan;
}

/** The change marker for a material: content_hash for PDFs, processed_at (ISO text) for HTML readings. */
export function cardsMarker(m) {
  return m.content_hash ?? (m.processed_at ? new Date(m.processed_at).toISOString() : null);
}

/** Parse a concept reference: "id:<uuid>" -> { id }, any other non-empty string -> { key }, else null. */
export function parseConceptRef(ref) {
  if (typeof ref !== "string" || !ref) return null;
  return ref.startsWith("id:") ? { id: ref.slice(3) } : { key: ref };
}

/** Resolve a reference to a concept id given key->id (live concepts of this material, incl. just inserted). Null if unresolved. */
export function resolveConceptRef(ref, idByKey) {
  const p = parseConceptRef(ref);
  if (!p) return null;
  return p.id ?? idByKey.get(p.key) ?? null;
}

export const LEVELS = ["explain", "why", "apply", "contrast", "trap"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a material's cards are missing or stale: cards_hash absent or different from the content marker. */
export function needsCards(m) {
  return m.cards_hash == null || m.cards_hash !== cardsMarker(m);
}

/** Why a material can't be saved directly (or null). Children are saved via their parent; a marker is required. */
export function checkSavable(m) {
  if (m.status !== "ready") return `material is ${m.status}, not ready`;
  if (m.parent_id) return `material is a child (${m.kind}) of ${m.parent_id}; save its cards through the parent`;
  if (cardsMarker(m) == null) return "material has no marker (neither content_hash nor processed_at), so it can't be marked as carded";
  return null;
}

/** Every concept uuid a cards.json refers to (for lookup before validation). */
export function referencedIds(cards) {
  const ids = new Set();
  for (const c of cards) {
    for (const ref of [c.concept, c.other_concept]) {
      const p = parseConceptRef(ref);
      if (p?.id) ids.add(p.id);
    }
    if (c.other_concept_id) ids.add(c.other_concept_id);
  }
  return [...ids];
}

/**
 * Validate a cards.json without touching the database. Returns a list of problem strings.
 * ctx: { courseId, maxPage (null = unchecked), savedConcepts: [{key, deleted_at}], found: Map<uuid, {course_id, deleted_at}> }
 */
export function validateCards(incoming, ctx) {
  const errors = [];
  const concepts = incoming.concepts ?? [];
  const cards = incoming.cards ?? [];
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

  const badUuid = referencedIds(cards).filter((u) => !UUID.test(u));
  if (badUuid.length) errors.push(`not a uuid: ${badUuid.join(", ")}`);
  const usable = (u) => ctx.found.has(u) && ctx.found.get(u).course_id === ctx.courseId && !ctx.found.get(u).deleted_at;
  const whyNot = (u) => (!ctx.found.has(u) ? "does not exist" : ctx.found.get(u).course_id !== ctx.courseId ? "is in another course" : "is deleted");
  const savedLive = new Set(ctx.savedConcepts.filter((c) => !c.deleted_at).map((c) => c.key));
  const savedDeleted = new Set(ctx.savedConcepts.filter((c) => c.deleted_at).map((c) => c.key));

  for (const c of cards) {
    const at = `card ${c.key}`;
    if (!LEVELS.includes(c.level)) errors.push(`${at}: level must be one of ${LEVELS.join(", ")}`);
    if (typeof c.front !== "string" || !c.front.trim() || typeof c.back !== "string" || !c.back.trim()) errors.push(`${at}: needs front and back text`);
    if (c.page != null && (!Number.isInteger(c.page) || c.page < 1 || (ctx.maxPage != null && c.page > ctx.maxPage))) {
      errors.push(`${at}: page ${c.page} is outside 1..${ctx.maxPage ?? "?"}`);
    }
    const checkRef = (ref, field) => {
      const p = parseConceptRef(ref);
      if (!p) errors.push(`${at}: needs ${field}${field === "concept" ? " (every card, including contrast)" : ""}`);
      else if (p.id) {
        if (UUID.test(p.id) && !usable(p.id)) errors.push(`${at}: ${field} ${ref} ${whyNot(p.id)}`);
      } else if (conceptKeys.has(p.key) || savedLive.has(p.key)) {
        // fine
      } else if (savedDeleted.has(p.key)) errors.push(`${at}: ${field} ${ref} points at a deleted concept`);
      else errors.push(`${at}: unknown ${field} ${ref}`);
    };
    checkRef(c.concept, "concept");
    const hasOther = c.other_concept != null || c.other_concept_id != null;
    if (c.level === "contrast") {
      if (!hasOther || (c.other_concept == null && !c.other_concept_id)) errors.push(`${at}: contrast cards need other_concept (key or id:<uuid>)`);
      else if (c.other_concept != null) checkRef(c.other_concept, "other_concept");
      if (c.other_concept_id && UUID.test(c.other_concept_id) && !usable(c.other_concept_id)) errors.push(`${at}: other_concept_id ${whyNot(c.other_concept_id)}`);
      // A contrast needs two different concepts: compare by key, or by id (id: refs and other_concept_id).
      const mine = parseConceptRef(c.concept);
      const others = [parseConceptRef(c.other_concept), c.other_concept_id ? { id: c.other_concept_id } : null].filter(Boolean);
      if (mine && others.some((o) => (mine.id && o.id ? mine.id === o.id : mine.key && o.key && mine.key === o.key))) {
        errors.push(`${at}: contrast other_concept is the same concept as concept`);
      }
    } else if (hasOther) {
      errors.push(`${at}: other_concept / other_concept_id are only allowed on contrast cards, not on ${c.level} cards`);
    }
  }
  return errors;
}
