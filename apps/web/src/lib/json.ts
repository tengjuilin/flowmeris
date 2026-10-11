/**
 * JSON helpers for settings objects (plot styles, ridge settings). Both follow JSON semantics:
 * `undefined` members are dropped and non-finite numbers become null. For content-addressed ids and
 * fingerprints use `canonicalJson` from @flowmeris/model instead, which rejects non-finite numbers.
 */

/** A deep copy through JSON (`undefined` stays `undefined`). */
export function jsonClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** JSON with object keys sorted, so equal settings serialize equally whatever order they were set in. */
export function sortedJson(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );
}

/** Whether `a` and `b` are equal as JSON, ignoring the order of object keys. */
export function sameJson(a: unknown, b: unknown): boolean {
  return sortedJson(a) === sortedJson(b);
}
