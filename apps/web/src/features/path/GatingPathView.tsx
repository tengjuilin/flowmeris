import type { PlotSpec, Population } from '@flowmeris/model';
import { populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDebounced } from '../../components/hooks/useSettled.ts';
import { useSize } from '../../components/hooks/useSize.ts';
import { getPool } from '../../engine-client/pool.ts';
import { type Counts, pathSteps, pctOfParent, treeLayout } from '../../lib/gatingPath.ts';
import { lineageKey } from '../../lib/keys.ts';
import { contextFor, useGroup, useStore } from '../../state/store.ts';

import { PopChip, StepCard, ViewErrorBoundary } from './PathCards.tsx';
import { PopulationsPanel } from './PopulationsPanel.tsx';
/** Space a card takes beyond its plot: padding and border. */
const CARD_EXTRA = 10;
/** Width of a path step's arrow, with the gap before it. */
const ARROW_W = 104;
/** Range of the plot size slider (px). */
const MIN_PLOT = 120;
const MAX_PLOT = 800;

/** Where a tree is scrolled to, with its scrollable size then. */
type TreeView = { left: number; top: number; sw: number; sh: number };
/** Where each group's tree was scrolled to, kept while the Path layout or other views are shown. */
const treeScroll = new Map<string, TreeView>();

/** The Gating path view. Clicking a plot opens it in the Gate view. */
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
  const steps = useMemo(() => (group ? pathSteps(group, lineage) : []), [group, lineage]);
  const finalPlots = (targetPop && layout?.plots.get(targetPop.id)) || [];

  const key = useMemo(
    () => (group && sampleId ? JSON.stringify(pops.map((p) => lineageKey(ws, group, sampleId, p.id))) : ''),
    [pops, ws, group, sampleId],
  );
  useEffect(() => {
    if (!group || !sampleId || missing) return;
    let live = true;
    getPool()
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
  const noGates = steps.length === 0 && finalPlots.length === 0;
  const renderPath = () => (
    <div
      className="path-row"
      // Room below, so the last row can be scrolled out from under the populations panel.
      style={{ gridTemplateColumns: `repeat(${columns}, ${stepW}px)`, paddingBottom: panelHeight + 24 }}
    >
      {steps.map(({ pop, next, r }) => (
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
              <span className="num muted">{pctOfParent(counts[next.id])}</span>
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
        <div className="view-controls">
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
