import { type Population, childPopulations, isOverridden } from '@flowmeris/model';
import { useEffect, useMemo, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { deleteGate, lineageKey, renamePopulation } from '../lib/analysis.ts';
import { contextFor, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { drill } from './PlotPanel.tsx';

export function PopulationTree() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup();
  const names = useSampleNames(group);
  const [counts, setCounts] = useState<Record<string, { count: number; parent: number }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const sampleId =
    group && ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group?.sampleIds[0];

  const pops = useMemo(() => (group ? Object.values(group.template.populations) : []), [group]);
  const key = useMemo(
    () => (group && sampleId ? JSON.stringify(pops.map((p) => lineageKey(ws, group, sampleId, p.id))) : ''),
    [pops, ws, group, sampleId],
  );
  useEffect(() => {
    if (!group || !sampleId || ui.missing[sampleId]) return;
    let live = true;
    pool
      .counts(
        contextFor(ws, group),
        sampleId,
        pops.map((p) => p.id),
      )
      .then(
        (cs) =>
          live &&
          setCounts(Object.fromEntries(cs.map((c) => [c.popId, { count: c.count, parent: c.parentCount }]))),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, sampleId]);

  if (!group) return null;

  const row = (p: Population, depth: number): JSX.Element => {
    const c = counts[p.id];
    const overridden = p.gate && sampleId ? isOverridden(group, p.gate, sampleId) : false;
    const kids = childPopulations(group.template, p.id).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    return (
      <li key={p.id}>
        <div className={`pop-row${ui.popId === p.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
          <span className="swatch" style={{ background: p.color }} aria-hidden="true" />
          {editing === p.id ? (
            <input
              autoFocus
              defaultValue={p.name}
              aria-label="Population name"
              onBlur={(e) => {
                if (e.target.value.trim()) renamePopulation(group.id, p.id, e.target.value.trim());
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="pop-name"
              onClick={() => drill(p.id)}
              onDoubleClick={() => p.gate && setEditing(p.id)}
              title={p.gate ? 'Click to open; double-click to rename' : 'All events'}
            >
              {p.name}
            </button>
          )}
          {/* Fixed-width slots keep the count columns aligned across rows (root has no badge or delete). */}
          <span className="pop-flag">
            {overridden && (
              <span className="badge warn" title="Gate geometry overridden for this sample">
                ov
              </span>
            )}
          </span>
          <span className="num" title="Events">
            {c ? c.count.toLocaleString() : ''}
          </span>
          <span className="num pct" title="% of parent">
            {c && p.parent && c.parent > 0 ? `${((100 * c.count) / c.parent).toFixed(2)}%` : ''}
          </span>
          <span className="pop-del">
            {p.gate && (
              <button
                type="button"
                className="icon"
                title={`Delete gate${group.template.gates[p.gate]?.geometry.kind === 'quadrant' || group.template.gates[p.gate]?.geometry.kind === 'spider' ? ' (all four regions)' : ''} and its subpopulations`}
                onClick={() => {
                  deleteGate(group.id, p.gate!);
                  if (ui.popId === p.id) drill('root');
                }}
              >
                ✕
              </button>
            )}
          </span>
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  };
  const root = group.template.populations.root;
  return (
    <div className="pop-tree">
      <div className="pane-title">
        Populations{' '}
        <span className="muted small">
          {sampleId ? (names[sampleId] ?? ws.samples[sampleId]?.fileName) : ''}
        </span>
      </div>
      <ul>{root && row(root, 0)}</ul>
    </div>
  );
}
