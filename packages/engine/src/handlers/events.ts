import { toIndices } from '@flowmeris/gating';
import type { CompRef } from '@flowmeris/model';
import type { EventsMode } from '../api.ts';
import type { Columns } from '../columns.ts';
import type { Populations } from '../populations.ts';
import type { AnalysisContext, SampleData } from '../types.ts';

/** Event values of a population (every column loaded), in linear units, compensated or not. */
export function eventsOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  popId: string,
  mode: EventsMode,
): { channels: string[]; columns: Float64Array[]; count: number } {
  const idx = toIndices(pops.bits(ctx, s, popId));
  const cols = s.channels.map((_, ci) => {
    const src = mode === 'compensated' ? columns.compensated(ctx, s, ci) : columns.linear(s, ci);
    const out = new Float64Array(idx.length);
    for (let i = 0; i < idx.length; i++) out[i] = src[idx[i]!] as number;
    return out;
  });
  return { channels: s.channels.map((c) => c.pnn), columns: cols, count: idx.length };
}

/** Up to about `max` linear values of one channel in a population, evenly subsampled. */
export function channelValuesOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  axis: { channel: string; comp: CompRef },
  popId: string,
  max: number,
): Float64Array {
  const col = columns.column(ctx, s, { ...axis, transform: null });
  const idx = toIndices(pops.bits(ctx, s, popId));
  const step = Math.max(1, Math.floor(idx.length / max));
  const out = new Float64Array(Math.ceil(idx.length / step));
  for (let i = 0, k = 0; i < idx.length; i += step, k++) out[k] = col[idx[i]!] as number;
  return out;
}
