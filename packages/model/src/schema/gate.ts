import { z } from 'zod';
import { Id, Num } from './common.ts';
import { CompRefSchema } from './compensation.ts';

// ---------------------------------------------------------------------------
// Gates and populations (Gating-ML 2.0 semantics; see docs/methods/gating.md)
// ---------------------------------------------------------------------------

export const GateDimSchema = z.object({
  /** $PnN of the channel. */
  channel: z.string(),
  comp: CompRefSchema,
  /** Transform the gate coordinates are expressed in; null = raw (linear) data units. */
  transform: z.string().nullable(),
});
export type GateDim = z.infer<typeof GateDimSchema>;

const Point = z.tuple([Num, Num]);

export const GeometrySchema = z.discriminatedUnion('kind', [
  /** 1D range or 2D rectangle; null bound = unbounded. min inclusive, max exclusive. */
  z.object({ kind: z.literal('rect'), min: z.array(Num.nullable()), max: z.array(Num.nullable()) }),
  z.object({ kind: z.literal('polygon'), vertices: z.array(Point).min(3) }),
  /** Gating-ML ellipsoid: inside iff (x-μ)ᵀ Σ⁻¹ (x-μ) ≤ d2. */
  z.object({
    kind: z.literal('ellipse'),
    mean: Point,
    cov: z.tuple([Point, Point]),
    d2: Num.positive(),
  }),
  z.object({ kind: z.literal('quadrant'), center: Point }),
  /**
   * Spider gate: four rays from `center` through the four `arms` points, in
   * order [up (Q1|Q2), right (Q2|Q3), down (Q3|Q4), left (Q4|Q1)] — see
   * gating/spider.ts. Arms are points rather than angles because angles are
   * not invariant under axis rescaling.
   */
  z.object({ kind: z.literal('spider'), center: Point, arms: z.tuple([Point, Point, Point, Point]) }),
  /**
   * 1D split (FlowJo's bisector): one divider at `at` cuts the axis into two mutually exclusive
   * regions, 'lo' = [−∞, at) and 'hi' = [at, +∞), as a Gating-ML quadrant gate with one divider.
   */
  z.object({ kind: z.literal('split'), at: Num }),
]);
export type Geometry = z.infer<typeof GeometrySchema>;
export type GeometryKind = Geometry['kind'];

export const GateSchema = z.object({
  id: Id,
  parentPop: Id,
  dims: z.array(GateDimSchema).min(1).max(2),
  geometry: GeometrySchema,
});
export type Gate = z.infer<typeof GateSchema>;

/**
 * Region of a gate a population represents. Quadrant/spider regions follow
 * FlowJo's convention: Q1 top-left (x−, y+), Q2 top-right (x+, y+), Q3
 * bottom-right (x+, y−), Q4 bottom-left (x−, y−). A split gate has 'lo'
 * (below the divider, x−) and 'hi' (at or above it, x+).
 */
export const RegionSchema = z.enum(['in', 'Q1', 'Q2', 'Q3', 'Q4', 'lo', 'hi']);
export type Region = z.infer<typeof RegionSchema>;

export const PopulationSchema = z.object({
  id: Id,
  parent: Id.nullable(),
  gate: Id.nullable(),
  region: RegionSchema,
  name: z.string(),
  color: z.string(),
  /**
   * Where the user moved the population's label on its gate's plots: an offset from the default
   * place, as fractions of the plot's width and height (x right, y down). Display only.
   */
  labelOffset: z.tuple([Num, Num]).optional(),
});
export type Population = z.infer<typeof PopulationSchema>;

export const ROOT_POPULATION_ID = 'root';

export const GatingTemplateSchema = z.object({
  populations: z.record(PopulationSchema),
  gates: z.record(GateSchema),
});
export type GatingTemplate = z.infer<typeof GatingTemplateSchema>;

export const GateOverrideSchema = z.object({
  sampleId: Id,
  gateId: Id,
  geometry: GeometrySchema,
  note: z.string().optional(),
  at: z.string(),
});
export type GateOverride = z.infer<typeof GateOverrideSchema>;
