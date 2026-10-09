import type { Gate, Group, PlotSpec, Population, Workspace } from '@flowmeris/model';
import { newId, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import {
  type CSSProperties,
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
import { DEFAULT_STYLE } from '../lib/figure.ts';
import { withBaseFont } from '../lib/figure.ts';
import { gateMatchesAxes } from '../lib/geometry.ts';
import { lineageKey } from '../lib/keys.ts';
import { contextFor, useGroup, useStore } from '../state/store.ts';
import { PlotCanvas, plotBox } from './PlotCanvas.tsx';
import { drill } from './PlotPanel.tsx';
import { PopulationTree } from './PopulationTree.tsx';
import { useSize } from './hooks.ts';

type Count = { count: number; parent: number };
type Counts = Record<string, Count>;
type PlotChoice = { plot: PlotSpec; real: boolean; gateIds: string[] };

/** Base font size (px) of the plots, as in Tiles. */
const FONT_PX = 11;
/** Space a card takes beyond its plot: padding and border. */
const CARD_EXTRA = 10;
/** Width of a path step's arrow, with the gap before it. */
const ARROW_W = 104;
/** A tree card's horizontal room beyond its plot: padding and border, then its branch's padding. */
const TREE_EXTRA = 22;
/** Range of the plot size slider (px). */
const MIN_PLOT = 120;
const MAX_PLOT = 800;
/** The populations panel leaves at least MIN_BODY of the view above it. */
const MIN_BODY = 120;

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
  // The settings this channel pair would have if never opened: its saved ones, not those in use.
  const key = `${axes[0]!.channel}|${is1d ? '' : axes[1]!.channel}`;
  const plot: PlotSpec = {
    id: `path_${popId}_${gate.id}`,
    population: popId,
    kind: is1d ? 'histogram' : base?.kind && base.kind !== 'histogram' ? base.kind : 'pseudocolor',
    x: axes[0]!,
    style:
      base?.stylesByAxes?.[key] ??
      (base?.styleFollow === false ? base.styleBase : undefined) ??
      DEFAULT_STYLE,
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

/**
 * `value`, updated only once it has stopped changing for `ms` (avoids recomputing plots mid-drag).
 * The first measured value (after `unset`) takes effect at once.
 */
function useDebounced<T>(value: T, ms: number, unset: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (v === unset) {
      setV(value);
      return;
    }
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v === unset ? value : v;
}

/** Where a tree is scrolled to, with its scrollable size then. */
type TreeView = { left: number; top: number; sw: number; sh: number };
/** Where each group's tree was scrolled to, kept while the Path layout or other views are shown. */
const treeScroll = new Map<string, TreeView>();

/**
 * Renders `children` once the placeholder comes within a margin of the viewport, then keeps them
 * mounted. A large tree then computes and draws only the plots that are (or have been) on screen.
 * The placeholder takes the plot's own size, so nothing moves when the plot replaces it.
 */
function WhenVisible({ width, height, children }: { width: number; height: number; children: ReactNode }) {
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
    <div ref={ref} className="path-placeholder" style={{ width, height }} aria-hidden="true" />
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
      gg.plots.push({ ...structuredClone(plot), id });
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
  renderSize: number;
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
  renderSize,
  count: c,
  focusPopId,
  backgate,
}: CardProps) {
  // Drawn with the small base font; the saved plot itself (opened on click) keeps its own.
  const shown = useMemo(() => withBaseFont(plot, FONT_PX), [plot]);
  const box = plotBox(shown, size, size);
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
          {/* A space until the count arrives, so the title keeps its height. */}
          {c ? c.count.toLocaleString() : '\u00a0'}
          {pop.parent && c ? ` · ${pct(c)}` : ''}
        </span>
      </button>
      <WhenVisible width={box.width} height={box.height}>
        {/* While the size changes, the last render is stretched to the live size (as in Tiles). */}
        <div style={{ width: size, height: size, overflow: 'hidden' }}>
          <div
            style={
              size === renderSize
                ? undefined
                : { transform: `scale(${size / renderSize})`, transformOrigin: '0 0' }
            }
          >
            <PlotCanvas
              ws={ws}
              group={group}
              sampleId={sampleId}
              plot={shown}
              width={renderSize}
              height={renderSize}
              hideOffScaleNote
              {...(focusPopId ? { focusPopId } : {})}
              {...(backgate ? { backgate } : {})}
            />
          </div>
        </div>
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
  const uiMissing = useStore((s) => s.status.missing);
  const picked = useStore((s) => s.views.pathPlotSize);
  const mode = useStore((s) => s.views.pathMode);
  const treeSize = useStore((s) => s.views.treePlotSize);
  const panelHeight = useStore((s) => s.views.pathPanelHeight);
  const setUi = useStore((s) => s.setUi);
  const setViews = useStore((s) => s.setViews);
  const group = useGroup();
  const [backgating, setBackgating] = useState(false);
  // Each layout has its own plot size, picked freely with the slider; the path wraps as many steps (a
  // plot with its arrow) per row as fit, and a plot is never wider than the view.
  const body = useRef<HTMLDivElement>(null);
  const { width } = useSize(body);
  const extra = CARD_EXTRA + ARROW_W;
  const pathSize = width > 0 ? Math.max(MIN_PLOT, Math.min(picked, width - extra)) : 0;
  const size = mode === 'tree' ? treeSize : pathSize;
  const stepW = size + extra;
  const columns = Math.max(1, Math.floor(width / stepW));
  // Cards resize live; their plots are recomputed at the new size only once the slider (or window)
  // rests, and stretched to the live size meanwhile. Each layout keeps its own settled size, so
  // switching between them draws the plots once, at their size.
  const pathRender = useDebounced(pathSize, 150, 0);
  const treeRender = useDebounced(treeSize, 150, 0);
  const renderSize = mode === 'tree' ? treeRender : pathRender;
  const [counts, setCounts] = useState<Counts>({});
  const [countError, setCountError] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const sampleId =
    group && uiSampleId && group.sampleIds.includes(uiSampleId) ? uiSampleId : group?.sampleIds[0];
  const missing = !!(sampleId && uiMissing[sampleId]);
  const pops = useMemo(() => (group ? populationsDepthFirst(group.template) : []), [group]);
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
  // would show only connectors and leaf chips. It first opens on All events, then where it was left
  // (noted as it scrolls: by the time it closes it is no longer in the page to read from).
  const groupId = group?.id;
  const view = useRef<TreeView | null>(null);
  const note = (el: HTMLElement) => {
    view.current = { left: el.scrollLeft, top: el.scrollTop, sw: el.scrollWidth, sh: el.scrollHeight };
    if (groupId) treeScroll.set(groupId, view.current);
  };
  useLayoutEffect(() => {
    const el = treeRef.current;
    if (mode !== 'tree' || !el || !groupId) return;
    const saved = treeScroll.get(groupId);
    if (saved) {
      el.scrollLeft = saved.left;
      el.scrollTop = saved.top;
    } else {
      el.scrollTop = 0;
      const node = el.querySelector<HTMLElement>('.path-node');
      if (node) {
        const box = el.getBoundingClientRect();
        const r = node.getBoundingClientRect();
        el.scrollLeft += r.left + r.width / 2 - (box.left + box.width / 2);
      }
    }
    note(el);
  }, [mode, groupId, size > 0]);
  // A new plot size keeps the same part of the tree in the middle of the view.
  const shown = useRef({ mode, size });
  useLayoutEffect(() => {
    const el = treeRef.current;
    const was = shown.current;
    const v = view.current;
    shown.current = { mode, size };
    if (mode !== 'tree' || was.mode !== 'tree' || was.size === size || !el || !v) return;
    el.scrollLeft = ((v.left + el.clientWidth / 2) / v.sw) * el.scrollWidth - el.clientWidth / 2;
    // A tree seen from its top (All events) stays so.
    if (v.top > 0)
      el.scrollTop = ((v.top + el.clientHeight / 2) / v.sh) * el.scrollHeight - el.clientHeight / 2;
    note(el);
  }, [mode, size]);

  // The body stays mounted (and measured) whatever it shows.
  const bare = (text: string) => (
    <div className="path-view">
      <div className="path-body" ref={body}>
        <div className="empty">{text}</div>
      </div>
    </div>
  );
  if (!group || !layout) return bare('Select a group.');
  if (!sampleId) return bare('This group has no samples.');

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
        renderSize={renderSize || size}
        count={counts[pop.id]}
        {...(focus ? { focusPopId: focus } : {})}
        {...(focus && backgate ? { backgate } : {})}
      />
    );
  };

  // --- path: one plot per ancestor, showing the gate that leads to the next step -------------
  const noGates = pathSteps.length === 0 && finalPlots.length === 0;
  const renderPath = () => (
    <div
      className="path-row"
      // Room below, so the last row can be scrolled out from under the populations panel.
      style={{ gridTemplateColumns: `repeat(${columns}, ${stepW}px)`, paddingBottom: panelHeight + 24 }}
    >
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
      {noGates && (
        <div className="empty" style={{ gridColumn: `1 / span ${columns}` }}>
          No gates yet. Draw a gate in the Gate view, then choose its population here.
        </div>
      )}
      {!noGates &&
        targetPop &&
        (finalPlots.length > 0 ? (
          finalPlots.map((f) => (
            <div className="path-step" key={f.plot.id}>
              {card(targetPop, f.plot, f.real, f.plot.id)}
            </div>
          ))
        ) : (
          <div className="path-step">
            <div className="path-card path-end">
              <PopChip pop={targetPop} count={counts[targetPop.id]} on />
              <span className="muted small">
                {counts[targetPop.id] && counts.root
                  ? `${((100 * counts[targetPop.id]!.count) / Math.max(1, counts.root.count)).toFixed(2)}% of all events`
                  : ''}
              </span>
            </div>
          </div>
        ))}
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
        <div className="seg" title="Layout">
          <button
            type="button"
            className={mode === 'path' ? 'on' : ''}
            aria-pressed={mode === 'path'}
            onClick={() => setViews({ pathMode: 'path' })}
            title="Plots from All events to the selected population"
          >
            Path
          </button>
          <button
            type="button"
            className={mode === 'tree' ? 'on' : ''}
            aria-pressed={mode === 'tree'}
            onClick={() => setViews({ pathMode: 'tree' })}
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
        <div className="tiles-controls">
          <label className="field" title="Plot size">
            Plot size
            <input
              type="range"
              min={MIN_PLOT}
              max={MAX_PLOT}
              step={1}
              value={mode === 'tree' ? treeSize : picked}
              onChange={(e) =>
                setViews(
                  mode === 'tree'
                    ? { treePlotSize: Number(e.target.value) }
                    : { pathPlotSize: Number(e.target.value) },
                )
              }
            />
          </label>
        </div>
      </div>
      <div className={`path-body${mode === 'tree' ? ' tree' : ''}`} ref={body}>
        {countError && <div className="empty">Could not compute counts: {countError}</div>}
        {missing ? (
          <div className="empty">Data not loaded for this sample: re-add its FCS file to view it.</div>
        ) : size <= 0 ? null : mode === 'path' ? (
          renderPath()
        ) : (
          <ViewErrorBoundary resetKey={`${group.id}|${sampleId}|${key}`}>
            {group.template.populations.root ? (
              // Scrolls both ways, and dragging its empty space pans it.
              <div
                className="path-tree"
                ref={treeRef}
                onScroll={(e) => note(e.currentTarget)}
                onPointerDown={(e) => {
                  const el = e.currentTarget;
                  const t = e.target as Element;
                  if (e.button !== 0 || t.closest('.path-card, .path-chip, button, input')) return;
                  // Not when pressing the tree's own scrollbars.
                  const r = el.getBoundingClientRect();
                  if (e.clientX - r.left >= el.clientWidth || e.clientY - r.top >= el.clientHeight) return;
                  e.preventDefault();
                  el.setPointerCapture(e.pointerId);
                  el.classList.add('panning');
                  pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
                }}
                onPointerMove={(e) => {
                  const p = pan.current;
                  if (!p) return;
                  e.currentTarget.scrollLeft = p.left - (e.clientX - p.x);
                  e.currentTarget.scrollTop = p.top - (e.clientY - p.y);
                }}
                onPointerUp={(e) => {
                  pan.current = null;
                  e.currentTarget.classList.remove('panning');
                }}
                onPointerCancel={(e) => {
                  pan.current = null;
                  e.currentTarget.classList.remove('panning');
                }}
              >
                {/* Room below, so the bottom of the tree can be scrolled out from under the populations panel. */}
                <ul style={{ paddingBottom: panelHeight + 24 }}>{node(group.template.populations.root)}</ul>
              </div>
            ) : (
              <div className="empty">This group's gating tree has no root population.</div>
            )}
          </ViewErrorBoundary>
        )}
      </div>
      <PopulationsPanel
        popId={target}
        sampleId={sampleId}
        onPick={(popId) => setUi({ popId, plotId: null, selectedGateId: null })}
      />
    </div>
  );
}

/**
 * The populations tree in a panel over the bottom right of the view, the plots showing beside it.
 * Dragging (or arrow keys on) its top edge sets its height, kept while other views are shown;
 * double-clicking it (or Enter) fits the panel to its rows, or, when it fits already, minimises it to its title.
 */
function PopulationsPanel({
  popId,
  sampleId,
  onPick,
}: { popId: string; sampleId: string; onPick: (popId: string) => void }) {
  const height = useStore((s) => s.views.pathPanelHeight);
  const setUi = useStore((s) => s.setUi);
  const setViews = useStore((s) => s.setViews);
  const panel = useRef<HTMLDivElement>(null);
  // The panel is as wide as the longest name and its counts need (plus a little room), not the full
  // view, so each count stays close to its name.
  const [listW, setListW] = useState(0);
  const drag = useRef<{ y: number; h: number; max: number } | null>(null);
  const tree = () => panel.current?.querySelector<HTMLElement>('.pop-tree');
  /** Shortest the panel may be: its title alone (with the top border). */
  const minHeight = () => (tree()?.querySelector<HTMLElement>('.pane-title')?.offsetHeight ?? 29) + 1;
  /** Tallest the panel may be: the view's height less the toolbar and MIN_BODY of plots. */
  const maxHeight = () => {
    const view = panel.current?.closest<HTMLElement>('.path-view');
    const bar = view?.querySelector<HTMLElement>(':scope > .toolbar');
    return view ? view.clientHeight - (bar?.offsetHeight ?? 0) - MIN_BODY : 600;
  };
  const set = (h: number, max: number) =>
    setViews({ pathPanelHeight: Math.round(Math.max(minHeight(), Math.min(max, h))) });
  /** Fit the panel to its rows (as far as the view allows), or minimise it when it fits already. */
  const toggle = () => {
    const t = tree();
    if (!t) return;
    const max = maxHeight();
    // Its title and rows, measured as laid out (scrollHeight is the panel's own height when they are shorter).
    const cs = getComputedStyle(t);
    const content = [...t.children].reduce((h, c) => h + (c as HTMLElement).offsetHeight, 0);
    const edges = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'] as const;
    const fit = Math.max(
      minHeight(),
      Math.min(max, Math.ceil(content + edges.reduce((h, k) => h + Number.parseFloat(cs[k]), 0))),
    );
    set(Math.abs(height - fit) <= 1 ? minHeight() : fit, max);
  };
  return (
    <div
      className="path-dock"
      style={listW > 0 ? ({ '--pop-list-w': `${listW + 24}px` } as CSSProperties) : undefined}
    >
      <div
        className="path-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the populations panel"
        aria-valuenow={height}
        tabIndex={0}
        title="Drag to resize the populations panel; double-click to fit it to its rows or minimise it"
        onDoubleClick={toggle}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, h: panel.current?.offsetHeight ?? height, max: maxHeight() };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) set(d.h + d.y - e.clientY, d.max);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          if (e.key === 'Enter') toggle();
          else if (e.key === 'ArrowUp') set(height + step, maxHeight());
          else if (e.key === 'ArrowDown') set(height - step, maxHeight());
          else return;
          e.preventDefault();
        }}
      />
      <div className="plot-side path-panel" ref={panel} style={{ height }}>
        <PopulationTree popId={popId} sampleId={sampleId} onPick={onPick} onWidth={setListW} />
      </div>
    </div>
  );
}
