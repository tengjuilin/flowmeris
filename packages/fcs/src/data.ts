import { latin1 } from './text.ts';
import { type FcsChannel, FcsParseError, type FcsWarning } from './types.ts';

/** DATA segment (M-FCS-DATA): list-mode events decoded into one column per channel. */

type Column = Float32Array | Float64Array;

interface ByteOrder {
  little: boolean;
  /** Explicit byte permutation for widths equal to its length (e.g. 3,4,1,2). */
  perm: number[] | null;
}

function parseByteOrder(byteord: string): ByteOrder {
  const parts = byteord.split(',').map((s) => Number.parseInt(s.trim(), 10));
  if (parts.some((p) => !Number.isFinite(p))) {
    throw new FcsParseError('E-BYTEORD', `Malformed $BYTEORD "${byteord}"`);
  }
  const asc = parts.every((p, i) => p === i + 1);
  const desc = parts.every((p, i) => p === parts.length - i);
  if (asc) return { little: true, perm: null };
  if (desc) return { little: false, perm: null };
  return { little: true, perm: parts.map((p) => p - 1) };
}

function nextPow2(x: number): number {
  if (x <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(x) - 1e-12);
}

export function decodeData(
  data: Uint8Array,
  channels: FcsChannel[],
  tot: number,
  byteord: string,
  warnings: FcsWarning[],
): { columns: Column[]; eventCount: number } {
  const par = channels.length;
  if (par === 0) return { columns: [], eventCount: tot };

  const allAscii = channels.every((c) => c.dataType === 'A');
  if (channels.some((c) => c.dataType === 'A') && !allAscii) {
    throw new FcsParseError(
      'E-DATATYPE-MIXED-ASCII',
      'Mixing ASCII with binary channel data types is not supported',
    );
  }
  if (allAscii) return decodeAscii(data, channels, tot, warnings);

  const order = parseByteOrder(byteord);
  const widths = binaryWidths(channels, warnings);
  const bytesPerEvent = widths.reduce((a, b) => a + b, 0);
  const n = eventsHeld(data, tot, bytesPerEvent, warnings);

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const columns: Column[] = channels.map((c, i) => {
    const w = widths[i] as number;
    // Float32 is exact for single floats and integers up to 24 bits.
    const exactF32 = c.dataType === 'F' || (c.dataType === 'I' && w <= 3);
    return exactF32 ? new Float32Array(n) : new Float64Array(n);
  });

  let base = 0;
  for (let ci = 0; ci < par; ci++) {
    const c = channels[ci] as FcsChannel;
    const w = widths[ci] as number;
    const col = columns[ci] as Column;
    const usePerm = order.perm !== null && order.perm.length === w;
    if (order.perm !== null && !usePerm && w > 1) {
      throw new FcsParseError(
        'E-BYTEORD-WIDTH',
        `$BYTEORD permutation of length ${order.perm.length} cannot be applied to ${w}-byte values`,
      );
    }
    const layout = { dv, n, base, stride: bytesPerEvent, little: order.little };
    if (
      !usePerm &&
      (c.dataType === 'F' || c.dataType === 'D' || (c.dataType === 'I' && (w === 2 || w === 4)))
    )
      readFast(col, c, w, layout);
    else
      readGeneric(col, c, w, layout, usePerm ? valueReader(c, w, data, order.perm) : valueReader(c, w, data));
    base += w;
  }
  return { columns, eventCount: n };
}

/** Bytes per value of each channel of binary data ($PnB, or the float width). */
function binaryWidths(channels: FcsChannel[], warnings: FcsWarning[]): number[] {
  const widths: number[] = channels.map((c) => {
    if (c.dataType === 'F') return 4;
    if (c.dataType === 'D') return 8;
    if (c.pnb === '*') throw new FcsParseError('E-PNB', `$P${c.n}B "*" is only valid for ASCII data`);
    if (c.pnb % 8 !== 0 || c.pnb === 0 || c.pnb > 64) {
      throw new FcsParseError(
        'E-PNB-UNALIGNED',
        `$P${c.n}B=${c.pnb}: integer widths that are not a multiple of 8 bits are not supported`,
      );
    }
    return c.pnb / 8;
  });
  for (const c of channels) {
    if ((c.dataType === 'F' && c.pnb !== 32) || (c.dataType === 'D' && c.pnb !== 64)) {
      warnings.push({
        code: 'Q-PNB-FLOAT-WIDTH',
        message: `$P${c.n}B=${c.pnb} inconsistent with data type ${c.dataType}; width ${c.dataType === 'F' ? 32 : 64} used`,
      });
    }
  }
  return widths;
}

/** The number of complete events DATA holds, at most $TOT. */
function eventsHeld(data: Uint8Array, tot: number, bytesPerEvent: number, warnings: FcsWarning[]): number {
  const available = Math.floor(data.length / bytesPerEvent);
  if (available < tot) {
    warnings.push({
      code: 'Q-DATA-SHORT',
      message: `DATA segment holds ${available} complete events but $TOT=${tot}; ${available} events read`,
    });
    return available;
  }
  if (data.length !== tot * bytesPerEvent) {
    const extra = data.length - tot * bytesPerEvent;
    warnings.push({
      code: 'Q-DATA-EXTRA-BYTES',
      message: `DATA segment has ${extra} byte(s) beyond $TOT×event size; ignored`,
    });
  }
  return tot;
}

/** Where one channel's values are: event `e`'s value starts at byte `base + e * stride`. */
interface Layout {
  dv: DataView;
  n: number;
  base: number;
  stride: number;
  little: boolean;
}

/**
 * The common layouts (floats, 2- and 4-byte integers, no byte permutation): the same DataView reads as
 * valueReader(), without the per-value closure and type dispatch.
 */
function readFast(col: Column, c: FcsChannel, w: number, { dv, n, base, stride, little }: Layout): void {
  const range = c.dataType === 'I' ? nextPow2(Math.ceil(c.pnr)) : 0;
  const mask = c.dataType === 'I' && range > 0 && range < 2 ** (w * 8);
  let p = base;
  if (c.dataType === 'F') for (let e = 0; e < n; e++, p += stride) col[e] = dv.getFloat32(p, little);
  else if (c.dataType === 'D') for (let e = 0; e < n; e++, p += stride) col[e] = dv.getFloat64(p, little);
  else if (w === 2) {
    if (mask) for (let e = 0; e < n; e++, p += stride) col[e] = dv.getUint16(p, little) % range;
    else for (let e = 0; e < n; e++, p += stride) col[e] = dv.getUint16(p, little);
  } else if (mask) for (let e = 0; e < n; e++, p += stride) col[e] = dv.getUint32(p, little) % range;
  else for (let e = 0; e < n; e++, p += stride) col[e] = dv.getUint32(p, little);
}

/** Any other layout, one value at a time through `read`. */
function readGeneric(
  col: Column,
  c: FcsChannel,
  w: number,
  { dv, n, base, stride, little }: Layout,
  read: (view: DataView, pos: number, little: boolean) => number,
): void {
  if (c.dataType === 'I') {
    // Bits above the next power of two ≥ $PnR are ignored (FCS 3.1 §3.2.20,
    // FlowIO convention): value mod nextPow2(PnR).
    const range = nextPow2(Math.ceil(c.pnr));
    const mask = range > 0 && range < 2 ** (w * 8);
    for (let e = 0; e < n; e++) {
      let v = read(dv, e * stride + base, little);
      if (mask) v %= range;
      col[e] = v;
    }
  } else {
    for (let e = 0; e < n; e++) col[e] = read(dv, e * stride + base, little);
  }
}

/**
 * Reads one value of channel `c` (`w` bytes) at a byte position. With a byte permutation `perm`, the
 * value's bytes are first reassembled in little-endian order: stored byte k holds significance perm[k].
 */
function valueReader(
  c: FcsChannel,
  w: number,
  data: Uint8Array,
  perm?: number[] | null,
): (view: DataView, pos: number, little: boolean) => number {
  const read = (view: DataView, p: number, lit: boolean): number => {
    if (c.dataType === 'F') return view.getFloat32(p, lit);
    if (c.dataType === 'D') return view.getFloat64(p, lit);
    return readUint(view, p, w, lit, c.n);
  };
  if (!perm) return read;
  const scratch = new Uint8Array(8);
  const sv = new DataView(scratch.buffer);
  return (_view, pos) => {
    for (let k = 0; k < w; k++) scratch[perm[k] as number] = data[pos + k] as number;
    return read(sv, 0, true);
  };
}

/** A `w`-byte unsigned integer. */
function readUint(view: DataView, p: number, w: number, lit: boolean, n: number): number {
  switch (w) {
    case 1:
      return view.getUint8(p);
    case 2:
      return view.getUint16(p, lit);
    case 3: {
      const b0 = view.getUint8(p);
      const b1 = view.getUint8(p + 1);
      const b2 = view.getUint8(p + 2);
      return lit ? b0 | (b1 << 8) | (b2 << 16) : (b0 << 16) | (b1 << 8) | b2;
    }
    case 4:
      return view.getUint32(p, lit);
    case 8: {
      const v = view.getBigUint64(p, lit);
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new FcsParseError('E-INT-OVERFLOW', `64-bit integer value exceeds 2^53 in $P${n}`);
      }
      return Number(v);
    }
    default: {
      // 5–7 byte integers: assemble manually.
      let v = 0;
      for (let k = 0; k < w; k++) {
        const b = view.getUint8(p + (lit ? w - 1 - k : k));
        v = v * 256 + b;
      }
      return v;
    }
  }
}

/** ASCII data: delimited ($PnB = *) or fixed-width values. */
function decodeAscii(
  data: Uint8Array,
  channels: FcsChannel[],
  tot: number,
  warnings: FcsWarning[],
): { columns: Float64Array[]; eventCount: number } {
  const par = channels.length;
  const text = latin1.decode(data);
  const values: number[] = [];
  if (channels.every((c) => c.pnb === '*')) {
    for (const tok of text.split(/[\s,]+/)) {
      if (tok === '') continue;
      values.push(Number(tok));
    }
  } else if (channels.every((c) => c.pnb !== '*')) {
    const widths = channels.map((c) => c.pnb as number);
    const evBytes = widths.reduce((a, b) => a + b, 0);
    let pos = 0;
    while (pos + evBytes <= text.length && values.length < tot * par) {
      for (const w of widths) {
        values.push(Number(text.slice(pos, pos + w).trim()));
        pos += w;
      }
    }
  } else {
    throw new FcsParseError(
      'E-ASCII-MIXED-WIDTH',
      'Mixed fixed-width and delimited ASCII data are not supported',
    );
  }
  let n = Math.floor(values.length / par);
  if (n < tot) {
    warnings.push({ code: 'Q-DATA-SHORT', message: `ASCII DATA holds ${n} events but $TOT=${tot}` });
  } else n = tot;
  const columns = channels.map(() => new Float64Array(n));
  for (let e = 0; e < n; e++) {
    for (let c = 0; c < par; c++) (columns[c] as Float64Array)[e] = values[e * par + c] as number;
  }
  return { columns, eventCount: n };
}
