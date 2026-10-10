import { z } from 'zod';
import { StatPlotSchema } from './chart.ts';
import { Id } from './common.ts';
import { CompMatrixSchema, GroupCompensationSchema } from './compensation.ts';
import { GateOverrideSchema, GatingTemplateSchema } from './gate.ts';
import { AxisSpecSchema, PlotGridSchema, PlotSpecSchema, RefPlotSchema } from './plot.ts';
import { LayoutSchema, RidgeCombineSchema } from './ridge.ts';
import { SampleSchema } from './sample.ts';
import { StatAnalysisSchema, StatSpecSchema, VariableSchema } from './table.ts';
import { TransformSchema } from './transform.ts';

export const SCHEMA_VERSION = 1 as const;

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
  /**
   * Plots of the Tiles view, at most one per population: their own type and axes, copied from the Gate
   * view's plot once on first visit and edited apart from it afterwards; drawn with the default appearance.
   */
  tilePlots: z.array(PlotSpecSchema).default([]),
  /** Reference plots of the Plot view, one per tab. */
  refPlots: z.array(RefPlotSchema).default([]),
  /** Grid of plots of the Plot view. */
  grid: PlotGridSchema.default({}),
  layouts: z.array(LayoutSchema),
  /**
   * Replicate settings of the ridge plot shared by all the group's populations while `ridgeFollow` is on.
   * With it off, each ridge layout keeps its own `combine`.
   */
  ridgeCombine: RidgeCombineSchema.default({}),
  ridgeFollow: z.boolean().default(true),
  /**
   * The ridge plot of the population opened next takes the settings of the one left (each keeps its
   * ticks and axis title).
   */
  ridgeStyleFollow: z.boolean().default(false),
  /**
   * Gate-view plots share their display and figure settings (each keeps its own type, axes, title, custom
   * ticks and axis titles). Off for files saved before this existed.
   */
  plotStyleFollow: z.boolean().default(false),
  /** The same as `plotStyleFollow`, for the Tiles plots. */
  tilePlotStyleFollow: z.boolean().default(true),
  /**
   * A change to one grid plot's settings is made to every grid plot too: only the settings changed (each
   * keeps its title, ticks and axis titles; an axis scale and range go to plots showing the same channel).
   */
  gridStyleFollow: z.boolean().default(false),
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
