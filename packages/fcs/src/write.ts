/**
 * FCS 3.1 writer (method M-FCS-WRITE).
 *
 * Writes list-mode, single-precision float ($DATATYPE F), little-endian
 * ($BYTEORD 1,2,3,4) data. DATA offsets are written both in the HEADER (when
 * ≤ 99,999,999) and as $BEGINDATA/$ENDDATA. Offsets are zero-padded to a fixed
 * width so the TEXT segment length does not depend on their values.
 */

export interface WriteChannel {
  pnn: string;
  pns?: string;
  /** $PnR; defaults to ceil(max value) or 1. */
  range?: number;
  values: ArrayLike<number>;
}

export interface WriteOptions {
  /** Extra keywords written verbatim (names are upper-cased). Reserved $-keywords are overwritten. */
  keywords?: Record<string, string>;
}

const OFFSET_WIDTH = 20;
/** Candidate delimiters, in order of preference. */
const DELIMS = ['/', '|', '\\', '\f', '\x1e', '\x1f'];

/**
 * Choose a delimiter that occurs in no keyword or value. A value that begins
 * with the delimiter cannot be escaped unambiguously (a doubled delimiter right
 * after the keyword's separator is read as an escape), so avoiding the
 * character altogether is the only fully safe choice. Falls back to '/'
 * with escaping if every candidate occurs.
 */
function chooseDelimiter(texts: string[]): string {
  for (const d of DELIMS) if (texts.every((t) => !t.includes(d))) return d;
  return '/';
}

export function writeFcs(channels: WriteChannel[], opts: WriteOptions = {}): Uint8Array {
  const par = channels.length;
  if (par === 0) throw new Error('writeFcs: at least one channel required');
  const tot = channels[0]?.values.length ?? 0;
  for (const c of channels) {
    if (c.values.length !== tot)
      throw new Error('writeFcs: all channels must have the same number of events');
  }

  const kw: [string, string][] = [];
  const reserved = new Set<string>();
  const put = (k: string, v: string) => {
    kw.push([k, v]);
    reserved.add(k);
  };
  put('$BEGINANALYSIS', '0');
  put('$ENDANALYSIS', '0');
  put('$BEGINSTEXT', '0');
  put('$ENDSTEXT', '0');
  put('$BEGINDATA', '0'.repeat(OFFSET_WIDTH));
  put('$ENDDATA', '0'.repeat(OFFSET_WIDTH));
  put('$BYTEORD', '1,2,3,4');
  put('$DATATYPE', 'F');
  put('$MODE', 'L');
  put('$NEXTDATA', '0');
  put('$PAR', String(par));
  put('$TOT', String(tot));
  channels.forEach((c, i) => {
    const n = i + 1;
    let range = c.range;
    if (range === undefined) {
      let mx = 1;
      for (let e = 0; e < tot; e++) {
        const v = c.values[e] as number;
        if (v > mx) mx = v;
      }
      range = Math.ceil(mx);
    }
    put(`$P${n}N`, c.pnn);
    if (c.pns) put(`$P${n}S`, c.pns);
    put(`$P${n}B`, '32');
    put(`$P${n}E`, '0,0');
    put(`$P${n}R`, String(range));
  });
  for (const [k, v] of Object.entries(opts.keywords ?? {})) {
    const key = k.toUpperCase();
    if (reserved.has(key)) continue;
    // Drop per-parameter and segment keywords from a source file that would
    // contradict the rewritten layout.
    if (/^\$P\d+[A-Z]+$/.test(key) || /^\$(BEGIN|END)/.test(key)) continue;
    kw.push([key, v]);
  }

  const DELIM = chooseDelimiter(kw.flat());
  const escapeValue = (v: string): string => {
    let s = v === '' ? ' ' : v; // FCS 3.1 forbids empty values
    if (s.startsWith(DELIM)) s = ` ${s}`; // only reachable in the '/' fallback
    return s.split(DELIM).join(DELIM + DELIM);
  };
  const buildText = (beginData: number, endData: number) => {
    let s = DELIM;
    for (const [k, v] of kw) {
      let val = v;
      if (k === '$BEGINDATA') val = String(beginData).padStart(OFFSET_WIDTH, '0');
      if (k === '$ENDDATA') val = String(endData).padStart(OFFSET_WIDTH, '0');
      s += `${escapeValue(k)}${DELIM}${escapeValue(val)}${DELIM}`;
    }
    return new TextEncoder().encode(s);
  };

  const textStart = 58;
  const probe = buildText(0, 0);
  const textEnd = textStart + probe.length - 1;
  const dataStart = textEnd + 1;
  const dataLen = tot * par * 4;
  const dataEnd = tot === 0 ? dataStart : dataStart + dataLen - 1;
  const text = buildText(dataStart, dataEnd);
  if (text.length !== probe.length) throw new Error('writeFcs: TEXT length changed between passes');

  const fits = (x: number) => x <= 99_999_999;
  const field = (x: number) => String(x).padStart(8, ' ');
  const header = `FCS3.1    ${field(textStart)}${field(textEnd)}${field(fits(dataEnd) ? dataStart : 0)}${field(fits(dataEnd) ? dataEnd : 0)}${field(0)}${field(0)}`;

  const out = new Uint8Array(dataStart + dataLen + 8);
  for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
  out.set(text, textStart);
  const values = channels.map((c) => c.values);
  if (HOST_LITTLE_ENDIAN) writeDataNative(out, dataStart, values, tot);
  else writeDataView(out, dataStart, values, tot);
  // CRC field: FCS 3.1 permits "00000000" when no CRC is computed.
  const crc = '00000000';
  for (let i = 0; i < 8; i++) out[dataStart + dataLen + i] = crc.charCodeAt(i);
  return out;
}

/** True when the host stores numbers little-endian, the byte order written. */
const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Events per block: a block's values stay in cache while it is filled channel by channel. */
const BLOCK = 1024;

/**
 * DATA through a Float32Array (little-endian hosts): event e's value of channel c at e·par + c, filled
 * a block of events at a time, then copied into `out` unless `dataStart` is 4-byte aligned. Storing
 * into a Float32Array rounds as DataView.setFloat32 does.
 */
export function writeDataNative(
  out: Uint8Array,
  dataStart: number,
  values: ArrayLike<number>[],
  tot: number,
): void {
  const par = values.length;
  const aligned = (out.byteOffset + dataStart) % 4 === 0;
  const f32 = aligned
    ? new Float32Array(out.buffer, out.byteOffset + dataStart, tot * par)
    : new Float32Array(tot * par);
  for (let e0 = 0; e0 < tot; e0 += BLOCK) {
    const e1 = Math.min(tot, e0 + BLOCK);
    for (let c = 0; c < par; c++) {
      const col = values[c] as ArrayLike<number>;
      for (let e = e0, p = e0 * par + c; e < e1; e++, p += par) f32[p] = col[e] as number;
    }
  }
  if (!aligned) out.set(new Uint8Array(f32.buffer), dataStart);
}

/** DATA one value at a time through a DataView, little-endian (any host). */
export function writeDataView(
  out: Uint8Array,
  dataStart: number,
  values: ArrayLike<number>[],
  tot: number,
): void {
  const par = values.length;
  const dv = new DataView(out.buffer, out.byteOffset + dataStart, tot * par * 4);
  for (let e = 0; e < tot; e++) {
    for (let c = 0; c < par; c++)
      dv.setFloat32((e * par + c) * 4, (values[c] as ArrayLike<number>)[e] as number, true);
  }
}
