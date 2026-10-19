const iso = (value: string): string | null => {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * True when the card is still as the client saw it, so rating it now is not a double tap or a
 * stale session. Compared as timestamps: Postgres may format `last_review` differently than the
 * client sent it back.
 */
export function shouldApplyRating(current: string | null, seen: string | null): boolean {
  if (current === null || seen === null) return current === seen;
  const a = iso(current);
  const b = iso(seen);
  return a !== null && a === b;
}
