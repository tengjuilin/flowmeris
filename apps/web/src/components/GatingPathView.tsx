import type { Gate, Group, PlotSpec, Population, Workspace } from '@flowmeris/model';
import { newId, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import {
  Component,
  type ReactNode,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { pool } from '../engine-client/pool.ts';
import { lineageKey } from '../lib/analysis.ts';
import { DEFAULT_STYLE } from '../lib/defaults.ts';
import { newPlotStyle } from '../lib/figure.ts';
import { gateMatchesAxes } from '../lib/geometry.ts';
import { contextFor, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { drill } from './PlotPanel.tsx';

type Count = { count: number; parent: number };
type Counts = Record<string, Count>;
type PlotChoice = { plot: PlotSpec; real: boolean; gateIds: string[] };

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

/** The distinct plots needed to show every child gate of `popId` (children `kids`), each with the gates it shows. */
function plotsForChildren(g: Group, popId: string, kids: Population[]): PlotChoice[] {
  const gateIds = [...new Set(kids.flatMap((p) => (p.gate ? [p.gate] : [])))];
  const out: PlotChoice[] = [];
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

/**
 * Children (sorted) and child-gate plots of every population, built in one pass over the template.
 * Memoised per group so re-renders (counts arriving, slider moves) reuse the same plot objects.
 */
function treeLayout(g: Group): { kids: Map<string, Population[]>; plots: Map<string, PlotChoice[]> } {
  const kids = new Map<string, Population[]>();
  for (const p of Object.values(g.template.populations)) {
    if (!p.parent) continue;
    const list = kids.get(p.parent);
    if (list) list.push(p);
    else kids.set(p.parent, [p]);
  }
  const plots = new Map<string, PlotChoice[]>();
  for (const [id, list] of kids) {
    list.sort(byName);
    plots.set(id, plotsForChildren(g, id, list));
  }
  return { kids, plots };
}

function pct(x: Count | undefined): string {
  return x && x.parent > 0 ? `${((100 * x.count) / x.parent).toFixed(2)}%` : '…';
}

/** `value`, updated only once it has stopped changing for `ms` (avoids recomputing plots mid-drag). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Renders `children` once the placeholder comes within a margin of the viewport, then keeps them
 * mounted. A large tree then computes and draws only the plots that are (or have been) on screen.
 */
function WhenVisible({ size, children }: { size: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return seen ? (
    <>{children}</>
  ) : (
    <div ref={ref} className="path-placeholder" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function openInPlot(popId: string, plot: PlotSpec | null, real: boolean) {
  const st = useStore.getState();
  if (plot && real) st.setUi({ popId, plotId: plot.id, selectedGateId: null, view: 'gate' });
  else if (plot) {
    // A preview built from the gate's axes: save it as a plot so the Gate view shows the same axes.
    const g = st.ws.groups.find((x) => x.id === st.ui.groupId);
    if (!g) return;
    const id = newId('plt_');
    st.mutate('Add plot', (ws) => {
      const gg = ws.groups.find((x) => x.id === g.id)!;
      gg.plots.push({ ...structuredClone(plot), id, style: newPlotStyle(gg, plot.style) });
    });
    st.setUi({ popId, plotId: id, selectedGateId: null, view: 'gate' });
  } else {
    drill(popId);
    useStore.getState().setUi({ view: 'gate' });
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
  count: Count | undefined;
  focusPopId?: string;
  backgate?: { popId: string; color: string };
}

/** Memoised: a card re-renders only when its own plot, count, size or overlay changes. */
const StepCard = memo(function StepCard({
  ws,
  group,
  sampleId,
  pop,
  plot,
  real,
  size,
  count: c,
  focusPopId,
  backgate,
}: CardProps) {
  return (
    <div className="path-card">
      <button
        type="button"
        className="tile-title"
        title={`Open ${pop.name} in the Gate view`}
        onClick={() => openInPlot(pop.id, plot, real)}
      >
        <span>
          <span className="swatch" style={{ background: pop.color }} aria-hidden="true" /> {pop.name}
        </span>
        <span className="muted num">
          {c ? c.count.toLocaleString() : ''}
          {pop.parent && c ? ` · ${pct(c)}` : ''}
        </span>
      </button>
      <WhenVisible size={size}>
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
      </WhenVisible>
    </div>
  );
});

function PopChip({ pop, count: c, on }: { pop: Population; count: Count | undefined; on: boolean }) {
  return (
    <button
      type="button"
      className={`path-chip${on ? ' on' : ''}`}
      title={`Open ${pop.name} in the Gate view`}
      onClick={() => openInPlot(pop.id, null, false)}
    >
      <span className="swatch" style={{ background: pop.color }} aria-hidden="true" />
      <strong>{pop.name}</strong>
      <span className="num">{c ? c.count.toLocaleString() : ''}</span>
      {pop.parent && <span className="num muted">{pct(c)}</span>}
    </button>
  );
}

/** Shows a render error in place of its children instead of leaving the view blank. */
class ViewErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  override render() {
    return this.state.error ? (
      <div className="empty">Could not draw the gating tree: {this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

export function GatingPathView() {
  const ws = useStore((s) => s.ws);
  const uiSampleId = useStore((s) => s.ui.sampleId);
  const uiPopId = useStore((s) => s.ui.popId);
  const uiMissing = useStore((s) => s.ui.missing);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  const [mode, setMode] = useState<'path' | 'tree'>('path');
  const [backgating, setBackgating] = useState(false);
  const [sizeInput, setSizeInput] = useState(280);
  // Plots are recomputed at the new size only once the slider rests, not for every step of a drag.
  const size = useDebounced(sizeInput, 150);
  const [counts, setCounts] = useState<Counts>({});
  const [countError, setCountError] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const sampleId =
    group && uiSampleId && group.sampleIds.includes(uiSampleId) ? uiSampleId : group?.sampleIds[0];
  const missing = !!(sampleId && uiMissing[sampleId]);
  const pops = useMemo(() => (group ? populationsDepthFirst(group.template) : []), [group]);
  const depth = useMemo(() => {
    const d = new Map<string, number>();
    for (const p of pops) d.set(p.id, p.parent ? (d.get(p.parent) ?? 0) + 1 : 0);
    return d;
  }, [pops]);
  const target = group?.template.populations[uiPopId] ? uiPopId : 'root';
  const lineage = useMemo(() => (group ? populationLineage(group.template, target) : []), [group, target]);
  const targetPop = lineage[lineage.length - 1];
  const bgPopId = backgating && targetPop?.parent ? targetPop.id : undefined;
  const bgColor = targetPop?.color;
  const backgate = useMemo(
    () => (bgPopId && bgColor ? { popId: bgPopId, color: bgColor } : undefined),
    [bgPopId, bgColor],
  );
  const layout = useMemo(() => (group ? treeLayout(group) : null), [group]);
  const pathSteps = useMemo(
    () =>
      group
        ? lineage.slice(0, -1).map((pop, i) => {
            const next = lineage[i + 1]!;
            const gate = group.template.gates[next.gate!]!;
            return { pop, next, r: plotForGate(group, pop.id, gate) };
          })
        : [],
    [group, lineage],
  );
  const finalPlots = (targetPop && layout?.plots.get(targetPop.id)) || [];

  const key = useMemo(
    () => (group && sampleId ? JSON.stringify(pops.map((p) => lineageKey(ws, group, sampleId, p.id))) : ''),
    [pops, ws, group, sampleId],
  );
  useEffect(() => {
    if (!group || !sampleId || missing) return;
    let live = true;
    pool
      .counts(
        contextFor(ws, group),
        sampleId,
        pops.map((p) => p.id),
      )
      .then((cs) => {
        if (!live) return;
        setCountError(null);
        setCounts(Object.fromEntries(cs.map((c) => [c.popId, { count: c.count, parent: c.parentCount }])));
      })
      .catch((e: unknown) => live && setCountError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [key, sampleId, missing]);

  // A wide tree overflows sideways with its plots centred over the leaves; starting at scrollLeft 0
  // would show only connectors and leaf chips, so bring the selected population (or the root) into view.
  const templateKey = group
    ? JSON.stringify([group.template.populations, Object.keys(group.template.gates)])
    : '';
  useLayoutEffect(() => {
    const el = treeRef.current;
    if (mode !== 'tree' || !el || el.scrollWidth <= el.clientWidth) return;
    const node =
      el.querySelector<HTMLElement>('.path-node.on, .path-chip.on') ??
      el.querySelector<HTMLElement>('.path-node');
    if (!node) return;
    const box = el.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    el.scrollLeft += r.left + r.width / 2 - (box.left + box.width / 2);
  }, [mode, target, templateKey, size]);

  if (!group || !layout) return <div className="empty">Select a group.</div>;
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
        count={counts[pop.id]}
        {...(focus ? { focusPopId: focus } : {})}
        {...(focus && backgate ? { backgate } : {})}
      />
    );
  };

  // --- path: one plot per ancestor, showing the gate that leads to the next step -------------
  const renderPath = () => (
    <div className="path-row">
      {pathSteps.map(({ pop, next, r }) => (
        <div className="path-step" key={pop.id}>
          {r ? (
            card(pop, r.plot, r.real, pop.id)
          ) : (
            <div className="path-card path-missing">
              <PopChip pop={pop} count={counts[pop.id]} on={false} />
              <span className="muted small">No plot shows the gate for {next.name}.</span>
            </div>
          )}
          <div className="path-arrow" aria-hidden="true">
            <span className="path-arrow-label">
              <span className="swatch" style={{ background: next.color }} /> {next.name}
              <br />
              <span className="num">{counts[next.id] ? counts[next.id]!.count.toLocaleString() : ''}</span>{' '}
              <span className="num muted">{pct(counts[next.id])}</span>
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
              <PopChip pop={targetPop} count={counts[targetPop.id]} on />
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
    const kids = layout.kids.get(pop.id) ?? [];
    if (kids.length === 0)
      return (
        <li key={pop.id}>
          <PopChip pop={pop} count={counts[pop.id]} on={pop.id === target} />
        </li>
      );
    const plots = layout.plots.get(pop.id) ?? [];
    return (
      <li key={pop.id}>
        <div className={`path-node${pop.id === target ? ' on' : ''}`}>
          <div className="path-node-plots">
            {plots.length > 0 ? (
              plots.map((f) => card(pop, f.plot, f.real, f.plot.id))
            ) : (
              <div className="path-card path-missing">
                <PopChip pop={pop} count={counts[pop.id]} on={pop.id === target} />
                <span className="muted small">No plot shows the gates of {pop.name}'s children.</span>
              </div>
            )}
          </div>
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
                {'  '.repeat(depth.get(p.id) ?? 0)}
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
            value={sizeInput}
            onChange={(e) => setSizeInput(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="muted small">
        {mode === 'path'
          ? 'Each plot shows the gate that leads to the next step (highlighted); arrows give the count and % of parent.'
          : 'Every gated population; gates on the way to the selected population are highlighted.'}{' '}
        {backgate && `${targetPop?.name} is overlaid in its colour on the plots above it. `}
        Click a plot title to open it in the Gate view.
      </p>
      {countError && <div className="empty">Could not compute counts: {countError}</div>}
      {missing && (
        <div className="empty">Data not loaded for this sample: re-add its FCS file to view it.</div>
      )}
      {!missing &&
        (mode === 'path' ? (
          lineage.length <= 1 && finalPlots.length === 0 ? (
            <div className="empty">
              No gates yet. Draw a gate in the Gate view, then choose its population here.
            </div>
          ) : (
            renderPath()
          )
        ) : (
          <ViewErrorBoundary resetKey={`${group.id}|${sampleId}|${key}`}>
            {group.template.populations.root ? (
              <div className="path-tree" ref={treeRef}>
                <ul>{node(group.template.populations.root)}</ul>
              </div>
            ) : (
              <div className="empty">This group's gating tree has no root population.</div>
            )}
          </ViewErrorBoundary>
        ))}
    </div>
  );
}
