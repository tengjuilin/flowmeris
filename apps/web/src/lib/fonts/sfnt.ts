/**
 * Reading font files (the sfnt container of TrueType and OpenType): which kind a file is, the one
 * font of a collection (.ttc) that jsPDF can embed on its own, and the metrics a PDF names a font by.
 */

/** 'truetype' (glyf outlines, which jsPDF embeds), 'cff' (OpenType PostScript outlines), 'collection'. */
export function sfntKind(b: Uint8Array): 'truetype' | 'cff' | 'collection' | 'unknown' {
  const tag = String.fromCharCode(...b.subarray(0, 4));
  if (tag === '\0\x01\0\0' || tag === 'true') return 'truetype';
  if (tag === 'OTTO') return 'cff';
  if (tag === 'ttcf') return 'collection';
  return 'unknown';
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

interface TableRecord {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

function tables(b: Uint8Array, at: number): TableRecord[] {
  const v = view(b);
  const n = v.getUint16(at + 4);
  return Array.from({ length: n }, (_, i) => {
    const p = at + 12 + i * 16;
    return {
      tag: String.fromCharCode(...b.subarray(p, p + 4)),
      checksum: v.getUint32(p + 4),
      offset: v.getUint32(p + 8),
      length: v.getUint32(p + 12),
    };
  });
}

/** The PostScript name (name ID 6) of the font whose table directory is at `at`. */
export function postscriptName(b: Uint8Array, at = 0): string | undefined {
  const name = tables(b, at).find((t) => t.tag === 'name');
  if (!name) return undefined;
  const v = view(b);
  const count = v.getUint16(name.offset + 2);
  const strings = name.offset + v.getUint16(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const r = name.offset + 6 + i * 12;
    if (v.getUint16(r + 6) !== 6) continue;
    const platform = v.getUint16(r);
    const len = v.getUint16(r + 8);
    const start = strings + v.getUint16(r + 10);
    const raw = b.subarray(start, start + len);
    if (platform === 1) return String.fromCharCode(...raw);
    let s = '';
    for (let j = 0; j + 1 < raw.length; j += 2) s += String.fromCharCode((raw[j]! << 8) | raw[j + 1]!);
    return s;
  }
  return undefined;
}

/** A standalone font file of the font whose table directory is at `at` (copying its tables). */
function extract(b: Uint8Array, at: number): Uint8Array {
  const recs = tables(b, at);
  const pad = (n: number) => (n + 3) & ~3;
  const headLen = 12 + recs.length * 16;
  const out = new Uint8Array(headLen + recs.reduce((s, t) => s + pad(t.length), 0));
  const v = view(out);
  out.set(b.subarray(at, at + 12));
  let offset = headLen;
  recs.forEach((t, i) => {
    const p = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[p + k] = t.tag.charCodeAt(k);
    v.setUint32(p + 4, t.checksum);
    v.setUint32(p + 8, offset);
    v.setUint32(p + 12, t.length);
    out.set(b.subarray(t.offset, t.offset + t.length), offset);
    offset += pad(t.length);
  });
  return out;
}

/** The font named `psName` from a collection (.ttc), as a standalone file; undefined when absent. */
export function fontFromCollection(b: Uint8Array, psName: string): Uint8Array | undefined {
  const v = view(b);
  const n = v.getUint32(8);
  for (let i = 0; i < n; i++) {
    const at = v.getUint32(12 + i * 4);
    if (postscriptName(b, at) === psName) return extract(b, at);
  }
  return undefined;
}

/**
 * Where a font draws its underline, in em: the top of the line's distance below the baseline, and its
 * thickness ('post' table, scaled by 'head' units per em). Undefined without those tables.
 */
export function underlineMetrics(b: Uint8Array): { offset: number; thickness: number } | undefined {
  const t = tables(b, 0);
  const post = t.find((x) => x.tag === 'post');
  const head = t.find((x) => x.tag === 'head');
  if (!post || !head) return undefined;
  const v = view(b);
  const upem = v.getUint16(head.offset + 18);
  const position = v.getInt16(post.offset + 8);
  const thickness = v.getInt16(post.offset + 10);
  if (!upem || thickness <= 0) return undefined;
  return { offset: -position / upem, thickness: thickness / upem };
}

/** What a PDF needs to name a font without embedding it: in 1/1000 em, as PDF font dictionaries are. */
export interface FaceMetrics {
  /** Advance width of each code point asked for (that of glyph 0 where the font has none). */
  widths: number[];
  ascent: number;
  descent: number;
  capHeight: number;
  bbox: [number, number, number, number];
  /** Degrees counterclockwise from vertical ('post' italicAngle). */
  italicAngle: number;
}

/** The glyph of each code point in the font's Unicode BMP map ('cmap' 3,1 or 0,3, format 4); 0 when absent. */
function glyphIds(b: Uint8Array, t: TableRecord[], codes: number[]): number[] {
  const v = view(b);
  const cmap = t.find((x) => x.tag === 'cmap')!.offset;
  let sub = -1;
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    const id = `${v.getUint16(r)},${v.getUint16(r + 2)}`;
    const at = cmap + v.getUint32(r + 4);
    if ((id === '3,1' || id === '0,3') && v.getUint16(at) === 4) sub = at;
  }
  if (sub < 0) return codes.map(() => 0);
  const segX2 = v.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return codes.map((c) => {
    for (let s = 0; s < segX2; s += 2) {
      if (c > v.getUint16(ends + s)) continue;
      const start = v.getUint16(starts + s);
      if (c < start) return 0;
      const delta = v.getUint16(deltas + s);
      const range = v.getUint16(ranges + s);
      if (!range) return (c + delta) & 0xffff;
      const g = v.getUint16(ranges + s + range + (c - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  });
}

/**
 * The widths of `codes` and the font descriptor values of a TrueType font ('head', 'hhea', 'hmtx', 'OS/2',
 * 'post', 'cmap'), for a PDF that names the font without embedding it.
 */
export function faceMetrics(b: Uint8Array, codes: number[]): FaceMetrics {
  const t = tables(b, 0);
  const at = (tag: string) => t.find((x) => x.tag === tag)!.offset;
  const v = view(b);
  const head = at('head');
  const hhea = at('hhea');
  const hmtx = at('hmtx');
  const os2 = t.find((x) => x.tag === 'OS/2');
  const em = (n: number) => Math.round((n * 1000) / v.getUint16(head + 18));
  const metrics = v.getUint16(hhea + 34);
  const advance = (g: number) => em(v.getUint16(hmtx + 4 * Math.min(g, metrics - 1)));
  const ascent = em(v.getInt16(hhea + 4));
  // sCapHeight is in OS/2 version 2 and later.
  const capHeight = os2 && v.getUint16(os2.offset) >= 2 ? em(v.getInt16(os2.offset + 88)) : ascent;
  return {
    widths: glyphIds(b, t, codes).map(advance),
    ascent,
    descent: em(v.getInt16(hhea + 6)),
    capHeight,
    bbox: [36, 38, 40, 42].map((o) => em(v.getInt16(head + o))) as FaceMetrics['bbox'],
    italicAngle: Math.round((v.getInt32(at('post') + 4) / 65536) * 100) / 100,
  };
}
