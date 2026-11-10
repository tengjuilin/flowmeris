import type { FcsChannel } from './types.ts';

/**
 * DATA fast path (M-FCS-DATA): when every channel is a 32-bit float, or every channel is an unsigned
 * integer of the same 16- or 32-bit width, and the file's byte order is the host's little-endian order,
 * DATA is read through one typed-array view and split into columns block by block of events. The
 * values are the ones the DataView path in data.ts reads, including the integer `% range` masking.
 */

type Column = Float32Array | Float64Array;

/** True when the host stores numbers little-endian (checked once). */
export const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * The value width (2 or 4 bytes) when the fast path applies, otherwise 0. `little` and `permuted` come
 * from $BYTEORD.
 */
export function nativeWidth(
  channels: readonly FcsChannel[],
  widths: readonly number[],
  little: boolean,
  permuted: boolean,
): 0 | 2 | 4 {
  if (!HOST_LITTLE_ENDIAN || !little || permuted || channels.length === 0) return 0;
  if (channels.every((c) => c.dataType === 'F')) return 4;
  const w = widths[0];
  if ((w === 2 || w === 4) && channels.every((c, i) => c.dataType === 'I' && widths[i] === w)) return w;
  return 0;
}

/** The first `count` values of `w` bytes in `data`, viewed (or, when misaligned, copied) as a typed array. */
function view(data: Uint8Array, count: number, w: number): ArrayBuffer {
  return data.byteOffset % w === 0 ? (data.buffer as ArrayBuffer) : data.slice(0, count * w).buffer;
}

/** Events per block: a block's values stay in cache while it is split channel by channel. */
const BLOCK = 1024;

/**
 * Splits `n` events of interleaved native little-endian values into `columns`, a block of events at a
 * time. `ranges[c]` is the modulus of integer channel c (0: no masking), as in data.ts's readFast.
 */
export function decodeNative(
  data: Uint8Array,
  columns: Column[],
  n: number,
  w: 2 | 4,
  float: boolean,
  ranges: readonly number[],
): void {
  const count = n * columns.length;
  const buf = view(data, count, w);
  const off = buf === data.buffer ? data.byteOffset : 0;
  if (float) {
    // Floats are copied as bit patterns, so every value, NaN payloads included, is stored as written.
    // (Through a DataView a signaling NaN may or may not be quieted, depending on the JIT tier.)
    const cols = columns.map((col) => new Uint32Array(col.buffer, col.byteOffset, n));
    splitBits(new Uint32Array(buf, off, count), cols, n);
  } else if (w === 2) splitInt(new Uint16Array(buf, off, count), columns as Float32Array[], n, ranges);
  else splitInt(new Uint32Array(buf, off, count), columns as Float64Array[], n, ranges);
}

function splitBits(src: Uint32Array, cols: Uint32Array[], n: number): void {
  const par = cols.length;
  for (let e0 = 0; e0 < n; e0 += BLOCK) {
    const e1 = Math.min(n, e0 + BLOCK);
    for (let c = 0; c < par; c++) {
      const col = cols[c] as Uint32Array;
      for (let e = e0, p = e0 * par + c; e < e1; e++, p += par) col[e] = src[p] as number;
    }
  }
}

function splitInt<S extends Uint16Array | Uint32Array, D extends Float32Array | Float64Array>(
  src: S,
  cols: D[],
  n: number,
  ranges: readonly number[],
): void {
  const par = cols.length;
  for (let e0 = 0; e0 < n; e0 += BLOCK) {
    const e1 = Math.min(n, e0 + BLOCK);
    for (let c = 0; c < par; c++) {
      const col = cols[c] as D;
      const r = ranges[c] as number;
      if (r > 0) for (let e = e0, p = e0 * par + c; e < e1; e++, p += par) col[e] = (src[p] as number) % r;
      else for (let e = e0, p = e0 * par + c; e < e1; e++, p += par) col[e] = src[p] as number;
    }
  }
}
