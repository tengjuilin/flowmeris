import { decodeData } from './data.ts';
import { parseHeader } from './header.ts';
import { decodeText, parseTextSegment } from './text.ts';
import {
  type ChannelKind,
  type FcsChannel,
  type FcsDataType,
  type FcsDataset,
  type FcsHeader,
  FcsParseError,
  type FcsWarning,
} from './types.ts';

/** One dataset of an FCS file: HEADER, TEXT keywords, channel parameters and DATA. */

type Keywords = Record<string, string>;

export interface ParseOptions {
  /** Parse only the first dataset even if $NEXTDATA points to more. Default false. */
  firstDatasetOnly?: boolean;
  /**
   * Which DATA offsets are authoritative when HEADER and $BEGINDATA/$ENDDATA
   * disagree. 'auto' (default): TEXT keywords for FCS 3.x, HEADER for FCS 2.0.
   */
  dataOffsets?: 'auto' | 'text' | 'header';
}

function req(kw: Keywords, key: string): string {
  const v = kw[key];
  if (v === undefined) throw new FcsParseError('E-MISSING-KEYWORD', `Required keyword ${key} is missing`);
  return v;
}

function intKw(kw: Keywords, key: string): number {
  const raw = req(kw, key).trim();
  const v = Number(raw);
  if (!Number.isFinite(v) || !Number.isInteger(v)) {
    throw new FcsParseError('E-KEYWORD-INT', `Keyword ${key} must be an integer, got "${raw}"`);
  }
  return v;
}

function classifyChannel(pnn: string, kw: Keywords, n: number): ChannelKind {
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

export function parseDataset(
  bytes: Uint8Array,
  offset: number,
  index: number,
  opts: ParseOptions,
): FcsDataset {
  const warnings: FcsWarning[] = [];
  const header = parseHeader(bytes, offset);
  const keywords = readKeywords(bytes, offset, header, warnings);
  const { dataStart, dataEnd } = dataOffsets(header, keywords, opts, warnings);

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
  for (let n = 1; n <= par; n++)
    channels.push(parseChannel(keywords, n, defaultType, timestep, header.version, warnings));

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

/** The primary TEXT keywords, plus those of the supplemental TEXT (FCS 3.0+) not in the primary. */
function readKeywords(
  bytes: Uint8Array,
  offset: number,
  header: FcsHeader,
  warnings: FcsWarning[],
): Keywords {
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
  return keywords;
}

/**
 * DATA offsets (M-FCS-OFFSETS). FCS 3.x requires $BEGINDATA/$ENDDATA; the
 * HEADER fields are 0 when an offset exceeds 99,999,999. By default the TEXT
 * keywords are authoritative for FCS 3.x (FlowKit/FlowIO convention) and the
 * HEADER for FCS 2.0 (which has no such keywords).
 */
function dataOffsets(
  header: FcsHeader,
  keywords: Keywords,
  opts: ParseOptions,
  warnings: FcsWarning[],
): { dataStart: number; dataEnd: number } {
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
  return { dataStart, dataEnd };
}

/** Channel `n`'s $Pn* parameters and how its values are linearised. */
function parseChannel(
  keywords: Keywords,
  n: number,
  defaultType: FcsDataType,
  timestep: number,
  version: string,
  warnings: FcsWarning[],
): FcsChannel {
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
    else warnings.push({ code: 'Q-PNE-INVALID', message: `$P${n}E "${pneRaw}" invalid; treated as linear` });
  }
  const pngRaw = keywords[`$P${n}G`];
  const png = pngRaw !== undefined ? Number(pngRaw.trim()) : undefined;
  const pnsRaw = keywords[`$P${n}S`];
  const dtRaw = keywords[`$P${n}DATATYPE`]?.trim().toUpperCase();
  const dataType = (dtRaw && ['I', 'F', 'D'].includes(dtRaw) ? dtRaw : defaultType) as FcsDataType;
  const kind = classifyChannel(pnn, keywords, n);
  const { logDecades, logOffset } = amplification(n, pne, pneRaw, dataType, warnings);
  const gain = channelGain(n, png, kind, logDecades, dataType, version, warnings);
  const ts = kind === 'time' && Number.isFinite(timestep) && timestep > 0 ? timestep : 1;

  return {
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
  };
}

/** Log decades and offset from $PnE, corrected as FCS 3.1 §3.2.20 says. */
function amplification(
  n: number,
  pne: [number, number],
  pneRaw: string | undefined,
  dataType: FcsDataType,
  warnings: FcsWarning[],
): { logDecades: number; logOffset: number } {
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
  return { logDecades, logOffset };
}

/** The gain divided out of a channel's values: $PnG, except on time channels. */
function channelGain(
  n: number,
  png: number | undefined,
  kind: ChannelKind,
  logDecades: number,
  dataType: FcsDataType,
  version: string,
  warnings: FcsWarning[],
): number {
  let gain = png !== undefined && Number.isFinite(png) && png !== 0 ? png : 1;
  if (kind === 'time') gain = 1;
  if (gain !== 1) {
    if (logDecades > 0) {
      warnings.push({
        code: 'Q-PNG-WITH-LOG',
        message: `$P${n}G=${gain} on a log-amplified channel; gain divided out after log decoding (FlowKit-compatible)`,
      });
    }
    if (dataType !== 'I' && version === 'FCS3.2') {
      warnings.push({
        code: 'Q-PNG-NONINT-32',
        message: `$P${n}G=${gain} on non-integer data violates FCS 3.2; gain still applied (FlowKit-compatible)`,
      });
    }
  }
  return gain;
}
