import { z } from 'zod';

/**
 * flowmeris workspace document, schema version 1.
 *
 * The workspace is plain JSON. Every analysis decision (compensation,
 * transforms, gates, per-sample overrides, plots, statistics) is stored here so
 * that a workspace file plus the original FCS files fully reproduces an
 * analysis. See docs/schema/ for the generated JSON Schema and docs/adr/ for
 * the rationale behind the shape.
 */

export const SCHEMA_VERSION = 1 as const;

const Num = z.number().finite();
const Id = z.string().min(1);

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
 * - `uncompensated`: raw linearised values.
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

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const ChannelSpecSchema = z.object({
  /** 1-based parameter index n. */
  n: z.number().int().positive(),
  pnn: z.string(),
  pns: z.string().optional(),
  pnb: z.union([z.number().int().positive(), z.literal('*')]),
  pne: z.tuple([Num, Num]),
  png: Num.optional(),
  pnr: Num,
  dataType: z.enum(['I', 'F', 'D', 'A']),
  kind: z.enum(['scatter', 'fluor', 'time', 'other']),
});
export type ChannelSpec = z.infer<typeof ChannelSpecSchema>;

export const ParseWarningSchema = z.object({ code: z.string(), message: z.string() });
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const SampleSchema = z.object({
  id: Id,
  fileName: z.string(),
  relativePath: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative(),
  datasetIndex: z.number().int().nonnegative(),
  fcsVersion: z.string(),
  eventCount: z.number().int().nonnegative(),
  keywords: z.record(z.string()),
  channels: z.array(ChannelSpecSchema),
  parseWarnings: z.array(ParseWarningSchema),
});
export type Sample = z.infer<typeof SampleSchema>;

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
 * bottom-right (x+, y−), Q4 bottom-left (x−, y−).
 */
export const RegionSchema = z.enum(['in', 'Q1', 'Q2', 'Q3', 'Q4']);
export type Region = z.infer<typeof RegionSchema>;

export const PopulationSchema = z.object({
  id: Id,
  parent: Id.nullable(),
  gate: Id.nullable(),
  region: RegionSchema,
  name: z.string(),
  color: z.string(),
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

// ---------------------------------------------------------------------------
// Plots, layouts, statistics
// ---------------------------------------------------------------------------

export const AxisSpecSchema = z.object({
  channel: z.string(),
  comp: CompRefSchema,
  transform: z.string(),
  /** Display range in transformed units. */
  range: z.tuple([Num, Num]),
});
export type AxisSpec = z.infer<typeof AxisSpecSchema>;

export const PlotKindSchema = z.enum(['dot', 'pseudocolor', 'density', 'contour', 'histogram']);
export type PlotKind = z.infer<typeof PlotKindSchema>;

export const ContourSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('equal-prob'), pct: z.union([z.literal(2), z.literal(5), z.literal(10)]) }),
  z.object({ mode: z.literal('log'), levels: z.number().int().min(1).max(20) }),
]);
export type ContourSpec = z.infer<typeof ContourSpecSchema>;

export const PlotStyleSchema = z.object({
  colormap: z.string(),
  pointPx: z.number().int().min(1).max(4),
  /** Gaussian smoothing σ in display bins (0 = none). */
  smoothSigmaBins: Num.nonnegative(),
  contour: ContourSpecSchema,
  showOutliers: z.boolean(),
  histBins: z.number().int().min(16).max(1024),
  histNorm: z.enum(['count', 'mode', 'area']),
  histSmooth: z.boolean(),
});
export type PlotStyle = z.infer<typeof PlotStyleSchema>;

export const PlotSpecSchema = z.object({
  id: Id,
  population: Id,
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
});
export type PlotSpec = z.infer<typeof PlotSpecSchema>;

export const SampleOrderSchema = z.object({
  by: z.enum(['name', 'keyword', 'custom']),
  keyword: z.string().optional(),
  custom: z.array(Id).optional(),
});

export const LayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tiles'), id: Id, plotId: Id, columns: z.number().int().min(1).max(16) }),
  z.object({
    kind: z.literal('ridge'),
    id: Id,
    population: Id,
    axis: AxisSpecSchema,
    overlap: Num.min(0).max(0.95),
    norm: z.enum(['mode', 'area']),
  }),
]);
export type Layout = z.infer<typeof LayoutSchema>;

export const StatKindSchema = z.enum([
  'count',
  'pctParent',
  'pctGrandparent',
  'pctTotal',
  'mean',
  'median',
  'geomMean',
  'sd',
  'cv',
  'rsd',
  'rcv',
  'percentile',
  'min',
  'max',
]);
export type StatKind = z.infer<typeof StatKindSchema>;

export const StatSpecSchema = z.object({
  id: Id,
  population: Id,
  stat: StatKindSchema,
  channel: z.string().optional(),
  /** Linear (compensated) data units, or the given axis transform's units. */
  space: z.enum(['linear', 'transformed']),
  transform: z.string().optional(),
  /** Percentile in (0, 100) for stat = 'percentile'. */
  p: Num.min(0).max(100).optional(),
});
export type StatSpec = z.infer<typeof StatSpecSchema>;

// ---------------------------------------------------------------------------
// Groups and workspace
// ---------------------------------------------------------------------------

export const GroupSchema = z.object({
  id: Id,
  name: z.string(),
  sampleIds: z.array(Id),
  /** Canonical $PnN set shared by all samples in the group. */
  channels: z.array(z.string()),
  compensation: GroupCompensationSchema,
  template: GatingTemplateSchema,
  overrides: z.array(GateOverrideSchema),
  /** Default axis per channel ($PnN). */
  axisDefaults: z.record(AxisSpecSchema),
  plots: z.array(PlotSpecSchema),
  layouts: z.array(LayoutSchema),
  stats: z.array(StatSpecSchema),
});
export type Group = z.infer<typeof GroupSchema>;

export const WorkspaceSchema = z.object({
  schema: z.literal('flowmeris.workspace'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  app: z.object({ version: z.string(), commit: z.string(), kernels: z.string() }),
  id: Id,
  name: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  transforms: z.record(TransformSchema),
  compMatrices: z.record(CompMatrixSchema),
  samples: z.record(SampleSchema),
  groups: z.array(GroupSchema),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
