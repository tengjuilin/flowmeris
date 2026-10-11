import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Canonical JSON serialization (method M-MODEL-CANON).
 *
 * - Object keys are sorted by UTF-16 code unit order.
 * - `undefined` members are omitted (as JSON.stringify does).
 * - Numbers use ECMAScript Number::toString, which is the shortest string that
 *   round-trips to the same IEEE-754 double. Non-finite numbers are rejected
 *   because JSON cannot represent them; use `null` for "unbounded".
 * - `-0` serializes as `0`.
 *
 * Two semantically equal documents therefore always hash to the same digest.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'number':
      if (!Number.isFinite(v)) throw new RangeError(`canonicalJson: non-finite number ${v}`);
      return Object.is(v, -0) ? '0' : String(v);
    case 'string':
      return JSON.stringify(v);
    case 'boolean':
      return v ? 'true' : 'false';
    case 'object': {
      if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : serialize(x))).join(',')}]`;
      if (ArrayBuffer.isView(v)) throw new TypeError('canonicalJson: typed arrays are not serializable');
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof v}`);
  }
}

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/**
 * Content fingerprint of any JSON-like value: first 32 hex chars (128 bits) of
 * SHA-256 over its canonical JSON. Used as cache keys (ADR-0004).
 */
export function fingerprint(value: unknown): string {
  return sha256Hex(canonicalJson(value)).slice(0, 32);
}
