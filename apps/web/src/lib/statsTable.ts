import type { PopulationCount, StatResult } from '@flowmeris/engine';
import { type StatCell, statLabel } from '@flowmeris/export';
import {
  type CompMatrix,
  type Group,
  type Population,
  type Sample,
  type StatSpec,
  type Transform,
  type Variable,
  populationPath,
} from '@flowmeris/model';
import { type Cell, type ColumnDef, type LevelOrder, type Table, uniqueLabel } from '@flowmeris/table';

/**
 * The statistics table's pure parts: per-sample dependency keys, a sample's results as a row, the
 * statistic columns and the base table. The hooks that fetch and cache the rows are in
 * state/hooks/stats.ts.
 */

const FREQUENCY_STATS = new Set(['count', 'pctParent', 'pctGrandparent', 'pctTotal']);

/** One sample's row: values by column key (`pop|count`, `pop|pctParent`, or a StatSpec id) and export cells. */
export interface SampleTable {
  values: Map<string, number>;
  cells: StatCell[];
}

/** A statistic column of the per-sample table. */
export interface StatColumn {
  key: string;
  /** Short label shown under the population header. */
  label: string;
  pop: string;
  stat: string;
  specId?: string;
}

export interface SampleRow {
  sid: string;
  table: SampleTable | undefined;
  /** Shown values are from before the latest edit; the new ones are being computed. */
  stale: boolean;
}

/**
 * Dependency key of each sample's row: the gating structure and geometry
 * (with the sample's own overrides), compensation, transforms and requested
 * statistics. Population names and colors are left out — they do not change
 * any value. The shared part is serialized once, not once per sample.
 */
export function sampleKeys(
  g: Group,
  pops: Population[],
  transforms: Record<string, Transform>,
  compMatrices: Record<string, CompMatrix>,
  sampleIds: string[],
): Map<string, string> {
  const comp = g.compensation.mode === 'matrix' ? compMatrices[g.compensation.matrixId] : g.compensation;
  const shared = JSON.stringify([
    pops.map((p) => [p.id, p.parent, p.gate, p.region]),
    g.template.gates,
    comp,
    transforms,
    g.stats,
  ]);
  const overrides = new Map<string, unknown[]>();
  for (const o of g.overrides) {
    let list = overrides.get(o.sampleId);
    if (!list) overrides.set(o.sampleId, (list = []));
    list.push([o.gateId, o.geometry]);
  }
  return new Map(
    sampleIds.map((sid) => [sid, `${sid}\u0000${JSON.stringify(overrides.get(sid) ?? [])}\u0000${shared}`]),
  );
}

/** A sample's counts and statistics from the engine, as table values and export cells. */
export function toTable(
  sid: string,
  counts: PopulationCount[],
  stats: StatResult[],
  specs: StatSpec[],
): SampleTable {
  const values = new Map<string, number>();
  const cells: StatCell[] = [];
  for (const c of counts) {
    values.set(`${c.popId}|count`, c.count);
    cells.push({
      sampleId: sid,
      population: c.popId,
      statistic: 'count',
      space: 'n/a',
      value: c.count,
      n: c.count,
      nExcluded: 0,
    });
    if (c.popId !== 'root') {
      const pct = c.parentCount > 0 ? (100 * c.count) / c.parentCount : Number.NaN;
      values.set(`${c.popId}|pctParent`, pct);
      cells.push({
        sampleId: sid,
        population: c.popId,
        statistic: 'pctParent',
        space: 'n/a',
        value: pct,
        n: c.count,
        nExcluded: 0,
      });
    }
  }
  const specById = new Map(specs.map((s) => [s.id, s]));
  for (const r of stats) {
    const spec = specById.get(r.statId)!;
    values.set(spec.id, r.value);
    cells.push({
      sampleId: sid,
      population: spec.population,
      statistic: spec.stat,
      ...(spec.channel ? { channel: spec.channel } : {}),
      space: FREQUENCY_STATS.has(spec.stat) ? 'n/a' : spec.space,
      ...(spec.transform ? { transform: spec.transform } : {}),
      ...(spec.p !== undefined ? { p: spec.p } : {}),
      value: r.value,
      n: r.n,
      nExcluded: r.nExcluded,
    });
  }
  return { values, cells };
}

/**
 * The statistic columns, population by population in `pops` order: count, % parent (not for the
 * root), then the group's statistics of that population. `marker` gives a channel's marker name.
 */
export function statColumns(
  group: Group,
  pops: Population[],
  marker: (channel?: string) => string | undefined,
): StatColumn[] {
  const out: StatColumn[] = [];
  const byPop = new Map<string, StatSpec[]>();
  for (const s of group.stats) {
    const list = byPop.get(s.population);
    if (list) list.push(s);
    else byPop.set(s.population, [s]);
  }
  for (const p of pops) {
    out.push({ key: `${p.id}|count`, label: 'Count', pop: p.id, stat: 'count' });
    if (p.id !== 'root')
      out.push({ key: `${p.id}|pctParent`, label: '% Parent', pop: p.id, stat: 'pctParent' });
    for (const s of byPop.get(p.id) ?? [])
      out.push({
        key: s.id,
        label: statLabel(s, marker(s.channel)),
        pop: p.id,
        stat: s.stat,
        specId: s.id,
      });
  }
  return out;
}

export function variableLabel(v: Variable): string {
  return v.unit ? `${v.name} (${v.unit})` : v.name;
}

/** Display order of categorical variable columns (`var:<id>` keys). */
export function levelOrder(variables: Variable[]): LevelOrder {
  const m = new Map(variables.map((v) => [`var:${v.id}`, v.levels]));
  return (k) => m.get(k);
}

/**
 * The table before derived columns: sample name and well, the sample variables, then the statistic
 * columns (labeled `population | statistic`; a population whose name is not unique is shown by its
 * path). One row per entry of `rows`.
 */
export function baseTable(
  group: Group | undefined,
  statCols: StatColumn[],
  rows: SampleRow[],
  samples: Record<string, Sample>,
  variables: Variable[],
  names: Record<string, string>,
): Table {
  const columns: ColumnDef[] = [];
  const taken = new Set<string>();
  const add = (c: Omit<ColumnDef, 'label'>, label: string) => {
    const l = uniqueLabel(label, taken);
    taken.add(l);
    columns.push({ ...c, label: l });
  };
  add({ key: 'sample:name', type: 'categorical', kind: 'sample' }, 'Sample');
  add({ key: 'sample:well', type: 'categorical', kind: 'sample' }, 'Well');
  for (const v of variables) add({ key: `var:${v.id}`, type: v.type, kind: 'variable' }, variableLabel(v));
  if (group) {
    const popNames = new Map<string, number>();
    for (const p of Object.values(group.template.populations))
      popNames.set(p.name, (popNames.get(p.name) ?? 0) + 1);
    const popLabel = (id: string) => {
      const p = group.template.populations[id]!;
      return (popNames.get(p.name) ?? 0) > 1 ? populationPath(group.template, id) : p.name;
    };
    for (const c of statCols)
      add({ key: c.key, type: 'numeric', kind: 'stat', pop: c.pop }, `${popLabel(c.pop)} | ${c.label}`);
  }
  const tableRows = rows.map((r) => {
    const s = samples[r.sid];
    const values: Record<string, Cell> = {
      'sample:name': names[r.sid] ?? s?.fileName ?? r.sid,
      'sample:well': s?.well,
    };
    for (const v of variables) values[`var:${v.id}`] = s?.meta[v.id];
    if (r.table) for (const c of statCols) values[c.key] = r.table.values.get(c.key);
    return { id: r.sid, values };
  });
  return { columns, rows: tableRows };
}
