import type { AggFunc, DerivedColumn } from '@flowmeris/model';
import { ci95HalfWidth, mean, medianSorted, sd, sem } from '@flowmeris/stats';
import { ExprError, evalExpr, exprRefs, parseExpr } from './expr.ts';

export type Cell = number | string | undefined;

export interface ColumnDef {
  key: string;
  /** Unique label, used as the CSV header and for [references] in formulas. */
  label: string;
  type: 'numeric' | 'categorical';
  kind: 'sample' | 'variable' | 'stat' | 'derived' | 'aggregate';
  /** Population of a statistic column. */
  pop?: string;
  /** Aggregate columns: the summarised column and the function. */
  source?: string;
  func?: AggFunc | 'n';
}

export interface Row {
  id: string;
  values: Record<string, Cell>;
  /** Aggregated rows: the ids of the rows summarised. */
  members?: string[];
}

export interface Table {
  columns: ColumnDef[];
  rows: Row[];
}

/** Display order of a categorical column's values (e.g. a variable's `levels`). */
export type LevelOrder = (key: string) => string[] | undefined;

const num = (v: Cell): number => (typeof v === 'number' ? v : Number.NaN);

/** Ascending order: numbers numerically, strings by the given levels then naturally; empty last. */
export function compareCells(a: Cell, b: Cell, levels?: string[]): number {
  const ea = a === undefined || a === '';
  const eb = b === undefined || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  if (levels) {
    const ia = levels.indexOf(sa);
    const ib = levels.indexOf(sb);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || 0;
  }
  return sa.localeCompare(sb, undefined, { numeric: true });
}

/** Equality of cell values, numbers compared numerically ("1" equals 1). */
export function sameCell(a: Cell, b: Cell): boolean {
  if (a === undefined || b === undefined || a === '' || b === '') return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return a === b;
}

export interface DerivedResult {
  table: Table;
  /** Problems by derived column id (parse errors, unknown columns). */
  errors: Record<string, string>;
}

/**
 * Append derived columns, in order (M-STAT-EXPR, M-STAT-NORM). A formula may
 * refer to any column by its label, including earlier derived columns.
 */
export function applyDerived(table: Table, derived: DerivedColumn[]): DerivedResult {
  const columns = [...table.columns];
  const rows = table.rows.map((r) => ({ ...r, values: { ...r.values } }));
  const errors: Record<string, string> = {};
  const byLabel = new Map(columns.map((c) => [c.label, c.key]));
  for (const d of derived) {
    const key = `derived:${d.id}`;
    if (d.kind === 'formula') {
      try {
        const e = parseExpr(d.expr);
        const missing = [...exprRefs(e)].filter((n) => !byLabel.has(n) && !columns.some((c) => c.key === n));
        if (missing.length) errors[d.id] = `Unknown column ${missing.map((m) => `[${m}]`).join(', ')}`;
        for (const r of rows) r.values[key] = evalExpr(e, (n) => num(r.values[byLabel.get(n) ?? n]));
      } catch (err) {
        errors[d.id] =
          err instanceof ExprError ? `${err.message} (at ${err.pos + 1})` : String((err as Error).message);
        for (const r of rows) r.values[key] = Number.NaN;
      }
    } else {
      if (!columns.some((c) => c.key === d.source)) errors[d.id] = 'Source column no longer exists';
      const refKey = `var:${d.refVariable}`;
      const within = d.within.map((w) => `var:${w}`);
      const refs = rows.filter((r) => sameCell(r.values[refKey], d.refValue));
      if (refs.length === 0 && !errors[d.id]) errors[d.id] = 'No reference rows';
      for (const r of rows) {
        const mine = refs.filter((x) => within.every((w) => sameCell(x.values[w], r.values[w])));
        const vals = mine.map((x) => num(x.values[d.source])).filter(Number.isFinite);
        const ref = vals.length ? mean(vals) : Number.NaN;
        const v = num(r.values[d.source]);
        r.values[key] = d.mode === 'difference' ? v - ref : d.mode === 'percent' ? (100 * v) / ref : v / ref;
      }
    }
    const label = uniqueLabel(d.name || 'Derived', byLabel);
    byLabel.set(label, key);
    columns.push({ key, label, type: 'numeric', kind: 'derived' });
  }
  return { table: { columns, rows }, errors };
}

/** `name`, or `name (2)`, `name (3)`… if taken. */
export function uniqueLabel(name: string, taken: { has(k: string): boolean }): string {
  if (!taken.has(name)) return name;
  for (let k = 2; ; k++) if (!taken.has(`${name} (${k})`)) return `${name} (${k})`;
}

const FUNC_LABEL: Record<AggFunc, string> = {
  mean: 'mean',
  sd: 'SD',
  sem: 'SEM',
  ci95: '95% CI ±',
  median: 'median',
  n: 'n',
  cv: 'CV %',
  min: 'min',
  max: 'max',
};

/** Summary of finite values (M-STAT-AGG). SD uses n − 1; the 95% CI half-width is t₀.₉₇₅,ₙ₋₁ · SEM. */
export function summarise(values: number[], f: AggFunc): number {
  const xs = values.filter(Number.isFinite);
  switch (f) {
    case 'n':
      return xs.length;
    case 'mean':
      return mean(xs);
    case 'sd':
      return sd(xs);
    case 'sem':
      return sem(xs);
    case 'ci95':
      return ci95HalfWidth(xs);
    case 'cv':
      return (100 * sd(xs)) / mean(xs);
    case 'median':
      return medianSorted(Float64Array.from(xs).sort());
    case 'min':
      return xs.length ? Math.min(...xs) : Number.NaN;
    case 'max':
      return xs.length ? Math.max(...xs) : Number.NaN;
  }
}

/**
 * Group rows by the values of `by` and summarise every other numeric column
 * with each of `funcs`. Rows with an empty `by` value form their own group.
 * The result has the `by` columns, `n` (rows per group), then `<key>#<func>`.
 */
export function aggregate(table: Table, by: string[], funcs: AggFunc[], levels?: LevelOrder): Table {
  const byCols = by.flatMap((k) => table.columns.filter((c) => c.key === k));
  const groups = new Map<string, Row[]>();
  for (const r of table.rows) {
    const k = JSON.stringify(byCols.map((c) => r.values[c.key] ?? null));
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const numeric = table.columns.filter(
    (c) => c.type === 'numeric' && c.kind !== 'sample' && !by.includes(c.key),
  );
  const fs = funcs.filter((f) => f !== 'n');
  const columns: ColumnDef[] = [
    ...byCols,
    ...(funcs.includes('n')
      ? [{ key: 'group:n', label: 'n', type: 'numeric', kind: 'aggregate', func: 'n' } as ColumnDef]
      : []),
    ...numeric.flatMap((c) =>
      fs.map(
        (f): ColumnDef => ({
          key: `${c.key}#${f}`,
          label: `${c.label} (${FUNC_LABEL[f]})`,
          type: 'numeric',
          kind: 'aggregate',
          source: c.key,
          func: f,
          ...(c.pop ? { pop: c.pop } : {}),
        }),
      ),
    ),
  ];
  const rows: Row[] = [...groups.values()].map((members) => {
    const values: Record<string, Cell> = { 'group:n': members.length };
    for (const c of byCols) values[c.key] = members[0]!.values[c.key];
    for (const c of numeric) {
      const xs = members.map((m) => num(m.values[c.key]));
      for (const f of fs) values[`${c.key}#${f}`] = summarise(xs, f);
    }
    return { id: members.map((m) => m.id).join('+'), values, members: members.map((m) => m.id) };
  });
  rows.sort((a, b) => {
    for (const c of byCols) {
      const d = compareCells(a.values[c.key], b.values[c.key], levels?.(c.key));
      if (d) return d;
    }
    return 0;
  });
  return { columns, rows };
}

export type ErrorKind = 'none' | 'sd' | 'sem' | 'ci95';

export interface PlotPoint {
  x: Cell;
  mean: number;
  /** Half-width of the error bar (NaN when not defined, e.g. n = 1). */
  err: number;
  n: number;
  values: number[];
  rowIds: string[];
}

export interface PlotSeries {
  /** Series value; undefined when the chart has no series variable. */
  key: Cell;
  points: PlotPoint[];
}

/**
 * Chart summary: rows grouped by series then by x; each group gives the mean
 * of y and the requested error half-width over its finite y values. Rows with
 * an empty x are left out.
 */
export function summaryForPlot(
  rows: Row[],
  x: string,
  y: string,
  series: string | undefined,
  error: ErrorKind,
  levels?: LevelOrder,
): PlotSeries[] {
  const bySeries = new Map<string, { key: Cell; groups: Map<string, { x: Cell; rows: Row[] }> }>();
  for (const r of rows) {
    const xv = r.values[x];
    if (xv === undefined || xv === '' || (typeof xv === 'number' && !Number.isFinite(xv))) continue;
    const sv = series ? r.values[series] : undefined;
    const sk = JSON.stringify(sv ?? null);
    let s = bySeries.get(sk);
    if (!s) bySeries.set(sk, (s = { key: sv, groups: new Map() }));
    const xk = JSON.stringify(xv);
    const g = s.groups.get(xk);
    if (g) g.rows.push(r);
    else s.groups.set(xk, { x: xv, rows: [r] });
  }
  const out: PlotSeries[] = [...bySeries.values()].map((s) => ({
    key: s.key,
    points: [...s.groups.values()]
      .map((g) => {
        const values = g.rows.map((r) => num(r.values[y])).filter(Number.isFinite);
        return {
          x: g.x,
          mean: mean(values),
          err: error === 'none' ? Number.NaN : summarise(values, error),
          n: values.length,
          values,
          rowIds: g.rows.map((r) => r.id),
        };
      })
      .sort((a, b) => compareCells(a.x, b.x, levels?.(x))),
  }));
  return series ? out.sort((a, b) => compareCells(a.key, b.key, levels?.(series))) : out;
}

/** CSV-ready rows (header first) of the given columns. */
export function tableRows(table: Table, keys?: string[]): unknown[][] {
  const cols = keys ? keys.flatMap((k) => table.columns.filter((c) => c.key === k)) : table.columns;
  return [cols.map((c) => c.label), ...table.rows.map((r) => cols.map((c) => r.values[c.key] ?? ''))];
}
