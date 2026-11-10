import { compensateChannel, makeCompensator } from '@flowmeris/compensation';
import { isIdentityScaling, linearize } from '@flowmeris/fcs';
import type { CompRef } from '@flowmeris/model';
import type { EventsMode } from '../api.ts';
import type { Columns } from '../columns.ts';
import type { Populations } from '../populations.ts';
import type { AnalysisContext, SampleData } from '../types.ts';

/**
 * Linear values of channel `ci` at events `idx` (null: every event). Linearization is per value, so
 * gathering the stored values first gives the linearized column's values at those events.
 */
function gatherLinear(s: SampleData, ci: number, idx: Uint32Array | null): Float64Array {
  const stored = s.columns[ci];
  if (!stored) throw new Error(`Channel ${s.channels[ci]?.pnn} of sample ${s.sampleId} is not loaded`);
  let out: Float64Array;
  if (idx) {
    out = new Float64Array(idx.length);
    for (let i = 0; i < idx.length; i++) out[i] = stored[idx[i]!] as number;
  } else out = Float64Array.from(stored);
  const scaling = s.channels[ci]!.scaling;
  return isIdentityScaling(scaling) ? out : linearize(out, scaling, out);
}

/**
 * Event values of a population (every column loaded), in linear units, compensated or not. Only the
 * population's events are linearized and compensated, with compensateChannel's accumulation, so each
 * value is the whole compensated column's value at that event.
 */
export function eventsOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  popId: string,
  mode: EventsMode,
): { channels: string[]; columns: Float64Array[]; count: number } {
  const idx = pops.indices(ctx, s, popId);
  const lin = s.channels.map((_, ci) => gatherLinear(s, ci, idx));
  const m = mode === 'compensated' ? columns.resolveComp(ctx, s) : null;
  let cols = lin;
  if (m) {
    const comp = makeCompensator(
      m,
      s.channels.map((c) => c.pnn),
    );
    cols = lin.map((col, ci) => compensateChannel(comp, lin, ci) ?? col);
  }
  return {
    channels: s.channels.map((c) => c.pnn),
    columns: cols,
    count: idx ? idx.length : s.eventCount,
  };
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
  const idx = pops.indices(ctx, s, popId);
  const count = idx ? idx.length : s.eventCount;
  const step = Math.max(1, Math.floor(count / max));
  const out = new Float64Array(Math.ceil(count / step));
  if (idx) for (let i = 0, k = 0; i < count; i += step, k++) out[k] = col[idx[i]!] as number;
  else for (let i = 0, k = 0; i < count; i += step, k++) out[k] = col[i] as number;
  return out;
}
