import { fail } from "../../ingest-materials/scripts/lib.mjs";

/** Unwrap a supabase result or exit with its error. */
export function ok(r) {
  if (r.error) fail(r.error.message);
  return r.data;
}

/** Read every row of a query past PostgREST's max_rows: `makeQuery()` must return a fresh builder each call. */
export async function fetchAll(makeQuery, size = 1000) {
  const rows = [];
  for (let from = 0; ; from += size) {
    const page = ok(await makeQuery().range(from, from + size - 1));
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
