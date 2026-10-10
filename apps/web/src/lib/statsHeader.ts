import type { DerivedColumn } from '@flowmeris/model';
import type { ColumnDef, Table } from '@flowmeris/table';
import { fracDigits } from './format.ts';
import { DEFAULT_SIG_FIGS, sectionOf } from './statsFormat.ts';
import type { StatColumn } from './statsTable.ts';

/** Layout of the Statistics table: header sections, dividers, pinned columns and number formats. */

/** Header sections (sample, variables, each population, derived) over `columns`, as runs. */
export function headerSections(columns: ColumnDef[], byKey: Map<string, ColumnDef>) {
  const sections: { id: string; span: number }[] = [];
  for (const c of columns) {
    const id = sectionOf(c, byKey);
    const last = sections[sections.length - 1];
    if (last?.id === id) last.span++;
    else sections.push({ id, span: 1 });
  }
  return sections;
}

/**
 * Columns that get a left divider: the first of every section after the first, and in a grouped table
 * also the first summary (mean, SD, …) of each source column.
 */
export function sectionStarts(
  columns: ColumnDef[],
  sections: { span: number }[],
  grouped: boolean,
): Set<string> {
  const starts = new Set<string>();
  let colIdx = 0;
  for (const sec of sections.slice(0, -1)) {
    colIdx += sec.span;
    starts.add(columns[colIdx]!.key);
  }
  if (grouped)
    columns.forEach((c, i) => {
      const prev = columns[i - 1];
      if (prev && c.source && c.source !== prev.source) starts.add(c.key);
    });
  return starts;
}

/** Columns pinned on horizontal scroll: the sample name, or every column the replicates are combined by. */
export const pinnedCount = (columns: ColumnDef[], grouped: boolean) =>
  grouped
    ? Math.max(
        1,
        columns.findIndex((c) => c.kind === 'aggregate'),
      )
    : 1;

/** The statistic a column's values are formatted as (see `fmtStat`). */
export const statOf = (c: ColumnDef, statByKey: Map<string, StatColumn>): string | undefined =>
  c.func === 'n'
    ? 'n'
    : c.func === 'cv'
      ? 'cv'
      : c.kind === 'variable'
        ? 'value'
        : statByKey.get(c.source ?? c.key)?.stat;

/**
 * Significant figures of a column: derived columns (and their replicate summaries) show their own;
 * summaries of a sample variable (e.g. the mean dose of a group) the default ones.
 */
export function sigOf(
  c: ColumnDef,
  byKey: Map<string, ColumnDef>,
  derived: Map<string, DerivedColumn>,
): number | undefined {
  const key = c.source ?? c.key;
  if (byKey.get(key)?.kind === 'variable') return DEFAULT_SIG_FIGS;
  if (!key.startsWith('derived:')) return undefined;
  return derived.get(key.slice('derived:'.length))?.sigFigs ?? DEFAULT_SIG_FIGS;
}

/** Longest fractional part of each numeric column of `table` as `format` shows it, to line up decimal points. */
export function fracLengths(table: Table, format: (c: ColumnDef, v: number) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of table.columns) {
    if (c.type !== 'numeric') continue;
    let n = 0;
    for (const row of table.rows) {
      const v = row.values[c.key];
      if (typeof v === 'number') n = Math.max(n, fracDigits(format(c, v)));
    }
    out.set(c.key, n);
  }
  return out;
}
