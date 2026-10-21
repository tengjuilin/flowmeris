import { z } from 'zod';
import { Num } from './common.ts';

// ---------------------------------------------------------------------------
// Transforms — Gating-ML 2.0 parameterisation, one-to-one (M-TR-*), plus two FlowJo display scales that
// Gating-ML has no element for (`biex`, `miltenyi`; ADR-0014).
// All map data values onto (approximately) the unit interval [0, 1].
// ---------------------------------------------------------------------------

export const FlinSchema = z.object({ kind: z.literal('flin'), T: Num.positive(), A: Num.nonnegative() });
export const FlogSchema = z.object({ kind: z.literal('flog'), T: Num.positive(), M: Num.positive() });
export const FasinhSchema = z.object({
  kind: z.literal('fasinh'),
  T: Num.positive(),
  M: Num.positive(),
  A: Num.nonnegative(),
});
export const LogicleSchema = z.object({
  kind: z.literal('logicle'),
  T: Num.positive(),
  W: Num.nonnegative(),
  M: Num.positive(),
  A: Num,
});
export const HyperlogSchema = z.object({
  kind: z.literal('hyperlog'),
  T: Num.positive(),
  W: Num.positive(),
  M: Num.positive(),
  A: Num,
});

/** FlowJo's biexponential display (M-TR-BIEX): top T, width basis (≤ −1), positive and extra negative decades. */
export const BiexSchema = z.object({
  kind: z.literal('biex'),
  T: Num.positive(),
  width: Num.max(-1),
  pos: Num.positive(),
  neg: Num.nonnegative(),
});
/** Miltenyi-style display (M-TR-MILTENYI): log over M decades below T, linear over L decades below that. */
export const MiltenyiSchema = z.object({
  kind: z.literal('miltenyi'),
  T: Num.positive(),
  M: Num.positive(),
  L: Num.nonnegative(),
});

export const TransformSchema = z.discriminatedUnion('kind', [
  FlinSchema,
  FlogSchema,
  FasinhSchema,
  LogicleSchema,
  HyperlogSchema,
  BiexSchema,
  MiltenyiSchema,
]);
export type Transform = z.infer<typeof TransformSchema>;
export type TransformKind = Transform['kind'];
/** Content-addressed id: `t_` + fingerprint(transform). See `transformId()`. */
export type TransformId = string;
