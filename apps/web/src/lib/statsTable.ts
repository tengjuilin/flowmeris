import type { PopulationCount, StatResult } from '@flowmeris/engine';
import { type StatCell, statLabel } from '@flowmeris/export';
import {
  type CompMatrix,
  type Group,
  type Population,
  type StatSpec,
  type Transform,
  type Variable,
  populationPath,
  populationsDepthFirst,
} from '@flowmeris/model';
import {
  type Cell,
  type ColumnDef,
  type LevelOrder,
  type Table,
  aggregate,
  applyDerived,
  uniqueLabel,
} from '@flowmeris/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { toast, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';

const FREQUENCY_STATS = new Set(['count', 'pctParent', 'pctGrandparent', 'pctTotal']);

// ---------------------------------------------------------------------------
// Per-sample results
// ---------------------------------------------------------------------------

/** One sample's row: values by column key (`pop|count`, `pop|pctParent`, or a StatSpec id) and export cells. */
export interface SampleTable {
  values: Map<string, number>;
  cells: StatCell[];
}

/**
 * Results by per-sample dependency key, kept across renders and view switches
 * so an edit only recomputes the samples it affects, and returning to the
 * view is instant. Bounded; oldest entries go first.
 */
const tableCache = new Map<string, SampleTable>();
const inflight = new Map<string, Promise<SampleTable>>();
const MAX_CACHED_TABLES = 4000;

function remember(key: string, t: SampleTable) {
  tableCache.set(key, t);
  for (const k of tableCache.keys()) {
    if (tableCache.size <= MAX_CACHED_TABLES) break;
    tableCache.delete(k);
  }
}

/**
 * Dependency key of each sample's row: the gating structure and geometry
 * (with the sample's own overrides), compensation, transforms and requested
 * statistics. Population names and colours are left out — they do not change
 * any value. The shared part is serialised once, not once per sample.
 */
function sampleKeys(
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

function toTable(
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

function fetchTable(
  key: string,
  ctx: { group: Group; transforms: Record<string, Transform>; compMatrices: Record<string, CompMatrix> },
  sid: string,
  popIds: string[],
): Promise<SampleTable> {
  let p = inflight.get(key);
  if (!p) {
    const specs = ctx.group.stats;
    p = pool
      .table(ctx, sid, popIds, specs)
      .then(({ counts, stats }) => {
        const t = toTable(sid, counts, stats, specs);
        remember(key, t);
        return t;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
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
 * Per-sample statistics of the group's checked samples, computed in the
 * workers and cached. Rows whose recomputation is pending keep their last
 * values (marked stale), so edits don't blank the table.
 */
export function useSampleStats(group: Group | undefined) {
  const samples = useStore((s) => s.ws.samples);
  const transforms = useStore((s) => s.ws.transforms);
  const compMatrices = useStore((s) => s.ws.compMatrices);
  const missing = useStore((s) => s.ui.missing);
  const shown = useSelectedSampleIds(group);
  const [, setTick] = useState(0);

  const pops = useMemo(() => (group ? populationsDepthFirst(group.template) : []), [group]);
  const keys = useMemo(
    () => (group ? sampleKeys(group, pops, transforms, compMatrices, shown) : new Map<string, string>()),
    [group, pops, transforms, compMatrices, shown],
  );

  // Fetch the rows that are not cached yet; re-render (at most once per frame) as they arrive.
  useEffect(() => {
    if (!group) return;
    let live = true;
    let frame = 0;
    const ctx = { group, transforms, compMatrices };
    const popIds = pops.map((p) => p.id);
    let failed = false;
    for (const [sid, key] of keys) {
      if (missing[sid] || tableCache.has(key)) continue;
      fetchTable(key, ctx, sid, popIds).then(
        () => {
          if (live && !frame)
            frame = requestAnimationFrame(() => {
              frame = 0;
              setTick((t) => t + 1);
            });
        },
        (e) => {
          if (live && !failed) {
            failed = true;
            toast(`Statistics failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        },
      );
    }
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [keys, missing]);

  const lastShown = useRef<{ groupId: string; rows: Map<string, SampleTable> }>({
    groupId: '',
    rows: new Map(),
  });
  if (group && lastShown.current.groupId !== group.id)
    lastShown.current = { groupId: group.id, rows: new Map() };

  const marker = useMemo(() => {
    const sample0 = group ? samples[group.sampleIds[0] ?? ''] : undefined;
    const pns = new Map(sample0?.channels.map((c) => [c.pnn, c.pns]) ?? []);
    return (c?: string) => (c ? pns.get(c) : undefined);
  }, [group, samples]);

  const columns = useMemo(() => {
    const out: StatColumn[] = [];
    if (!group) return out;
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
  }, [group, pops, marker]);

  let busy = 0;
  const rows: SampleRow[] = shown.map((sid) => {
    const fresh = tableCache.get(keys.get(sid) ?? '');
    if (fresh) lastShown.current.rows.set(sid, fresh);
    else if (!missing[sid]) busy++;
    return {
      sid,
      table: missing[sid] ? undefined : (fresh ?? lastShown.current.rows.get(sid)),
      stale: !fresh,
    };
  });
  const complete = busy === 0 && rows.some((r) => r.table);
  return { pops, columns, rows, busy, complete, marker, shown };
}

// ---------------------------------------------------------------------------
// The analysis table: sample variables + statistics → derived → aggregated
// ---------------------------------------------------------------------------

const serials = new WeakMap<SampleTable, number>();
let nextSerial = 1;
function tableSerial(t: SampleTable | undefined): number {
  if (!t) return 0;
  let n = serials.get(t);
  if (n === undefined) serials.set(t, (n = nextSerial++));
  return n;
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
 * The statistics table of a group: one row per checked sample with sample
 * variables and statistics, then the group's derived columns, then (when
 * enabled) aggregation over replicates.
 */
export function useAnalysisTable(group: Group | undefined) {
  const stats = useSampleStats(group);
  const samples = useStore((s) => s.ws.samples);
  const variables = useStore((s) => s.ws.variables);
  const names = useSampleNames(group);
  const { columns: statCols, rows } = stats;

  // `rows` is a new array every render; rebuild only when the tables shown change.
  const rowsKey = rows.map((r) => `${r.sid}:${tableSerial(r.table)}`).join(',');
  const base = useMemo((): Table => {
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
    // `rows` itself is left out: rowsKey stands for its content.
  }, [group, statCols, rowsKey, samples, variables, names]);

  const levels = useMemo(() => levelOrder(variables), [variables]);
  const derived = useMemo(
    () => applyDerived(base, group?.analysis.derived ?? []),
    [base, group?.analysis.derived],
  );
  const agg = group?.analysis.aggregate;
  const aggregated = useMemo(
    () =>
      agg?.enabled
        ? aggregate(
            derived.table,
            agg.by.map((v) => `var:${v}`),
            agg.funcs,
            levels,
          )
        : undefined,
    [derived, agg, levels],
  );
  return { stats, base, perSample: derived.table, errors: derived.errors, aggregated, levels };
}
