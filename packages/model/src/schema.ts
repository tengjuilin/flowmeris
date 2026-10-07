import { z } from 'zod';

/**
 * Flowmeris workspace document, schema version 1.
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
  /** Largest linearised value of a time channel (seconds); sets the default time axis. */
  dataMax: Num.optional(),
});
export type ChannelSpec = z.infer<typeof ChannelSpecSchema>;

export const ParseWarningSchema = z.object({ code: z.string(), message: z.string() });
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const SampleSchema = z.object({
  id: Id,
  fileName: z.string(),
  /** User-chosen display name; overrides the derived short name. */
  label: z.string().optional(),
  relativePath: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative(),
  datasetIndex: z.number().int().nonnegative(),
  fcsVersion: z.string(),
  eventCount: z.number().int().nonnegative(),
  keywords: z.record(z.string()),
  channels: z.array(ChannelSpecSchema),
  parseWarnings: z.array(ParseWarningSchema),
  /** Plate well, normalised "A01"–"H12"; from $WELLID or the file name, or assigned on the plate map. */
  well: z.string().optional(),
  /** Values of the workspace's sample variables, by variable id. */
  meta: z.record(z.union([Num, z.string()])).default({}),
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

/** A read-only reference plot shown beside the gating plot in the Plot view. */
export const RefPlotSchema = z.object({
  id: Id,
  /** Population shown; omitted = follow the population being gated. */
  population: Id.optional(),
  /** Sample shown; omitted = follow the selected sample. */
  sampleId: Id.optional(),
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
  /** Overlay the population being gated, in its colour. */
  backgate: z.boolean().default(false),
});
export type RefPlot = z.infer<typeof RefPlotSchema>;

/** One plot in a cell of the Plot view's grid. Gates can be drawn on it like on the Gate view's plot. */
export const PlotCellSchema = z.object({
  id: Id,
  population: Id,
  /** Sample gated and shown; omitted = follow the selected sample. */
  sampleId: Id.optional(),
  /** Further samples overlaid on the plot, each in its own colour. */
  overlay: z.array(Id).default([]),
  kind: PlotKindSchema,
  x: AxisSpecSchema,
  y: AxisSpecSchema.optional(),
  style: PlotStyleSchema,
});
export type PlotCell = z.infer<typeof PlotCellSchema>;

/** The Plot view's fixed grid: `cells` fill it row by row; null = empty cell. */
export const PlotGridSchema = z.object({
  columns: z.number().int().min(1).max(6).default(3),
  cells: z.array(PlotCellSchema.nullable()).default([]),
});
export type PlotGrid = z.infer<typeof PlotGridSchema>;

export const SampleOrderSchema = z.object({
  by: z.enum(['name', 'keyword', 'custom']),
  keyword: z.string().optional(),
  custom: z.array(Id).optional(),
});

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Appearance of a ridge plot. Every member has a default, so `RidgeStyleSchema.parse({})` is the default style. */
export const RidgeStyleSchema = z.object({
  /** 'single': every ridge uses `color`; 'palette': ridges cycle the categorical palette. */
  colorMode: z.enum(['single', 'palette']).default('single'),
  color: HexColor.default('#2a78d6'),
  /** Per-ridge fill colours, overriding `colorMode`. Keyed by ridge id (see `order`). */
  sampleColors: z.record(HexColor).default({}),
  fillOpacity: Num.min(0).max(1).default(0.55),
  /** Outline colour; omitted = the plot background. */
  strokeColor: HexColor.optional(),
  strokeWidth: Num.min(0).max(10).default(1.25),
  /** Row pitch in px; omitted = fit (18–60 px, about 600 px in total). */
  rowHeight: Num.min(8).max(400).optional(),
  /** Plot width in px; omitted = fit the view. */
  width: Num.min(300).max(10000).optional(),
  fontFamily: z.enum(['sans', 'serif', 'mono']).default('sans'),
  /**
   * Display order of ridges; ridges not listed follow in default order. A ridge id is a sample id, or
   * `combo:<JSON of the grouping variables' values>` for combined replicates (see `RidgeCombineSchema`).
   */
  order: z.array(Id).default([]),
  /** Per-ridge label text, overriding the short sample name or the combined values. Keyed by ridge id. */
  sampleLabels: z.record(z.string()).default({}),
  showLabels: z.boolean().default(true),
  showCounts: z.boolean().default(true),
  labelFontSize: Num.min(4).max(48).default(11.5),
  /** Width of the label column in px. */
  labelWidth: Num.min(0).max(1000).default(240),
  showTickLabels: z.boolean().default(true),
  tickFontSize: Num.min(4).max(48).default(11),
  /** Tick marks in data (linear) units; omitted = automatic. A missing label is formatted from the value. */
  ticks: z.array(z.object({ value: Num, label: z.string().optional() })).optional(),
  /** Axis title; omitted = "<marker> :: <channel>". */
  axisTitle: z.string().optional(),
  titleFontSize: Num.min(4).max(48).default(12),
});
export type RidgeStyle = z.infer<typeof RidgeStyleSchema>;

/** Combining replicate samples into one ridge per combination of sample-variable values. */
export const RidgeCombineSchema = z.object({
  enabled: z.boolean().default(false),
  /** Variable ids; samples sharing all their values form one ridge. Empty = every sample in one ridge. */
  by: z.array(Id).default([]),
  /**
   * 'mean': each replicate's histogram is normalised to unit area and the curves are averaged, so every
   * replicate weighs the same. 'pool': the replicates' events are counted together.
   */
  method: z.enum(['mean', 'pool']).default('mean'),
  /** Spread band around the mean curve (method 'mean' only). */
  band: z.enum(['none', 'sd', 'sem']).default('none'),
});
export type RidgeCombine = z.infer<typeof RidgeCombineSchema>;

export const LayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tiles'), id: Id, plotId: Id, columns: z.number().int().min(1).max(16) }),
  z.object({
    kind: z.literal('ridge'),
    id: Id,
    population: Id,
    axis: AxisSpecSchema,
    overlap: Num.min(0).max(0.95),
    norm: z.enum(['mode', 'area']),
    style: RidgeStyleSchema.default({}),
    combine: RidgeCombineSchema.default({}),
  }),
]);
export type Layout = z.infer<typeof LayoutSchema>;
export type RidgeLayout = Extract<Layout, { kind: 'ridge' }>;

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
// Sample variables and the statistics table
// ---------------------------------------------------------------------------

/** An experimental-design variable (dose, replicate, condition…) with one value per sample. */
export const VariableSchema = z.object({
  id: Id,
  name: z.string(),
  type: z.enum(['numeric', 'categorical']),
  unit: z.string().optional(),
  /** Display order of categorical values; values not listed follow in natural order. */
  levels: z.array(z.string()).default([]),
});
export type Variable = z.infer<typeof VariableSchema>;

/**
 * Key of a statistics-table column: `sample:name`, `sample:well`, `var:<variableId>`,
 * `<popId>|count`, `<popId>|pctParent`, `<statSpecId>` or `derived:<derivedId>`.
 */
export type ColumnKey = string;

export const DerivedColumnSchema = z.discriminatedUnion('kind', [
  /** Per-row arithmetic over other columns, e.g. `[Median PE] / [Median FITC]`. */
  z.object({ id: Id, name: z.string(), kind: z.literal('formula'), expr: z.string() }),
  /**
   * `source` relative to the mean of `source` over the reference rows
   * (`refVariable` = `refValue`) that share the row's `within` variable values.
   */
  z.object({
    id: Id,
    name: z.string(),
    kind: z.literal('normalize'),
    source: z.string(),
    refVariable: Id,
    refValue: z.union([Num, z.string()]),
    within: z.array(Id).default([]),
    mode: z.enum(['ratio', 'percent', 'difference']),
  }),
]);
export type DerivedColumn = z.infer<typeof DerivedColumnSchema>;

export const AggFuncSchema = z.enum(['mean', 'sd', 'sem', 'ci95', 'median', 'n', 'cv', 'min', 'max']);
export type AggFunc = z.infer<typeof AggFuncSchema>;

export const StatAnalysisSchema = z.object({
  /** Evaluated in order; a column may refer to earlier ones. */
  derived: z.array(DerivedColumnSchema).default([]),
  aggregate: z
    .object({
      enabled: z.boolean().default(false),
      /** Variable ids to group rows by. */
      by: z.array(Id).default([]),
      funcs: z.array(AggFuncSchema).default(['mean', 'sd', 'n']),
    })
    .default({}),
  /** Columns of the table export, in table order; omitted = all. */
  exportColumns: z.array(z.string()).optional(),
});
export type StatAnalysis = z.infer<typeof StatAnalysisSchema>;

/** A chart of the statistics table (Charts view). */
const TickListSchema = z.array(z.object({ value: Num, label: z.string().optional() }));

/**
 * Appearance of a statistics chart. Every member has a default, so `ChartStyleSchema.parse({})` is the
 * default style. Series are keyed by the JSON of their value (`"\"ctrl\""`, `"5"`, `"null"`).
 */
export const ChartStyleSchema = z.object({
  /** 'palette': series cycle the categorical palette; 'single': every series uses `color`. */
  colorMode: z.enum(['palette', 'single']).default('palette'),
  color: HexColor.default('#2a78d6'),
  /** Per-series colours, overriding `colorMode`. */
  seriesColors: z.record(HexColor).default({}),
  /** Per-series legend text, overriding the value. */
  seriesLabels: z.record(z.string()).default({}),
  /** Display order of series; series not listed follow in the variable's category order. */
  seriesOrder: z.array(z.string()).default([]),
  /** Mean marker radius in px (scatter, line, dot). */
  markerSize: Num.min(0).max(30).default(5),
  lineWidth: Num.min(0).max(20).default(2),
  /** Bar width as a fraction of the category width; omitted = automatic (at most 24 px per series). */
  barWidth: Num.min(0.05).max(1).optional(),
  /** Opacity of bars and mean markers. */
  fillOpacity: Num.min(0).max(1).default(1),
  errorWidth: Num.min(0).max(10).default(1.5),
  /** Error-bar cap width in px; omitted = automatic. */
  capWidth: Num.min(0).max(60).optional(),
  /** Replicate point radius in px. */
  pointSize: Num.min(0).max(20).default(3),
  /** Replicate point opacity; omitted = automatic (by chart type). */
  pointOpacity: Num.min(0).max(1).optional(),
  /** Axis ranges in data units; omitted = fit the data. */
  xMin: Num.optional(),
  xMax: Num.optional(),
  yMin: Num.optional(),
  yMax: Num.optional(),
  /** Tick marks in data units; omitted = automatic. A missing label is formatted from the value. */
  xTicks: TickListSchema.optional(),
  yTicks: TickListSchema.optional(),
  showGrid: z.boolean().default(true),
  showTickLabels: z.boolean().default(true),
  tickFontSize: Num.min(4).max(48).default(11),
  titleFontSize: Num.min(4).max(48).default(12),
  legend: z.enum(['top', 'right', 'none']).default('top'),
  legendFontSize: Num.min(4).max(48).default(12),
  fontFamily: z.enum(['sans', 'serif', 'mono']).default('sans'),
  /** Chart width in px; omitted = fit the view. */
  width: Num.min(240).max(10000).optional(),
  height: Num.min(160).max(10000).default(440),
});
export type ChartStyle = z.infer<typeof ChartStyleSchema>;

export const StatPlotSchema = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['scatter', 'line', 'bar', 'dot']),
  x: z.string(),
  y: z.string(),
  /** Categorical variable id: one colour per value. */
  series: Id.optional(),
  xScale: z.enum(['linear', 'log10']).default('linear'),
  yScale: z.enum(['linear', 'log10']).default('linear'),
  /** Error bars over the rows sharing x (and series). */
  error: z.enum(['none', 'sd', 'sem', 'ci95']).default('sem'),
  /** Overlay the individual rows (replicates). */
  showPoints: z.boolean().default(true),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  style: ChartStyleSchema.default({}),
});
export type StatPlot = z.infer<typeof StatPlotSchema>;

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
  /** Reference plots of the Plot view, one per tab. */
  refPlots: z.array(RefPlotSchema).default([]),
  /** Grid of plots of the Plot view. */
  grid: PlotGridSchema.default({}),
  layouts: z.array(LayoutSchema),
  stats: z.array(StatSpecSchema),
  /** Derived columns, grouping and export columns of the statistics table. */
  analysis: StatAnalysisSchema.default({}),
  /** Charts of the statistics table. */
  statPlots: z.array(StatPlotSchema).default([]),
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
  /** Sample variables, shared by all groups. */
  variables: z.array(VariableSchema).default([]),
  groups: z.array(GroupSchema),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
