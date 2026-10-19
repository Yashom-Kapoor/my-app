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
