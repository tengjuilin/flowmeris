import {
  type CompMatrix,
  type Group,
  type Population,
  type Transform,
  populationsDepthFirst,
} from '@flowmeris/model';
import { type LevelOrder, type Table, aggregate, applyDerived } from '@flowmeris/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getPool } from '../../engine-client/pool.ts';
import { LastResult } from '../../lib/lastResult.ts';
import { displayNames } from '../../lib/names.ts';
import {
  type SampleRow,
  type SampleTable,
  type StatColumn,
  baseTable,
  levelOrder,
  sampleKeys,
  statColumns,
  toTable,
} from '../../lib/statsTable.ts';
import { toast, useStore } from '../store.ts';

// ---------------------------------------------------------------------------
// Per-sample results
// ---------------------------------------------------------------------------

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

function fetchTable(
  key: string,
  ctx: { group: Group; transforms: Record<string, Transform>; compMatrices: Record<string, CompMatrix> },
  sid: string,
  popIds: string[],
): Promise<SampleTable> {
  let p = inflight.get(key);
  if (!p) {
    const specs = ctx.group.stats;
    p = getPool()
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

// Each step's last result, shared by every caller with the same inputs: the Statistics and Charts views
// and their settings panels compute the table once per change. The steps depend on the group's fields
// they read, not on the group, so an edit elsewhere in the group (a chart's style) recomputes nothing.
const lastShownIds = new LastResult<string[]>();
const lastPops = new LastResult<Population[]>();
const lastKeys = new LastResult<Map<string, string>>();
const lastMarker = new LastResult<(c?: string) => string | undefined>();
const lastColumns = new LastResult<StatColumn[]>();
const lastNames = new LastResult<Record<string, string>>();
const lastBase = new LastResult<Table>();
const lastLevels = new LastResult<LevelOrder>();
const lastDerived = new LastResult<ReturnType<typeof applyDerived>>();
const lastAggregated = new LastResult<Table | undefined>();

/**
 * Per-sample statistics of the group's checked samples, computed in the
 * workers and cached. Rows whose recomputation is pending keep their last
 * values (marked stale), so edits don't blank the table.
 */
export function useSampleStats(group: Group | undefined) {
  const samples = useStore((s) => s.ws.samples);
  const transforms = useStore((s) => s.ws.transforms);
  const compMatrices = useStore((s) => s.ws.compMatrices);
  const missing = useStore((s) => s.status.missing);
  const excluded = useStore((s) => s.ui.excluded);
  const [, setTick] = useState(0);

  const sampleIds = group?.sampleIds;
  const template = group?.template;
  // The group's checked samples (as `useSelectedSampleIds`).
  const shown = useMemo(
    () => lastShownIds.get([sampleIds, excluded], () => sampleIds?.filter((id) => !excluded[id]) ?? []),
    [sampleIds, excluded],
  );
  const pops = useMemo(
    () => lastPops.get([template], () => (template ? populationsDepthFirst(template) : [])),
    [template],
  );
  // Everything `sampleKeys` reads.
  const keyDeps = [
    pops,
    template?.gates,
    group?.compensation,
    group?.stats,
    group?.overrides,
    transforms,
    compMatrices,
    shown,
  ];
  const keys = useMemo(
    () =>
      lastKeys.get(keyDeps, () =>
        group ? sampleKeys(group, pops, transforms, compMatrices, shown) : new Map<string, string>(),
      ),
    keyDeps,
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

  const sample0 = sampleIds?.[0];
  const marker = useMemo(
    () =>
      lastMarker.get([sample0, samples], () => {
        const s0 = samples[sample0 ?? ''];
        const pns = new Map(s0?.channels.map((c) => [c.pnn, c.pns]) ?? []);
        return (c?: string) => (c ? pns.get(c) : undefined);
      }),
    [sample0, samples],
  );

  const stats = group?.stats;
  const columns = useMemo(
    () => lastColumns.get([stats, pops, marker], () => (group ? statColumns(group, pops, marker) : [])),
    [stats, pops, marker],
  );

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

/**
 * The statistics table of a group: one row per checked sample with sample
 * variables and statistics, then the group's derived columns, then (when
 * enabled) aggregation over replicates.
 */
export function useAnalysisTable(group: Group | undefined) {
  const stats = useSampleStats(group);
  const samples = useStore((s) => s.ws.samples);
  const variables = useStore((s) => s.ws.variables);
  const sampleIds = group?.sampleIds;
  // The samples' short names (as `useSampleNames`).
  const names = useMemo(
    () =>
      lastNames.get([sampleIds, samples], () =>
        sampleIds ? displayNames(sampleIds.flatMap((id) => (samples[id] ? [samples[id]] : []))) : {},
      ),
    [sampleIds, samples],
  );
  const { columns: statCols, rows } = stats;

  // `rows` is a new array every render; rebuild only when the tables shown change.
  const rowsKey = rows.map((r) => `${r.sid}:${tableSerial(r.table)}`).join(',');
  // `baseTable` reads only the group's populations.
  const template = group?.template;
  const baseDeps = [template, statCols, rowsKey, samples, variables, names];
  const base = useMemo(
    // `rows` itself is left out: rowsKey stands for its content.
    () => lastBase.get(baseDeps, () => baseTable(group, statCols, rows, samples, variables, names)),
    baseDeps,
  );

  const levels = useMemo(() => lastLevels.get([variables], () => levelOrder(variables)), [variables]);
  const derivedSpecs = group?.analysis.derived;
  const derived = useMemo(
    () => lastDerived.get([base, derivedSpecs], () => applyDerived(base, derivedSpecs ?? [])),
    [base, derivedSpecs],
  );
  const agg = group?.analysis.aggregate;
  const aggregated = useMemo(
    () =>
      lastAggregated.get([derived, agg, levels], () =>
        agg?.enabled
          ? aggregate(
              derived.table,
              agg.by.map((v) => `var:${v}`),
              agg.funcs,
              levels,
            )
          : undefined,
      ),
    [derived, agg, levels],
  );
  return { stats, base, perSample: derived.table, errors: derived.errors, aggregated, levels };
}
