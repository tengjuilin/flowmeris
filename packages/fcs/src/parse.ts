import {
  type ChannelKind,
  type FcsChannel,
  type FcsDataType,
  type FcsDataset,
  type FcsFile,
  type FcsHeader,
  FcsParseError,
  type FcsWarning,
} from './types.ts';

/**
 * FCS 2.0 / 3.0 / 3.1 / 3.2 parser (methods M-FCS-*; docs/methods/fcs.md).
 *
 * References:
 *  - Spidlen J. et al. (2010) Data File Standard for Flow Cytometry, Version FCS 3.1. Cytometry A 77:97–100.
 *  - Spidlen J. et al. (2021) Data File Standard for Flow Cytometry, Version FCS 3.2. Cytometry A 99:100–102.
 *
 * Linearisation conventions follow FlowKit/FlowIO so that numerical results can
 * be validated against them (see docs/validation/).
 */

const SUPPORTED_VERSIONS = new Set(['FCS2.0', 'FCS3.0', 'FCS3.1', 'FCS3.2']);

export interface ParseOptions {
  /** Parse only the first dataset even if $NEXTDATA points to more. Default false. */
  firstDatasetOnly?: boolean;
  /**
   * Which DATA offsets are authoritative when HEADER and $BEGINDATA/$ENDDATA
   * disagree. 'auto' (default): TEXT keywords for FCS 3.x, HEADER for FCS 2.0.
   */
  dataOffsets?: 'auto' | 'text' | 'header';
}

/** Parse a complete FCS file held in memory. */
export function parseFcs(bytes: Uint8Array, opts: ParseOptions = {}): FcsFile {
  const datasets: FcsDataset[] = [];
  let offset = 0;
  const seen = new Set<number>();
  for (let index = 0; ; index++) {
    if (seen.has(offset))
      throw new FcsParseError('E-NEXTDATA-LOOP', `$NEXTDATA loops back to offset ${offset}`);
    seen.add(offset);
    const ds = parseDataset(bytes, offset, index, opts);
    datasets.push(ds);
    if (opts.firstDatasetOnly) break;
    const next = Number.parseInt((ds.keywords.$NEXTDATA ?? '0').trim(), 10);
    if (!Number.isFinite(next) || next <= 0) break;
    offset += next;
    if (offset >= bytes.length) {
      ds.warnings.push({ code: 'Q-NEXTDATA-OOB', message: '$NEXTDATA points past end of file; ignored' });
      break;
    }
  }
  return { datasets };
}

// ---------------------------------------------------------------------------
// HEADER (M-FCS-HEADER)
// ---------------------------------------------------------------------------

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i] as number);
  return s;
}

function parseOffsetField(s: string): number {
  const t = s.trim();
  if (t === '') return 0;
  if (!/^-?\d+$/.test(t)) throw new FcsParseError('E-HEADER-OFFSET', `Malformed HEADER offset field "${s}"`);
  return Number.parseInt(t, 10);
}

export function parseHeader(bytes: Uint8Array, offset = 0): FcsHeader {
  if (bytes.length < offset + 58)
    throw new FcsParseError('E-HEADER-SHORT', 'File too short to contain an FCS HEADER');
  const version = ascii(bytes, offset, offset + 6);
  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new FcsParseError('E-VERSION', `Unsupported or unrecognised FCS version "${version}"`);
  }
  const f = (i: number) => parseOffsetField(ascii(bytes, offset + 10 + i * 8, offset + 18 + i * 8));
  return {
    version,
    textStart: f(0),
    textEnd: f(1),
    dataStart: f(2),
    dataEnd: f(3),
    analysisStart: f(4),
    analysisEnd: f(5),
  };
}

// ---------------------------------------------------------------------------
// TEXT (M-FCS-TEXT)
// ---------------------------------------------------------------------------

const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

function decodeText(bytes: Uint8Array, warnings: FcsWarning[]): string {
  try {
    return utf8Fatal.decode(bytes);
  } catch {
    warnings.push({
      code: 'Q-TEXT-NOT-UTF8',
      message: 'TEXT segment is not valid UTF-8; decoded as ISO-8859-1',
    });
    return latin1.decode(bytes);
  }
}

/**
 * Split a TEXT segment into keyword/value pairs. The first character is the
 * delimiter; a doubled delimiter inside a keyword or value encodes a literal
 * delimiter character (FCS 3.1 §3.2.9). Keyword names are upper-cased because
 * they are case-insensitive (FCS 3.0+).
 */
export function parseTextSegment(text: string, warnings: FcsWarning[]): Record<string, string> {
  if (text.length === 0) throw new FcsParseError('E-TEXT-EMPTY', 'TEXT segment is empty');
  const delim = text[0] as string;
  const tokens: string[] = [];
  let cur = '';
  let i = 1;
  while (i < text.length) {
    const c = text[i] as string;
    if (c === delim) {
      if (text[i + 1] === delim) {
        cur += delim;
        i += 2;
        continue;
      }
      tokens.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length > 0) {
    // Trailing NULs/whitespace after the final delimiter are common padding.
    if (cur.replace(/[\0\s]/g, '').length > 0) {
      warnings.push({ code: 'Q-TEXT-NO-TRAILING-DELIM', message: 'TEXT segment lacks a final delimiter' });
      tokens.push(cur);
    }
  }
  if (tokens.length % 2 !== 0) {
    warnings.push({
      code: 'Q-TEXT-ODD-TOKENS',
      message: `TEXT segment has an odd number of tokens (${tokens.length}); last token ignored`,
    });
    tokens.pop();
  }
  const out: Record<string, string> = {};
  for (let k = 0; k < tokens.length; k += 2) {
    const key = (tokens[k] as string).trim().toUpperCase();
    const value = tokens[k + 1] as string;
    if (key === '') continue;
    if (key in out) {
      if (out[key] !== value) {
        warnings.push({
          code: 'Q-TEXT-DUP-KEY',
          message: `Keyword ${key} appears more than once; first value kept`,
        });
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

function req(kw: Record<string, string>, key: string): string {
  const v = kw[key];
  if (v === undefined) throw new FcsParseError('E-MISSING-KEYWORD', `Required keyword ${key} is missing`);
  return v;
}

function intKw(kw: Record<string, string>, key: string): number {
  const raw = req(kw, key).trim();
  const v = Number(raw);
  if (!Number.isFinite(v) || !Number.isInteger(v)) {
    throw new FcsParseError('E-KEYWORD-INT', `Keyword ${key} must be an integer, got "${raw}"`);
  }
  return v;
}

function nextPow2(x: number): number {
  if (x <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(x) - 1e-12);
}

function classifyChannel(pnn: string, kw: Record<string, string>, n: number): ChannelKind {
  const type = kw[`$P${n}TYPE`]?.trim().toLowerCase();
  if (type === 'time') return 'time';
  if (type === 'forward_scatter' || type === 'side_scatter') return 'scatter';
  const l = pnn.toLowerCase();
  // Same convention as FlowKit: exact "time" label, "fsc-"/"ssc-" prefixes.
  if (l === 'time') return 'time';
  if (l.startsWith('fsc') || l.startsWith('ssc')) return 'scatter';
  if (type === 'raw_fluorescence' || type === 'unmixed_fluorescence') return 'fluor';
  return 'fluor';
}

function parseDataset(bytes: Uint8Array, offset: number, index: number, opts: ParseOptions): FcsDataset {
  const warnings: FcsWarning[] = [];
  const header = parseHeader(bytes, offset);

  if (header.textStart <= 0 || header.textEnd < header.textStart) {
    throw new FcsParseError('E-TEXT-OFFSETS', 'Invalid TEXT segment offsets in HEADER');
  }
  const textAbsEnd = offset + header.textEnd + 1;
  if (textAbsEnd > bytes.length)
    throw new FcsParseError('E-TEXT-OOB', 'TEXT segment extends past end of file');
  const text = decodeText(bytes.subarray(offset + header.textStart, textAbsEnd), warnings);
  const keywords = parseTextSegment(text, warnings);

  // Supplemental TEXT (FCS 3.0+). Primary TEXT takes precedence.
  const sStart = Number.parseInt((keywords.$BEGINSTEXT ?? '0').trim(), 10);
  const sEnd = Number.parseInt((keywords.$ENDSTEXT ?? '0').trim(), 10);
  if (sStart > 0 && sEnd >= sStart && offset + sEnd < bytes.length) {
    const stext = decodeText(bytes.subarray(offset + sStart, offset + sEnd + 1), warnings);
    const extra = parseTextSegment(stext, warnings);
    for (const [k, v] of Object.entries(extra)) if (!(k in keywords)) keywords[k] = v;
  }

  // DATA offsets (M-FCS-OFFSETS). FCS 3.x requires $BEGINDATA/$ENDDATA; the
  // HEADER fields are 0 when an offset exceeds 99,999,999. By default the TEXT
  // keywords are authoritative for FCS 3.x (FlowKit/FlowIO convention) and the
  // HEADER for FCS 2.0 (which has no such keywords).
  const kwBegin =
    keywords.$BEGINDATA !== undefined ? Number.parseInt(keywords.$BEGINDATA.trim(), 10) : Number.NaN;
  const kwEnd = keywords.$ENDDATA !== undefined ? Number.parseInt(keywords.$ENDDATA.trim(), 10) : Number.NaN;
  const kwValid = Number.isFinite(kwBegin) && Number.isFinite(kwEnd) && (kwBegin !== 0 || kwEnd !== 0);
  const hdrValid = header.dataStart !== 0 || header.dataEnd !== 0;
  const preferText =
    (opts.dataOffsets ?? 'auto') === 'text' ||
    ((opts.dataOffsets ?? 'auto') === 'auto' && header.version !== 'FCS2.0');
  let dataStart: number;
  let dataEnd: number;
  if (kwValid && (preferText || !hdrValid)) {
    dataStart = kwBegin;
    dataEnd = kwEnd;
  } else if (hdrValid) {
    dataStart = header.dataStart;
    dataEnd = header.dataEnd;
  } else if (Number(keywords.$TOT ?? '0') === 0) {
    dataStart = 0;
    dataEnd = 0;
  } else {
    throw new FcsParseError(
      'E-DATA-OFFSETS',
      'DATA offsets are zero in HEADER and $BEGINDATA/$ENDDATA are missing',
    );
  }
  if (kwValid && hdrValid && (kwBegin !== header.dataStart || kwEnd !== header.dataEnd)) {
    warnings.push({
      code: 'Q-DATA-OFFSET-MISMATCH',
      message: `HEADER DATA offsets (${header.dataStart}-${header.dataEnd}) differ from $BEGINDATA/$ENDDATA (${kwBegin}-${kwEnd}); ${dataStart === kwBegin && dataEnd === kwEnd ? 'TEXT' : 'HEADER'} values used`,
    });
  }

  const mode = (keywords.$MODE ?? 'L').trim().toUpperCase();
  if (mode !== 'L') {
    throw new FcsParseError(
      'E-MODE',
      `$MODE ${mode} (histogram/correlated) data are not supported; only list mode (L)`,
    );
  }

  const par = intKw(keywords, '$PAR');
  let tot = intKw(keywords, '$TOT');
  const defaultType = req(keywords, '$DATATYPE').trim().toUpperCase() as FcsDataType;
  if (!['I', 'F', 'D', 'A'].includes(defaultType)) {
    throw new FcsParseError('E-DATATYPE', `Unknown $DATATYPE "${defaultType}"`);
  }

  const timestep = keywords.$TIMESTEP !== undefined ? Number(keywords.$TIMESTEP.trim()) : Number.NaN;

  const channels: FcsChannel[] = [];
  for (let n = 1; n <= par; n++) {
    const pnn = (keywords[`$P${n}N`] ?? `P${n}`).trim();
    if (keywords[`$P${n}N`] === undefined) {
      warnings.push({ code: 'Q-PNN-MISSING', message: `$P${n}N missing; channel named "P${n}"` });
    }
    const pnbRaw = req(keywords, `$P${n}B`).trim();
    const pnb: number | '*' = pnbRaw === '*' ? '*' : Number.parseInt(pnbRaw, 10);
    const pnrRaw = (keywords[`$P${n}R`] ?? '').trim();
    let pnr = Number(pnrRaw);
    if (!Number.isFinite(pnr)) {
      warnings.push({ code: 'Q-PNR-INVALID', message: `$P${n}R "${pnrRaw}" invalid; using 2^$P${n}B` });
      pnr = typeof pnb === 'number' ? 2 ** pnb : 0;
    }
    let pne: [number, number] = [0, 0];
    const pneRaw = keywords[`$P${n}E`];
    if (pneRaw !== undefined) {
      const parts = pneRaw.split(',').map((s) => Number(s.trim()));
      if (parts.length === 2 && parts.every(Number.isFinite)) pne = [parts[0] as number, parts[1] as number];
      else
        warnings.push({ code: 'Q-PNE-INVALID', message: `$P${n}E "${pneRaw}" invalid; treated as linear` });
    }
    const pngRaw = keywords[`$P${n}G`];
    const png = pngRaw !== undefined ? Number(pngRaw.trim()) : undefined;
    const pnsRaw = keywords[`$P${n}S`];
    const dtRaw = keywords[`$P${n}DATATYPE`]?.trim().toUpperCase();
    const dataType = (dtRaw && ['I', 'F', 'D'].includes(dtRaw) ? dtRaw : defaultType) as FcsDataType;
    const kind = classifyChannel(pnn, keywords, n);

    let logDecades = pne[0];
    let logOffset = pne[1];
    if (logDecades > 0 && logOffset === 0) {
      warnings.push({
        code: 'Q-PNE-ZERO-F2',
        message: `$P${n}E "${pneRaw}" has f2=0 with f1>0; f2=1 used (FCS 3.1 §3.2.20)`,
      });
      logOffset = 1;
    }
    if (logDecades > 0 && dataType !== 'I') {
      warnings.push({
        code: 'Q-PNE-LOG-NONINT',
        message: `$P${n}E specifies log amplification for non-integer data; applied as written (FlowKit-compatible)`,
      });
    }
    if (logDecades < 0) logDecades = 0;
    let gain = png !== undefined && Number.isFinite(png) && png !== 0 ? png : 1;
    if (kind === 'time') gain = 1;
    if (gain !== 1) {
      if (logDecades > 0) {
        warnings.push({
          code: 'Q-PNG-WITH-LOG',
          message: `$P${n}G=${gain} on a log-amplified channel; gain divided out after log decoding (FlowKit-compatible)`,
        });
      }
      if (dataType !== 'I' && header.version === 'FCS3.2') {
        warnings.push({
          code: 'Q-PNG-NONINT-32',
          message: `$P${n}G=${gain} on non-integer data violates FCS 3.2; gain still applied (FlowKit-compatible)`,
        });
      }
    }
    const ts = kind === 'time' && Number.isFinite(timestep) && timestep > 0 ? timestep : 1;

    channels.push({
      n,
      pnn,
      ...(pnsRaw !== undefined && pnsRaw.trim() !== '' ? { pns: pnsRaw.trim() } : {}),
      pnb,
      pnr,
      pne,
      ...(png !== undefined && Number.isFinite(png) ? { png } : {}),
      dataType,
      kind,
      scaling: { logDecades, logOffset, range: pnr, gain, timestep: ts },
    });
  }

  const dataAbsStart = offset + dataStart;
  const dataAbsEnd = offset + dataEnd + 1; // exclusive
  if (dataEnd < dataStart && tot > 0)
    throw new FcsParseError('E-DATA-OFFSETS', 'DATA end precedes DATA start');
  let dataBytes: Uint8Array;
  if (dataAbsEnd > bytes.length) {
    warnings.push({ code: 'Q-DATA-TRUNCATED', message: 'DATA segment extends past end of file; truncated' });
    dataBytes = bytes.subarray(dataAbsStart, bytes.length);
  } else {
    dataBytes = tot === 0 ? new Uint8Array(0) : bytes.subarray(dataAbsStart, dataAbsEnd);
  }

  const byteord = (keywords.$BYTEORD ?? '1,2,3,4').trim();
  const decoded = decodeData(dataBytes, channels, tot, byteord, warnings);
  tot = decoded.eventCount;

  return {
    index,
    offset,
    header,
    keywords,
    channels,
    eventCount: tot,
    columns: decoded.columns,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// DATA (M-FCS-DATA)
// ---------------------------------------------------------------------------

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

function decodeData(
  data: Uint8Array,
  channels: FcsChannel[],
  tot: number,
  byteord: string,
  warnings: FcsWarning[],
): { columns: (Float32Array | Float64Array)[]; eventCount: number } {
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
  const bytesPerEvent = widths.reduce((a, b) => a + b, 0);
  const available = Math.floor(data.length / bytesPerEvent);
  let n = tot;
  if (available < tot) {
    warnings.push({
      code: 'Q-DATA-SHORT',
      message: `DATA segment holds ${available} complete events but $TOT=${tot}; ${available} events read`,
    });
    n = available;
  } else if (data.length !== tot * bytesPerEvent) {
    const extra = data.length - tot * bytesPerEvent;
    warnings.push({
      code: 'Q-DATA-EXTRA-BYTES',
      message: `DATA segment has ${extra} byte(s) beyond $TOT×event size; ignored`,
    });
  }

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const columns: (Float32Array | Float64Array)[] = channels.map((c, i) => {
    const w = widths[i] as number;
    // Float32 is exact for single floats and integers up to 24 bits.
    const exactF32 = c.dataType === 'F' || (c.dataType === 'I' && w <= 3);
    return exactF32 ? new Float32Array(n) : new Float64Array(n);
  });

  const offsets: number[] = [];
  {
    let o = 0;
    for (const w of widths) {
      offsets.push(o);
      o += w;
    }
  }
  const scratch = new Uint8Array(8);
  const sv = new DataView(scratch.buffer);

  for (let ci = 0; ci < par; ci++) {
    const c = channels[ci] as FcsChannel;
    const w = widths[ci] as number;
    const col = columns[ci] as Float32Array | Float64Array;
    const base = offsets[ci] as number;
    const usePerm = order.perm !== null && order.perm.length === w;
    if (order.perm !== null && !usePerm && w > 1) {
      throw new FcsParseError(
        'E-BYTEORD-WIDTH',
        `$BYTEORD permutation of length ${order.perm.length} cannot be applied to ${w}-byte values`,
      );
    }
    const little = order.little;
    const readRaw = (pos: number): number => {
      let p = pos;
      let view = dv;
      let lit = little;
      if (usePerm) {
        // Reassemble into little-endian order using the declared permutation:
        // stored byte k holds significance perm[k].
        for (let k = 0; k < w; k++) scratch[(order.perm as number[])[k] as number] = data[pos + k] as number;
        view = sv;
        p = 0;
        lit = true;
      }
      switch (c.dataType) {
        case 'F':
          return view.getFloat32(p, lit);
        case 'D':
          return view.getFloat64(p, lit);
        default:
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
                throw new FcsParseError('E-INT-OVERFLOW', `64-bit integer value exceeds 2^53 in $P${c.n}`);
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
    };

    // Fast paths for the common layouts (no byte permutation): same DataView reads
    // as readRaw, without the per-value closure and type dispatch.
    if (
      !usePerm &&
      (c.dataType === 'F' || c.dataType === 'D' || (c.dataType === 'I' && (w === 2 || w === 4)))
    ) {
      const range = c.dataType === 'I' ? nextPow2(Math.ceil(c.pnr)) : 0;
      const mask = c.dataType === 'I' && range > 0 && range < 2 ** (w * 8);
      let p = base;
      if (c.dataType === 'F')
        for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getFloat32(p, little);
      else if (c.dataType === 'D')
        for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getFloat64(p, little);
      else if (w === 2) {
        if (mask) for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getUint16(p, little) % range;
        else for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getUint16(p, little);
      } else if (mask)
        for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getUint32(p, little) % range;
      else for (let e = 0; e < n; e++, p += bytesPerEvent) col[e] = dv.getUint32(p, little);
      continue;
    }

    if (c.dataType === 'I') {
      // Bits above the next power of two ≥ $PnR are ignored (FCS 3.1 §3.2.20,
      // FlowIO convention): value mod nextPow2(PnR).
      const range = nextPow2(Math.ceil(c.pnr));
      const mask = range > 0 && range < 2 ** (w * 8);
      for (let e = 0; e < n; e++) {
        let v = readRaw(e * bytesPerEvent + base);
        if (mask) v %= range;
        col[e] = v;
      }
    } else {
      for (let e = 0; e < n; e++) col[e] = readRaw(e * bytesPerEvent + base);
    }
  }
  return { columns, eventCount: n };
}

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
