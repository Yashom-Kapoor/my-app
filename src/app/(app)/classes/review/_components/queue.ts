/** Pure queue bookkeeping for the review session. `idx` is the card currently shown. */

export const AGAIN_GAP = 3;

/** Reinsert `card` (the one at `idx`) AGAIN_GAP cards after the next one. */
export function requeueAgain<T>(queue: T[], idx: number, card: T): T[] {
  const next = [...queue];
  next.splice(Math.min(idx + 1 + AGAIN_GAP, next.length), 0, card);
  return next;
}

/**
 * Delete the card at `idx` and any later (Again) copies of it. Earlier copies were already
 * passed, so they stay and idx is adjusted by however many removed entries sit before it (none).
 */
export function removeCurrent<T extends { id: string }>(queue: T[], idx: number): { queue: T[]; idx: number } {
  const card = queue[idx];
  if (!card) return { queue, idx };
  const next = queue.filter((c, i) => i < idx || c.id !== card.id);
  return { queue: next, idx };
}
