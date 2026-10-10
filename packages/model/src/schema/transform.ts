import { z } from 'zod';
import { Num } from './common.ts';

// ---------------------------------------------------------------------------
// Transforms — Gating-ML 2.0 parameterisation, one-to-one (M-TR-*).
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

export const TransformSchema = z.discriminatedUnion('kind', [
  FlinSchema,
  FlogSchema,
  FasinhSchema,
  LogicleSchema,
  HyperlogSchema,
]);
export type Transform = z.infer<typeof TransformSchema>;
export type TransformKind = Transform['kind'];
/** Content-addressed id: `t_` + fingerprint(transform). See `transformId()`. */
export type TransformId = string;
