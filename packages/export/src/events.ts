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
