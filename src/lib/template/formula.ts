/**
 * Small composable builders for the portable Excel-formula subset used across
 * the sheets. These exist so aggregation formulas are assembled from named
 * pieces instead of hand-concatenated `SUMIFS(...)`/`VLOOKUP(...)` strings, which
 * were duplicated (and error-prone re: quoting and the ubiquitous "유효=1" gate)
 * throughout the dashboard.
 *
 * Every function returns a formula string WITHOUT a leading "=". Output is kept
 * byte-for-byte identical to the previous hand-written form (verified via a
 * golden-XML diff), so no spreadsheet behaviour changes.
 */

/** A SUMIFS/COUNTIFS criterion: a resolved range A1 paired with a match value. */
export interface Criterion {
  /** Absolute A1 of the criteria range (e.g. `r.refColumn(COL.category)`). */
  range: string;
  /** The already-rendered match value (quoted string, number, or cell ref). */
  match: string;
}

/** Quotes a string as an Excel literal, e.g. `공통` -> `"공통"`. */
export function lit(value: string): string {
  return `"${value}"`;
}

/** `SUMIFS(sumRange, r1, v1, r2, v2, ...)`. */
export function sumifs(sumRange: string, criteria: Criterion[]): string {
  return `SUMIFS(${sumRange}${renderCriteria(criteria)})`;
}

/** `COUNTIFS(r1, v1, r2, v2, ...)`. */
export function countifs(criteria: Criterion[]): string {
  const rendered = criteria.map((c) => `${c.range},${c.match}`).join(',');
  return `COUNTIFS(${rendered})`;
}

/** `VLOOKUP(key, table, index, FALSE)` (exact match, the only form used here). */
export function vlookup(key: string, table: string, index: number): string {
  return `VLOOKUP(${key},${table},${index},FALSE)`;
}

/** Standard verdict cell: `IF(value>=req,"<ok>","<no>")`. */
export function verdict(
  value: string,
  req: string,
  ok: string,
  no: string,
): string {
  return `IF(${value}>=${req},"${ok}","${no}")`;
}

/**
 * Folds ordered lookups last-to-first into a nested `IFERROR(inner, outer)`
 * chain so the FIRST list entry ends up outermost (highest priority). `wrap`
 * builds the per-entry expression given the entry and the accumulated fallback;
 * `seed` is the innermost fallback.
 */
export function foldLookups<T>(
  entries: T[],
  seed: string,
  wrap: (entry: T, fallback: string) => string,
): string {
  let expr = seed;
  for (let i = entries.length - 1; i >= 0; i--) {
    expr = wrap(entries[i]!, expr);
  }
  return expr;
}

function renderCriteria(criteria: Criterion[]): string {
  return criteria.map((c) => `,${c.range},${c.match}`).join('');
}
