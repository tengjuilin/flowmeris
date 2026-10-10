import { z } from 'zod';
import { Id, Num } from './common.ts';

// ---------------------------------------------------------------------------
// Statistics of populations
// ---------------------------------------------------------------------------

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

const SigFigs = z.number().int().min(1).max(15);

export const DerivedColumnSchema = z.discriminatedUnion('kind', [
  /** Per-row arithmetic over other columns, e.g. `[Median PE] / [Median FITC]`. */
  z.object({
    id: Id,
    name: z.string(),
    kind: z.literal('formula'),
    expr: z.string(),
    /** Significant figures the table shows (display only; exports keep full precision). Omitted = 3. */
    sigFigs: SigFigs.optional(),
  }),
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
    sigFigs: SigFigs.optional(),
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
