import { SPILLOVER_KEYWORDS } from '@flowmeris/compensation';
import { writeFcs } from '@flowmeris/fcs';

/**
 * Gated events as an FCS 3.1 file (method M-FCS-WRITE): linear values, raw or compensated, with the
 * source file's keywords plus `provenance`. Compensated values must not carry a spillover matrix (a
 * reader would apply it twice), so those keywords are dropped in that mode. Time values are already
 * in seconds, so a source $TIMESTEP becomes 1 (kept as is, a reader would scale them a second time).
 */
export function eventsToFcs(
  keywords: Record<string, string>,
  events: { channels: string[]; columns: ArrayLike<number>[] },
  mode: 'raw' | 'compensated',
  provenance: Record<string, string>,
): Uint8Array {
  const dropped = new Set<string>(mode === 'compensated' ? SPILLOVER_KEYWORDS : []);
  const kw: Record<string, string> = Object.fromEntries(
    Object.entries(keywords).filter(([k]) => !dropped.has(k)),
  );
  if (kw.$TIMESTEP !== undefined) kw.$TIMESTEP = '1';
  Object.assign(kw, provenance);
  return writeFcs(
    events.channels.map((pnn, i) => ({
      pnn,
      ...(keywords[`$P${i + 1}S`] ? { pns: keywords[`$P${i + 1}S`] } : {}),
      values: events.columns[i]!,
    })),
    { keywords: kw },
  );
}

/** Rows encoded per chunk: keeps every intermediate string far below V8's maximum string length. */
const CSV_CHUNK_ROWS = 16384;

/**
 * Gated events as CSV text, UTF-8 encoded: a header of channel names ($PnN, JSON-quoted), then one row
 * per event in shortest round-trip decimal form. The rows are encoded in chunks, so millions of events
 * across many channels never build one string (which would exceed V8's maximum string length).
 */
export function eventsToCsv(events: {
  channels: string[];
  columns: ArrayLike<number>[];
  count: number;
}): Uint8Array {
  const enc = new TextEncoder();
  const { columns, count } = events;
  const p = columns.length;
  const chunks = [enc.encode(`${events.channels.map((c) => JSON.stringify(c)).join(',')}\n`)];
  const row: string[] = new Array(p);
  const lines: string[] = new Array(Math.min(CSV_CHUNK_ROWS, count));
  for (let start = 0; start < count; start += CSV_CHUNK_ROWS) {
    const n = Math.min(CSV_CHUNK_ROWS, count - start);
    lines.length = n;
    for (let k = 0; k < n; k++) {
      const i = start + k;
      for (let j = 0; j < p; j++) row[j] = String(columns[j]![i]);
      lines[k] = row.join(',');
    }
    chunks.push(enc.encode(`${lines.join('\n')}\n`));
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
