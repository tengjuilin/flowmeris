import { type StatCell, exportGatingML, statLabel, tidyRows, toCsv, wideRows } from '@flowmeris/export';
import { type StatKind, type StatSpec, newId, populationPath, populationsDepthFirst } from '@flowmeris/model';
import { useEffect, useMemo, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { download, safeName } from '../lib/download.ts';
import { APP_INFO, contextFor, toast, useGroup, useStore } from '../state/store.ts';

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

/** Display formatting only; exports carry full double precision. */
function fmt(v: number | undefined, stat: string): string {
  if (v === undefined) return '';
  if (Number.isNaN(v)) return 'NaN';
  if (stat === 'count') return v.toLocaleString();
  if (stat.startsWith('pct') || stat === 'cv' || stat === 'rcv') return v.toFixed(2);
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e7) ? v.toExponential(4) : String(Number(v.toPrecision(5)));
}

export function StatsView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  const [cells, setCells] = useState<StatCell[]>([]);
  const [busy, setBusy] = useState(0);
  const [form, setForm] = useState<{ pop: string; stat: StatKind; channel: string; p: number }>({
    pop: ui.popId,
    stat: 'median',
    channel: '',
    p: 50,
  });

  const pops = useMemo(() => (group ? populationsDepthFirst(group.template) : []), [group]);
  const key = useMemo(
    () =>
      group
        ? JSON.stringify([
            group.sampleIds.map((s) => pops.map((p) => lineageKey(ws, group, s, p.id))),
            group.stats,
            Object.keys(ui.missing),
          ])
        : '',
    [group, pops, ws, ui.missing],
  );

  useEffect(() => {
    if (!group) return;
    let live = true;
    const ctx = contextFor(ws, group);
    const popIds = pops.map((p) => p.id);
    const out: StatCell[] = [];
    const todo = group.sampleIds.filter((s) => !ui.missing[s]);
    setBusy(todo.length);
    setCells([]);
    Promise.all(
      todo.map(async (sid) => {
        const counts = await pool.counts(ctx, sid, popIds);
        for (const c of counts) {
          out.push({
            sampleId: sid,
            population: c.popId,
            statistic: 'count',
            space: 'n/a',
            value: c.count,
            n: c.count,
            nExcluded: 0,
          });
          if (c.popId !== 'root')
            out.push({
              sampleId: sid,
              population: c.popId,
              statistic: 'pctParent',
              space: 'n/a',
              value: c.parentCount > 0 ? (100 * c.count) / c.parentCount : Number.NaN,
              n: c.count,
              nExcluded: 0,
            });
        }
        if (group.stats.length) {
          const res = await pool.stats(ctx, sid, group.stats);
          for (const r of res) {
            const spec = group.stats.find((s) => s.id === r.statId)!;
            out.push({
              sampleId: sid,
              population: spec.population,
              statistic: spec.stat,
              ...(spec.channel ? { channel: spec.channel } : {}),
              space: ['count', 'pctParent', 'pctGrandparent', 'pctTotal'].includes(spec.stat)
                ? 'n/a'
                : spec.space,
              ...(spec.transform ? { transform: spec.transform } : {}),
              ...(spec.p !== undefined ? { p: spec.p } : {}),
              value: r.value,
              n: r.n,
              nExcluded: r.nExcluded,
            });
          }
        }
        if (live) setBusy((b) => b - 1);
      }),
    )
      .then(() => live && setCells([...out]))
      .catch((e) => toast(`Statistics failed: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, [key]);

  if (!group) return <div className="empty">Select a group.</div>;
  const sample0 = ws.samples[group.sampleIds[0] ?? ''];
  const marker = (c?: string) => (c ? sample0?.channels.find((x) => x.pnn === c)?.pns : undefined);

  const columns: {
    key: string;
    label: string;
    pop: string;
    stat: string;
    channel?: string;
    p?: number;
    specId?: string;
  }[] = [];
  for (const p of pops) {
    columns.push({ key: `${p.id}|count`, label: 'Count', pop: p.id, stat: 'count' });
    if (p.id !== 'root')
      columns.push({ key: `${p.id}|pctParent`, label: '% Parent', pop: p.id, stat: 'pctParent' });
    for (const s of group.stats.filter((x) => x.population === p.id))
      columns.push({
        key: s.id,
        label: statLabel(s, marker(s.channel)),
        pop: p.id,
        stat: s.stat,
        ...(s.channel ? { channel: s.channel } : {}),
        ...(s.p !== undefined ? { p: s.p } : {}),
        specId: s.id,
      });
  }
  const lookup = new Map<string, number>();
  for (const c of cells) {
    const spec = group.stats.find(
      (s) =>
        s.population === c.population &&
        s.stat === c.statistic &&
        (s.channel ?? '') === (c.channel ?? '') &&
        (s.p ?? null) === (c.p ?? null),
    );
    const k =
      c.statistic === 'count' || c.statistic === 'pctParent'
        ? `${c.population}|${c.statistic}`
        : (spec?.id ?? '');
    if (k) lookup.set(`${c.sampleId}|${k}`, c.value);
  }

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
    const rows = kind === 'tidy' ? tidyRows(ws, group, cells, APP_INFO.version) : wideRows(ws, group, cells);
    download(`${safeName(`${group.name}_statistics_${kind}`)}.csv`, toCsv(rows), 'text/csv');
  };

  const exportGml = () => {
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
    const sid = ui.sampleId ?? group.sampleIds[0];
    if (!sid) return;
    const s = ws.samples[sid]!;
    const path = populationPath(group.template, ui.popId);
    const bytes = await pool.exportEvents(contextFor(ws, group), sid, ui.popId, mode, format, {
      FLOWMERIS_VERSION: `${APP_INFO.version} (${APP_INFO.commit})`,
      FLOWMERIS_SRC_SHA256: s.sha256,
      FLOWMERIS_SRC_FILE: s.fileName,
      FLOWMERIS_POPULATION: path,
      FLOWMERIS_VALUES: mode === 'raw' ? 'linearised, uncompensated' : 'linearised, compensated',
    });
    download(
      `${safeName(`${s.fileName.replace(/\.(fcs|lmd)$/i, '')}_${group.template.populations[ui.popId]?.name ?? 'population'}`)}.${format}`,
      bytes,
    );
  };

  return (
    <div className="stats-view">
      <div className="toolbar">
        <strong>Statistics · {group.name}</strong>
        {busy > 0 && <span className="muted">computing… {busy} sample(s) left</span>}
        <div className="spacer" />
        <button
          type="button"
          onClick={() => exportStats('tidy')}
          disabled={cells.length === 0}
          title="One row per sample × population × statistic, with provenance"
        >
          CSV (tidy)
        </button>
        <button type="button" onClick={() => exportStats('wide')} disabled={cells.length === 0}>
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
              {pops.map((p) => {
                const n = columns.filter((c) => c.pop === p.id).length;
                return (
                  <th
                    key={p.id}
                    colSpan={n}
                    className="pop-head"
                    title={populationPath(group.template, p.id)}
                  >
                    <span className="swatch" style={{ background: p.color }} /> {p.name}
                  </th>
                );
              })}
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
            {group.sampleIds.map((sid) => {
              const s = ws.samples[sid];
              const ov = group.overrides.some((o) => o.sampleId === sid);
              return (
                <tr key={sid} className={ui.sampleId === sid ? 'on' : ''}>
                  <th scope="row">
                    {s?.fileName}
                    {ov && <span className="badge warn">override</span>}
                    {ui.missing[sid] && <span className="badge danger">missing</span>}
                  </th>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {fmt(lookup.get(`${sid}|${c.specId ?? `${c.pop}|${c.stat}`}`), c.stat)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <span className="muted">
          Export events of the current population ({group.template.populations[ui.popId]?.name}) for the
          selected sample:
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
