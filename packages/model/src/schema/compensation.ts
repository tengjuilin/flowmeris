import { z } from 'zod';
import { Id, Num } from './common.ts';

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

export const CompMatrixSchema = z.object({
  id: Id,
  name: z.string(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fcs-keyword'), sampleId: Id, keyword: z.string() }),
    z.object({ kind: z.literal('computed'), controls: z.array(Id), method: z.literal('median-diff') }),
    z.object({ kind: z.literal('manual'), basedOn: Id.optional() }),
  ]),
  /** Detector ($PnN) names, in matrix order. Rows = emitting fluorochrome's primary detector. */
  detectors: z.array(z.string()).min(1),
  /** Spillover matrix S (row i = fraction of fluorochrome i's signal seen in detector j). */
  spill: z.array(z.array(Num)),
});
export type CompMatrix = z.infer<typeof CompMatrixSchema>;

/**
 * Compensation reference for a gate/axis dimension.
 * - `uncompensated`: raw linearized values.
 * - `group`: whatever the owning group's compensation setting resolves to.
 */
export const CompRefSchema = z.enum(['uncompensated', 'group']);
export type CompRef = z.infer<typeof CompRefSchema>;

export const GroupCompensationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('per-sample-keyword') }),
  z.object({ mode: z.literal('matrix'), matrixId: Id }),
]);
export type GroupCompensation = z.infer<typeof GroupCompensationSchema>;
