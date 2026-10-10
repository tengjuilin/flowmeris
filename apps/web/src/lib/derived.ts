import type { DerivedColumn, Variable } from '@flowmeris/model';
import type { ColumnDef } from '@flowmeris/table';

/** Derived columns of the Statistics table: defaults and descriptions. */

type Normalize = Extract<DerivedColumn, { kind: 'normalize' }>;

/** The column a new normalization starts from: the most recently added value statistic (median, mean…), else a frequency. */
export function defaultNormalizeSource(columns: ColumnDef[]): string {
  const last = [...columns].reverse();
  return (
    last.find((c) => (c.kind === 'stat' && !/\|(count|pctParent)$/.test(c.key)) || c.kind === 'derived')
      ?.key ??
    last.find((c) => c.kind === 'stat')?.key ??
    ''
  );
}

/** The name of a normalization the user has not named, e.g. "Median PE-A / Dose 0". */
export function normalizeAutoName(d: Normalize, columns: ColumnDef[], variables: Variable[]): string {
  const src = columns.find((c) => c.key === d.source);
  const refVar = variables.find((v) => v.id === d.refVariable);
  const srcName = src ? (src.label.split(' | ').pop() ?? src.label) : '?';
  const ref = `${refVar?.name ?? '?'} ${d.refValue}`;
  return d.mode === 'ratio'
    ? `${srcName} / ${ref}`
    : d.mode === 'percent'
      ? `${srcName} % of ${ref}`
      : `${srcName} − ${ref}`;
}

/** One line describing a derived column, under its name in the list. */
export function derivedSummary(d: DerivedColumn, variables: Variable[]): string {
  const name = (id: string) => variables.find((v) => v.id === id)?.name ?? '?';
  if (d.kind === 'formula') return `= ${d.expr}`;
  const within = d.within.length ? ` within ${d.within.map(name).join(', ')}` : '';
  return `${d.mode} to ${name(d.refVariable)} = ${d.refValue}${within}`;
}

/** Columns a derived column may use: those before it (all of them for a new one). */
export function columnsBefore(columns: ColumnDef[], id?: string): ColumnDef[] {
  const idx = id ? columns.findIndex((c) => c.key === `derived:${id}`) : -1;
  return idx < 0 ? columns : columns.slice(0, idx);
}
