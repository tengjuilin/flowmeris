import type { Cell, ColumnDef, Table } from '@flowmeris/table';
import { toSigFigs } from './format.ts';

/** Significant figures of a derived column when its own are not set. */
export const DEFAULT_SIG_FIGS = 3;

/**
 * Display formatting only; exports carry full double precision. `sig` (derived columns) sets the
 * significant figures of values; counts, n and percentages keep their own formats; `stat` 'value'
 * (a sample variable) shows the number as entered.
 */
export function fmtStat(v: Cell, stat: string | undefined, sig?: number): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Number.isNaN(v)) return 'NaN';
  if (stat === 'value') return String(v);
  if (stat === 'count' || stat === 'n') return String(Math.round(v));
  if (stat?.startsWith('pct') || stat === 'cv' || stat === 'rcv') {
    const r = Number(v.toPrecision(2)); // 99.96 → 100, which toPrecision would print as 1.0e+2
    return Math.abs(r) >= 100 ? String(Math.round(r)) : r.toPrecision(2);
  }
  if (sig !== undefined) return toSigFigs(v, sig);
  return String(Math.round(v));
}

/** Header section of a column: a population, or one of the fixed sections. */
export function sectionOf(c: ColumnDef, byKey: Map<string, ColumnDef>): string {
  if (c.pop) return `pop:${c.pop}`;
  if (c.key === 'group:n') return 'group';
  const src = c.source ? byKey.get(c.source) : undefined;
  const kind = src?.kind ?? c.kind;
  return kind === 'variable' ? 'variables' : kind === 'derived' ? 'derived' : kind;
}

/**
 * Columns of `display` a "CSV (table)" export includes. `selected` lists
 * per-sample column keys (undefined = all); a grouped table keeps its grouping
 * columns and n, and the summaries of the selected columns.
 */
export function exportKeys(display: Table, grouped: boolean, selected: string[] | undefined): string[] {
  const on = selected ? new Set(selected) : undefined;
  return display.columns
    .filter(
      (c) => !on || on.has(c.source ?? c.key) || (grouped && (c.key === 'group:n' || c.kind === 'variable')),
    )
    .map((c) => c.key);
}
