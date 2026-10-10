import { type FcsHeader, FcsParseError } from './types.ts';

/** HEADER segment (M-FCS-HEADER): version and the TEXT, DATA and ANALYSIS offsets. */

const SUPPORTED_VERSIONS = new Set(['FCS2.0', 'FCS3.0', 'FCS3.1', 'FCS3.2']);

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
