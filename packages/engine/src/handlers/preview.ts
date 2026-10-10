import { type Bitset, evaluateGate, popcount } from '@flowmeris/gating';
import type { Gate } from '@flowmeris/model';
import type { Columns } from '../columns.ts';
import type { Populations } from '../populations.ts';
import type { AnalysisContext, GatePreviewResponse, SampleData } from '../types.ts';

/** Counts a gate would produce on a sample whose columns are loaded, without committing it. */
export function previewOf(
  columns: Columns,
  pops: Populations,
  ctx: AnalysisContext,
  s: SampleData,
  g: Gate,
): GatePreviewResponse {
  const parent = pops.bits(ctx, s, g.parentPop);
  const dims = g.dims.map((d) => columns.column(ctx, s, d));
  const res = evaluateGate(g.geometry, dims, s.eventCount, parent);
  const regions: GatePreviewResponse['regions'] = {};
  for (const [r, b] of Object.entries(res.regions))
    regions[r as keyof typeof regions] = popcount(b as Bitset);
  return { parentCount: popcount(parent), regions };
}
