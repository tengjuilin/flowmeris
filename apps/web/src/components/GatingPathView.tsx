import type { Gate, Group, PlotSpec, Population, Workspace } from '@flowmeris/model';
import { childPopulations, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useEffect, useMemo, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { DEFAULT_STYLE } from '../lib/defaults.ts';
import { gateMatchesAxes } from '../lib/geometry.ts';
import { contextFor, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { drill } from './PlotPanel.tsx';

type Counts = Record<string, { count: number; parent: number }>;

const byName = (a: Population, b: Population) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * The plot of `popId` on which `gate` (a child gate) is drawn: the population's own plot when its axes
 * match the gate, otherwise a read-only plot built from the gate's channels and the group's axis defaults.
 * Returns `real: false` for the latter so clicking it does not pretend to open a saved plot.
 */
function plotForGate(g: Group, popId: string, gate: Gate): { plot: PlotSpec; real: boolean } | null {
  const own = g.plots.filter((p) => p.population === popId);
  const match = own.find((p) => gateMatchesAxes(gate, p.x, p.kind === 'histogram' ? undefined : p.y));
  if (match) return { plot: match, real: true };
  const axes = gate.dims.map((d) => {
    const def = g.axisDefaults[d.channel];
    const tr = def?.transform ?? d.transform;
    return tr ? { channel: d.channel, comp: d.comp, transform: tr, range: def?.range ?? [0, 1] } : null;
  });
  if (axes.some((a) => !a)) return own[0] ? { plot: own[0], real: true } : null;
  const is1d = axes.length === 1;
  const base = own.find((p) => (p.kind === 'histogram') === is1d);
  const plot: PlotSpec = {
    id: `path_${popId}_${gate.id}`,
    population: popId,
    kind: is1d ? 'histogram' : base?.kind && base.kind !== 'histogram' ? base.kind : 'pseudocolor',
    x: axes[0]!,
    style: base?.style ?? DEFAULT_STYLE,
  };
  if (!is1d) plot.y = axes[1]!;
  return { plot, real: false };
}

/** The distinct plots needed to show every child gate of `popId`, each with the gates it shows. */
function plotsForChildren(g: Group, popId: string): { plot: PlotSpec; real: boolean; gateIds: string[] }[] {
  const gateIds = [...new Set(childPopulations(g.template, popId).flatMap((p) => (p.gate ? [p.gate] : [])))];
  const out: { plot: PlotSpec; real: boolean; gateIds: string[] }[] = [];
  for (const id of gateIds) {
    const gate = g.template.gates[id];
    const r = gate && plotForGate(g, popId, gate);
    if (!r) continue;
    const same = out.find((o) => o.plot.id === r.plot.id);
    if (same) same.gateIds.push(id);
    else out.push({ ...r, gateIds: [id] });
  }
  return out;
}

function pct(c: Counts, id: string): string {
  const x = c[id];
  return x && x.parent > 0 ? `${((100 * x.count) / x.parent).toFixed(2)}%` : '…';
}

function openInPlot(popId: string, plot: PlotSpec | null, real: boolean) {
  if (plot && real) useStore.getState().setUi({ popId, plotId: plot.id, selectedGateId: null, view: 'plot' });
  else {
    drill(popId);
    useStore.getState().setUi({ view: 'plot' });
  }
}

interface CardProps {
  ws: Workspace;
  group: Group;
  sampleId: string;
  pop: Population;
  plot: PlotSpec;
  real: boolean;
  size: number;
  counts: Counts;
  focusPopId?: string;
  backgate?: { popId: string; color: string };
}

function StepCard({ ws, group, sampleId, pop, plot, real, size, counts, focusPopId, backgate }: CardProps) {
  const c = counts[pop.id];
  return (
    <div className="path-card">
      <button
        type="button"
        className="tile-title"
        title={`Open ${pop.name} in the Plot view`}
        onClick={() => openInPlot(pop.id, plot, real)}
      >
        <span>
          <span className="swatch" style={{ background: pop.color }} aria-hidden="true" /> {pop.name}
        </span>
        <span className="muted num">
          {c ? c.count.toLocaleString() : ''}
          {pop.parent && c ? ` · ${pct(counts, pop.id)}` : ''}
        </span>
      </button>
      <PlotCanvas
        ws={ws}
        group={group}
        sampleId={sampleId}
        plot={plot}
        width={size}
        height={size}
        {...(focusPopId ? { focusPopId } : {})}
        {...(backgate ? { backgate } : {})}
      />
    </div>
  );
}

function PopChip({ pop, counts, on }: { pop: Population; counts: Counts; on: boolean }) {
  const c = counts[pop.id];
  return (
    <button
      type="button"
      className={`path-chip${on ? ' on' : ''}`}
      title={`Open ${pop.name} in the Plot view`}
      onClick={() => openInPlot(pop.id, null, false)}
    >
      <span className="swatch" style={{ background: pop.color }} aria-hidden="true" />
      <strong>{pop.name}</strong>
      <span className="num">{c ? c.count.toLocaleString() : ''}</span>
      {pop.parent && <span className="num muted">{pct(counts, pop.id)}</span>}
    </button>
  );
}

export function GatingPathView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  const [mode, setMode] = useState<'path' | 'tree'>('path');
  const [backgating, setBackgating] = useState(false);
  const [size, setSize] = useState(280);
  const [counts, setCounts] = useState<Counts>({});

  const sampleId =
    group && ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group?.sampleIds[0];
  const pops = useMemo(() => (group ? populationsDepthFirst(group.template) : []), [group]);
  const target = group?.template.populations[ui.popId] ? ui.popId : 'root';
  const lineage = useMemo(() => (group ? populationLineage(group.template, target) : []), [group, target]);
  const onPath = useMemo(() => new Set(lineage.map((p) => p.id)), [lineage]);
  const targetPop = lineage[lineage.length - 1];
  const backgate =
    backgating && targetPop && targetPop.parent ? { popId: targetPop.id, color: targetPop.color } : undefined;

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

  if (!group) return <div className="empty">Select a group.</div>;
  if (!sampleId) return <div className="empty">This group has no samples.</div>;

  /** Ancestor-of-target populations show the gate leading towards the target and the backgating overlay. */
  const nextOnPath = (popId: string) => {
    const i = lineage.findIndex((p) => p.id === popId);
    return i >= 0 && i < lineage.length - 1 ? lineage[i + 1]!.id : undefined;
  };
  const card = (pop: Population, plot: PlotSpec, real: boolean, keyId: string) => {
    const focus = nextOnPath(pop.id);
    return (
      <StepCard
        key={keyId}
        ws={ws}
        group={group}
        sampleId={sampleId}
        pop={pop}
        plot={plot}
        real={real}
        size={size}
        counts={counts}
        {...(focus ? { focusPopId: focus } : {})}
        {...(focus && backgate ? { backgate } : {})}
      />
    );
  };

  // --- path: one plot per ancestor, showing the gate that leads to the next step -------------
  const pathSteps = lineage.slice(0, -1).map((pop, i) => {
    const next = lineage[i + 1]!;
    const gate = group.template.gates[next.gate!]!;
    return { pop, next, r: plotForGate(group, pop.id, gate) };
  });
  const finalPlots = targetPop ? plotsForChildren(group, targetPop.id) : [];

  const renderPath = () => (
    <div className="path-row">
      {pathSteps.map(({ pop, next, r }) => (
        <div className="path-step" key={pop.id}>
          {r ? (
            card(pop, r.plot, r.real, pop.id)
          ) : (
            <div className="path-card path-missing">
              <PopChip pop={pop} counts={counts} on={false} />
              <span className="muted small">No plot shows the gate for {next.name}.</span>
            </div>
          )}
          <div className="path-arrow" aria-hidden="true">
            <span className="path-arrow-label">
              <span className="swatch" style={{ background: next.color }} /> {next.name}
              <br />
              <span className="num">{counts[next.id] ? counts[next.id]!.count.toLocaleString() : ''}</span>{' '}
              <span className="num muted">{pct(counts, next.id)}</span>
            </span>
            <span className="path-arrow-head">→</span>
          </div>
        </div>
      ))}
      {targetPop && (
        <div className="path-step">
          {finalPlots.length > 0 ? (
            finalPlots.map((f) => card(targetPop, f.plot, f.real, f.plot.id))
          ) : (
            <div className="path-card path-end">
              <PopChip pop={targetPop} counts={counts} on />
              <span className="muted small">
                {counts[targetPop.id] && counts.root
                  ? `${((100 * counts[targetPop.id]!.count) / Math.max(1, counts.root.count)).toFixed(2)}% of all events`
                  : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // --- tree: every population with child gates as a node, leaves as chips ---------------------
  const node = (pop: Population): JSX.Element => {
    const kids = childPopulations(group.template, pop.id).sort(byName);
    if (kids.length === 0)
      return (
        <li key={pop.id}>
          <PopChip pop={pop} counts={counts} on={pop.id === target} />
        </li>
      );
    const plots = plotsForChildren(group, pop.id);
    return (
      <li key={pop.id}>
        <div className={`path-node${pop.id === target ? ' on' : ''}`}>
          <div className="path-node-plots">{plots.map((f) => card(pop, f.plot, f.real, f.plot.id))}</div>
        </div>
        <ul>{kids.map(node)}</ul>
      </li>
    );
  };

  return (
    <div className="path-view">
      <div className="toolbar">
        <label className="field">
          Sample
          <select value={sampleId} onChange={(e) => setUi({ sampleId: e.target.value })}>
            {group.sampleIds.map((id) => (
              <option key={id} value={id}>
                {names[id] ?? ws.samples[id]?.fileName ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Population
          <select
            value={target}
            onChange={(e) => setUi({ popId: e.target.value, plotId: null, selectedGateId: null })}
          >
            {pops.map((p) => (
              <option key={p.id} value={p.id}>
                {'  '.repeat(populationLineage(group.template, p.id).length - 1)}
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" title="Layout">
          <button
            type="button"
            className={mode === 'path' ? 'on' : ''}
            aria-pressed={mode === 'path'}
            onClick={() => setMode('path')}
            title="Plots from All events to the selected population"
          >
            Path
          </button>
          <button
            type="button"
            className={mode === 'tree' ? 'on' : ''}
            aria-pressed={mode === 'tree'}
            onClick={() => setMode('tree')}
            title="Every plot in the gating tree"
          >
            Tree
          </button>
        </div>
        <label
          className="field check"
          title="Overlay the selected population's events, in its colour, on every plot above it"
        >
          <input
            type="checkbox"
            checked={backgating}
            disabled={!targetPop?.parent}
            onChange={(e) => setBackgating(e.target.checked)}
          />
          Backgating
        </label>
        <div className="spacer" />
        <label className="field">
          Plot size
          <input
            type="range"
            min={180}
            max={480}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="muted small">
        {mode === 'path'
          ? 'Each plot shows the gate that leads to the next step (highlighted); arrows give the count and % of parent.'
          : 'Every gated population; gates on the way to the selected population are highlighted.'}{' '}
        {backgate && `${targetPop?.name} is overlaid in its colour on the plots above it. `}
        Click a plot title to open it in the Plot view.
      </p>
      {ui.missing[sampleId] && (
        <div className="empty">Data not loaded for this sample: re-add its FCS file to view it.</div>
      )}
      {!ui.missing[sampleId] &&
        (mode === 'path' ? (
          lineage.length <= 1 && finalPlots.length === 0 ? (
            <div className="empty">
              No gates yet. Draw a gate in the Plot view, then choose its population here.
            </div>
          ) : (
            renderPath()
          )
        ) : (
          <div className="path-tree">
            <ul>{group.template.populations.root && node(group.template.populations.root)}</ul>
          </div>
        ))}
    </div>
  );
}
