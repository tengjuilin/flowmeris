import type { PopulationCount, StatResult } from '@flowmeris/engine';
import { type StatCell, exportGatingML, statLabel, tidyRows, toCsv, wideRows } from '@flowmeris/export';
import {
  type CompMatrix,
  type Group,
  type Population,
  type StatKind,
  type StatSpec,
  type Transform,
  newId,
  populationPath,
  populationsDepthFirst,
} from '@flowmeris/model';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { download, safeName } from '../lib/download.ts';
import {
  APP_INFO,
  contextFor,
  toast,
  useGroup,
  useSampleNames,
  useSelectedSampleIds,
  useStore,
} from '../state/store.ts';

const VALUE_STATS: { id: StatKind; label: string }[] = [
  { id: 'median', label: 'Median' },
  { id: 'mean', label: 'Mean' },
  { id: 'geomMean', label: 'Geometric mean (x > 0)' },
  { id: 'sd', label: 'SD' },
  { id: 'cv', label: 'CV (%)' },
  { id: 'rsd', label: 'Robust SD' },
  { id: 'rcv', label: 'Robust CV (%)' },
  { id: 'percentile', label: 'Percentile…' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
];

const FREQUENCY_STATS = new Set(['count', 'pctParent', 'pctGrandparent', 'pctTotal']);

const COUNT_FORMAT = new Intl.NumberFormat();

/** Display formatting only; exports carry full double precision. */
function fmt(v: number | undefined, stat: string): string {
  if (v === undefined) return '';
  if (Number.isNaN(v)) return 'NaN';
  if (stat === 'count') return COUNT_FORMAT.format(v);
  if (stat.startsWith('pct') || stat === 'cv' || stat === 'rcv') return v.toFixed(2);
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e7) ? v.toExponential(4) : String(Number(v.toPrecision(5)));
}

// ---------------------------------------------------------------------------
// Per-sample results
// ---------------------------------------------------------------------------

/** One sample's row: values by column key (`pop|count`, `pop|pctParent`, or a StatSpec id) and export cells. */
interface SampleTable {
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
  ctx: ReturnType<typeof contextFor>,
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

interface Column {
  key: string;
  label: string;
  pop: string;
  stat: string;
  specId?: string;
}

/** One sample's row; re-renders only when its values, columns or flags change. */
const StatsRow = memo(function StatsRow(props: {
  label: string;
  title: string | undefined;
  override: boolean;
  missing: boolean;
  selected: boolean;
  stale: boolean;
  columns: Column[];
  values: Map<string, number> | undefined;
}) {
  const { columns, values } = props;
  const cls = [props.selected ? 'on' : '', props.stale ? 'stale' : ''].filter(Boolean).join(' ');
  return (
    <tr className={cls || undefined}>
      <th scope="row" title={props.title}>
        {props.label}
        {props.override && <span className="badge warn">override</span>}
        {props.missing && <span className="badge danger">missing</span>}
      </th>
      {columns.map((c) => (
        <td key={c.key}>{fmt(values?.get(c.key), c.stat)}</td>
      ))}
    </tr>
  );
});

export function StatsView() {
  const samples = useStore((s) => s.ws.samples);
  const transforms = useStore((s) => s.ws.transforms);
  const compMatrices = useStore((s) => s.ws.compMatrices);
  const popId = useStore((s) => s.ui.popId);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const missing = useStore((s) => s.ui.missing);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  const shown = useSelectedSampleIds(group);
  const names = useSampleNames(group);
  const [, setTick] = useState(0);
  const [form, setForm] = useState<{ pop: string; stat: StatKind; channel: string; p: number }>({
    pop: popId,
    stat: 'median',
    channel: '',
    p: 50,
  });

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

  // Last row shown per sample: kept (dimmed) while its recomputation is pending, so edits don't blank the table.
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
    const out: Column[] = [];
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

  const span = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columns) m.set(c.pop, (m.get(c.pop) ?? 0) + 1);
    return m;
  }, [columns]);

  const overridden = useMemo(() => new Set(group?.overrides.map((o) => o.sampleId)), [group]);

  if (!group) return <div className="empty">Select a group.</div>;

  let busy = 0;
  const rows = shown.map((sid) => {
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

  const addStat = () => {
    if (!form.channel) {
      toast('Choose a channel for this statistic.');
      return;
    }
    const spec: StatSpec = {
      id: newId('st_'),
      population: form.pop,
      stat: form.stat,
      channel: form.channel,
      space: 'linear',
      ...(form.stat === 'percentile' ? { p: form.p } : {}),
    };
    mutate('Add statistic', (w) => void w.groups.find((x) => x.id === group.id)!.stats.push(spec));
  };

  const exportStats = (kind: 'tidy' | 'wide') => {
    const ws = useStore.getState().ws;
    // Only the samples checked in the sidebar (cells are computed for those alone).
    const g = { ...group, sampleIds: shown };
    const cells = rows.flatMap((r) => (r.stale ? [] : r.table!.cells));
    const out = kind === 'tidy' ? tidyRows(ws, g, cells, APP_INFO.version) : wideRows(ws, g, cells);
    download(`${safeName(`${group.name}_statistics_${kind}`)}.csv`, toCsv(out), 'text/csv');
  };

  const exportGml = () => {
    const ws = useStore.getState().ws;
    download(
      `${safeName(group.name)}_template.gating-ml.xml`,
      exportGatingML(ws, group, { appVersion: APP_INFO.version }),
      'application/xml',
    );
    const withOv = [...new Set(group.overrides.map((o) => o.sampleId))];
    for (const sid of withOv)
      download(
        `${safeName(`${group.name}_${ws.samples[sid]?.fileName ?? sid}`)}_effective.gating-ml.xml`,
        exportGatingML(ws, group, { appVersion: APP_INFO.version, sampleId: sid }),
        'application/xml',
      );
  };

  const exportEvents = async (format: 'fcs' | 'csv', mode: 'raw' | 'compensated') => {
    const ws = useStore.getState().ws;
    const sid = selectedSample ?? group.sampleIds[0];
    if (!sid) return;
    const s = ws.samples[sid]!;
    const path = populationPath(group.template, popId);
    const bytes = await pool.exportEvents(contextFor(ws, group), sid, popId, mode, format, {
      FLOWMERIS_VERSION: `${APP_INFO.version} (${APP_INFO.commit})`,
      FLOWMERIS_SRC_SHA256: s.sha256,
      FLOWMERIS_SRC_FILE: s.fileName,
      FLOWMERIS_POPULATION: path,
      FLOWMERIS_VALUES: mode === 'raw' ? 'linearised, uncompensated' : 'linearised, compensated',
    });
    download(
      `${safeName(`${s.fileName.replace(/\.(fcs|lmd)$/i, '')}_${group.template.populations[popId]?.name ?? 'population'}`)}.${format}`,
      bytes,
    );
  };

  return (
    <div className="stats-view">
      <div className="toolbar">
        <strong>Statistics · {group.name}</strong>
        {shown.length < group.sampleIds.length && (
          <span className="muted">
            {shown.length} of {group.sampleIds.length} samples (sidebar selection)
          </span>
        )}
        {busy > 0 && <span className="muted">computing… {busy} sample(s) left</span>}
        <div className="spacer" />
        <button
          type="button"
          onClick={() => exportStats('tidy')}
          disabled={!complete}
          title="One row per sample × population × statistic, with provenance"
        >
          CSV (tidy)
        </button>
        <button type="button" onClick={() => exportStats('wide')} disabled={!complete}>
          CSV (wide)
        </button>
        <button
          type="button"
          onClick={exportGml}
          title="Gating-ML 2.0 for the group template (+ effective gates of overridden samples)"
        >
          Gating-ML
        </button>
      </div>
      <div className="add-stat">
        <label className="field">
          Population
          <select value={form.pop} onChange={(e) => setForm({ ...form, pop: e.target.value })}>
            {pops.map((p) => (
              <option key={p.id} value={p.id}>
                {populationPath(group.template, p.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Statistic
          <select value={form.stat} onChange={(e) => setForm({ ...form, stat: e.target.value as StatKind })}>
            {VALUE_STATS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {form.stat === 'percentile' && (
          <label className="field">
            p
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              value={form.p}
              onChange={(e) => setForm({ ...form, p: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="field">
          Channel
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="">—</option>
            {group.channels.map((c) => (
              <option key={c} value={c}>
                {c}
                {marker(c) ? ` (${marker(c)})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={addStat}>
          Add statistic
        </button>
        <span className="muted small">
          Values in linear (compensated) units. Definitions: docs → Methods → Statistics.
        </span>
      </div>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th rowSpan={2}>Sample</th>
              {pops.map((p) => (
                <th
                  key={p.id}
                  colSpan={span.get(p.id) ?? 1}
                  className="pop-head"
                  title={populationPath(group.template, p.id)}
                >
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  {c.label}
                  {c.specId && (
                    <button
                      type="button"
                      className="icon"
                      title="Remove statistic"
                      onClick={() =>
                        mutate('Remove statistic', (w) => {
                          const g = w.groups.find((x) => x.id === group.id)!;
                          g.stats = g.stats.filter((s) => s.id !== c.specId);
                        })
                      }
                    >
                      ✕
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sid, table, stale }) => (
              <StatsRow
                key={sid}
                label={names[sid] ?? samples[sid]?.fileName ?? sid}
                title={samples[sid]?.relativePath}
                override={overridden.has(sid)}
                missing={!!missing[sid]}
                selected={selectedSample === sid}
                stale={stale && !!table}
                columns={columns}
                values={table?.values}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <span className="muted">
          Export events of the current population ({group.template.populations[popId]?.name}) for the selected
          sample:
        </span>
        <button
          type="button"
          onClick={() => void exportEvents('fcs', 'raw')}
          title="FCS 3.1 with linearised, uncompensated values; original keywords and $SPILLOVER kept"
        >
          FCS (raw)
        </button>
        <button type="button" onClick={() => void exportEvents('csv', 'compensated')}>
          CSV (compensated)
        </button>
      </div>
    </div>
  );
}
