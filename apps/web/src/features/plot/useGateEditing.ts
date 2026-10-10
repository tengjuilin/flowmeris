import type { AnalysisContext } from '@flowmeris/engine';
import {
  type AxisSpec,
  type Gate,
  type Geometry,
  type Group,
  type PlotSpec,
  type Workspace,
  effectiveGeometry,
} from '@flowmeris/model';
import {
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { PlotMargin } from '../../lib/export/plot.ts';
import {
  applyHandle,
  clampToRange,
  edgeArms,
  newGateBase,
  shapeFromDrag,
  translate,
} from '../../lib/gateEdit.ts';
import { type DimMap, dimMap } from '../../lib/geometry.ts';
import { type PlotFrame, type ShownGate, hitGate, popAt } from '../../lib/plotFrame.ts';
import { createGate, deleteGate, setGateGeometry, setLabelOffset } from '../../state/commands/gates.ts';
import { type Tool, useStore } from '../../state/store.ts';
import { useDragPreview, useHoverPreview } from './useGatePreview.ts';

type XY = [number, number];

/** A pointer drag on the plot, in data units except where noted. */
export type Drag =
  | { kind: 'create'; tool: 'rect' | 'range' | 'ellipse'; start: XY; cur: XY }
  | { kind: 'move'; gateId: string; start: XY; base: Geometry }
  | { kind: 'handle'; gateId: string; handle: string; base: Geometry }
  /** A population's label: `start` in pixels, the offsets in fractions of the plot size. */
  | { kind: 'label'; popId: string; start: XY; base: XY; cur: XY };

/** The quadrant, spider or split gate a click would place under the cursor. */
export type HoverGeometry = Extract<Geometry, { kind: 'quadrant' | 'spider' | 'split' }>;

export interface GateEditingArgs {
  ws: Workspace;
  group: Group;
  ctx: AnalysisContext;
  sampleId: string;
  plot: PlotSpec;
  is1d: boolean;
  frame: PlotFrame;
  margin: PlotMargin;
  svgRef: RefObject<SVGSVGElement>;
  /** The gates drawn on the plot. */
  gates: Gate[];
  /** Gates can be drawn, selected and edited (the Gate view's and Plot grid's active plot). */
  interactive: boolean;
  compact: boolean;
  missing: boolean;
  tool: Tool;
  selectedGateId: string | null;
  onDrill?: (popId: string) => void;
}

/**
 * Drawing, selecting, moving and reshaping the plot's gates, dragging their labels, and the keyboard
 * (arrows nudge the selected gate, Delete removes it, Escape deselects or drops a polygon being drawn).
 * Edits stay a draft while the pointer is down and are committed on release.
 */
export function useGateEditing(a: GateEditingArgs) {
  const { ws, group, ctx, sampleId, plot, is1d, frame, margin, svgRef, gates } = a;
  const { interactive, compact, missing, tool, selectedGateId, onDrill } = a;
  const { xr, yr, pw, ph, X, Y, toData } = frame;
  const setUi = useStore((s) => s.setUi);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<{ gateId: string; geom: Geometry } | null>(null);
  const [poly, setPoly] = useState<XY[] | null>(null);
  const [hover, setHover] = useState<XY | null>(null);
  const { preview, schedule: schedulePreview, stop: stopPreview } = useDragPreview(ctx, sampleId);

  const evPt = (e: { clientX: number; clientY: number }): XY => {
    const r = svgRef.current!.getBoundingClientRect();
    return [e.clientX - r.left - margin.l, e.clientY - r.top - margin.t];
  };
  const maps = useCallback(
    (gate: Gate): DimMap[] => gate.dims.map((d, i) => dimMap(ws, d, i === 0 ? plot.x : (plot.y as AxisSpec))),
    [ws, plot],
  );
  const geomOf = (gate: Gate): Geometry =>
    draft?.gateId === gate.id ? draft.geom : effectiveGeometry(group, gate.id, sampleId);
  const shownGates = (): ShownGate[] => gates.map((gate) => ({ gate, geom: geomOf(gate), maps: maps(gate) }));
  /** Clamp a data point to the plotted range (spider arm handles stay inside the plot). */
  const clampPt = (p: readonly [number, number]) => clampToRange(p, xr, yr);

  const canDraw = interactive && !missing;
  // Gate labels can be dragged off the events they cover on any full-size plot, unless a gate is being drawn.
  const labelsMovable = !compact && !missing && tool === 'select' && !poly;

  const hoverGeom: HoverGeometry | null =
    hover && !drag
      ? !is1d && tool === 'quadrant'
        ? { kind: 'quadrant', center: hover }
        : !is1d && tool === 'spider'
          ? { kind: 'spider', center: hover, arms: edgeArms(xr, yr) }
          : is1d && tool === 'split'
            ? { kind: 'split', at: hover[0] }
            : null
      : null;
  const hoverKey = hoverGeom && canDraw ? JSON.stringify(hoverGeom) : '';
  const hoverCounts = useHoverPreview(
    ctx,
    sampleId,
    hoverKey,
    hoverGeom ? { ...newGateBase(plot, is1d), id: '__hover', geometry: hoverGeom } : null,
  );

  const commit = (gateId: string, geom: Geometry) => {
    setGateGeometry(group.id, gateId, geom, useStore.getState().ui.editScope, sampleId);
  };

  const finishCreate = (geometry: Geometry) => {
    const pop = createGate(group.id, { ...newGateBase(plot, is1d), geometry });
    const st = useStore.getState();
    const g = st.ws.groups.find((x) => x.id === group.id)!;
    const gid = g.template.populations[pop]?.gate ?? null;
    setUi({ selectedGateId: gid, tool: 'select' });
  };

  /** Starts dragging a handle of the selected gate; a polygon edge's midpoint handle inserts a vertex. */
  const startHandle = (handleEl: Element, p: XY) => {
    const gateId = handleEl.getAttribute('data-gate')!;
    const handle = handleEl.getAttribute('data-handle')!;
    const gate = group.template.gates[gateId]!;
    const base = geomOf(gate);
    if (handle.startsWith('mid')) {
      // insert polygon vertex at edge midpoint
      if (base.kind === 'polygon') {
        const i = Number(handle.slice(3));
        const v = [...base.vertices];
        v.splice(i + 1, 0, p);
        const ng: Geometry = { ...base, vertices: v };
        setDraft({ gateId, geom: ng });
        setDrag({ kind: 'handle', gateId, handle: `v${i + 1}`, base: ng });
      }
      return;
    }
    setDrag({ kind: 'handle', gateId, handle, base });
  };

  /** Adds a polygon vertex; a click near the first vertex of three or more closes the polygon. */
  const addVertex = (p: XY, px: number, py: number) => {
    if (poly && poly.length >= 3) {
      const f = poly[0]!;
      if (Math.hypot(X(f[0]) - px, Y(f[1]) - py) < 9) {
        finishCreate({ kind: 'polygon', vertices: poly });
        setPoly(null);
        return;
      }
    }
    setPoly([...(poly ?? []), p]);
  };

  /** A press with the current tool at data point `p`, pixel (px, py). */
  const pressTool = (p: XY, px: number, py: number) => {
    switch (tool) {
      case 'rect':
      case 'ellipse':
        setDrag({ kind: 'create', tool, start: p, cur: p });
        return;
      case 'range':
        if (is1d) setDrag({ kind: 'create', tool: 'range', start: p, cur: p });
        return;
      case 'split':
        if (is1d) finishCreate({ kind: 'split', at: p[0] });
        return;
      case 'polygon':
        if (!is1d) addVertex(p, px, py);
        return;
      case 'quadrant':
        if (!is1d) finishCreate({ kind: 'quadrant', center: p });
        return;
      case 'spider':
        if (!is1d) {
          finishCreate({ kind: 'spider', center: p, arms: edgeArms(xr, yr) });
        }
        return;
      default: {
        // select / move
        const hit = hitGate(frame, shownGates(), px, py, is1d);
        setUi({ selectedGateId: hit?.id ?? null });
        if (hit && maps(hit).every((m) => m.identity))
          setDrag({ kind: 'move', gateId: hit.id, start: p, base: geomOf(hit) });
      }
    }
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const labelEl = labelsMovable && e.button === 0 && (e.target as Element).closest('[data-label-pop]');
    if (labelEl) {
      // Keep the press from the plot's container too (e.g. panning the tree of plots).
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const popId = labelEl.getAttribute('data-label-pop')!;
      const base = group.template.populations[popId]?.labelOffset ?? [0, 0];
      setDrag({ kind: 'label', popId, start: evPt(e), base, cur: base });
      return;
    }
    if (!canDraw || e.button !== 0) return;
    const [px, py] = evPt(e);
    if (px < 0 || py < 0 || px > pw || py > ph) return;
    const p = toData(px, py);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const handleEl = (e.target as Element).closest('[data-handle]');
    if (handleEl) startHandle(handleEl, p);
    else pressTool(p, px, py);
  };

  /** The gate moved or reshaped with the pointer at `p`; null when the shape would be invalid. */
  const dragged = (drag: Extract<Drag, { kind: 'move' | 'handle' }>, p: XY): Geometry | null => {
    let next: Geometry | null = null;
    if (drag.kind === 'move')
      next = translate(drag.base, p[0] - drag.start[0], is1d ? 0 : p[1] - drag.start[1]);
    else next = applyHandle(drag.base, drag.handle, p, is1d, clampPt);
    // spider points never leave the plot, even when moving the whole gate or one drawn before this rule
    if (next?.kind === 'spider')
      next = { ...next, center: clampPt(next.center), arms: next.arms.map(clampPt) as typeof next.arms };
    return next;
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const [px, py] = evPt(e);
    const p = toData(px, py);
    // The cursor position only drives the polygon draft and the quadrant / spider preview;
    // tracking it otherwise would re-render the whole plot on every pointer move.
    if (
      poly ||
      ((tool === 'quadrant' || tool === 'spider') && !is1d && canDraw) ||
      (tool === 'split' && is1d && canDraw)
    )
      setHover(px >= 0 && py >= 0 && px <= pw && py <= ph ? p : null);
    else if (hover) setHover(null);
    if (!drag) return;
    if (drag.kind === 'create') {
      setDrag({ ...drag, cur: p });
      return;
    }
    if (drag.kind === 'label') {
      const dx = (px - drag.start[0]) / pw;
      const dy = (py - drag.start[1]) / ph;
      setDrag({ ...drag, cur: [drag.base[0] + dx, drag.base[1] + dy] });
      return;
    }
    const next = dragged(drag, p);
    if (next) {
      setDraft({ gateId: drag.gateId, geom: next });
      schedulePreview(group.template.gates[drag.gateId]!, next);
    }
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'label') {
      const moved = drag.cur[0] !== drag.base[0] || drag.cur[1] !== drag.base[1];
      if (moved) setLabelOffset(group.id, drag.popId, drag.cur);
      setDrag(null);
      return;
    }
    if (drag.kind === 'create') {
      const [x0, y0] = drag.start;
      const [x1, y1] = drag.cur;
      const tiny = Math.abs(X(x1) - X(x0)) < 4 && (is1d || Math.abs(Y(y1) - Y(y0)) < 4);
      if (!tiny) finishCreate(shapeFromDrag(drag.tool, drag.start, drag.cur));
    } else if (draft && draft.gateId === drag.gateId) {
      commit(draft.gateId, draft.geom);
    }
    setDrag(null);
    setDraft(null);
    stopPreview();
  };

  const onDoubleClick = (e: RMouseEvent<SVGSVGElement>) => {
    const labelEl = labelsMovable && (e.target as Element).closest('[data-label-pop]');
    if (labelEl) {
      // Put a moved label back in its default place (instead of drilling into the population).
      e.stopPropagation();
      const popId = labelEl.getAttribute('data-label-pop')!;
      if (group.template.populations[popId]?.labelOffset) setLabelOffset(group.id, popId, undefined);
      return;
    }
    if (!interactive) return;
    if (poly && poly.length >= 3) {
      finishCreate({ kind: 'polygon', vertices: poly.slice(0, -1).length >= 3 ? poly.slice(0, -1) : poly });
      setPoly(null);
      return;
    }
    const [px, py] = evPt(e);
    const pop = popAt(frame, group.template, shownGates(), px, py, is1d);
    if (pop && onDrill) onDrill(pop);
  };

  /** Keys while a polygon is being drawn: Escape drops it, Backspace removes a vertex, Enter closes it. */
  const polygonKey = (e: KeyboardEvent, poly: XY[]) => {
    if (e.key === 'Escape') setPoly(null);
    else if (e.key === 'Backspace') setPoly(poly.length > 1 ? poly.slice(0, -1) : null);
    else if (e.key === 'Enter' && poly.length >= 3) {
      finishCreate({ kind: 'polygon', vertices: poly });
      setPoly(null);
    }
  };

  /** Arrow keys nudge the selected gate by a pixel (10 with Shift). */
  const nudge = (e: KeyboardEvent, sel: Gate) => {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) / pw;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = is1d
      ? 0
      : e.key === 'ArrowUp'
        ? step * (yr[1] - yr[0])
        : e.key === 'ArrowDown'
          ? -step * (yr[1] - yr[0])
          : 0;
    commit(sel.id, translate(effectiveGeometry(group, sel.id, sampleId), dx * (xr[1] - xr[0]), dy));
  };

  /** Keys on the selected gate: arrows nudge it, Delete or Backspace removes it, Escape deselects it. */
  const selectedKey = (e: KeyboardEvent, sel: Gate) => {
    if (e.key.startsWith('Arrow') && maps(sel).every((m) => m.identity)) nudge(e, sel);
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteGate(group.id, sel.id);
      setUi({ selectedGateId: null });
    } else if (e.key === 'Escape') setUi({ selectedGateId: null });
  };

  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (poly) {
        polygonKey(e, poly);
        return;
      }
      const sel = selectedGateId ? group.template.gates[selectedGateId] : undefined;
      if (sel && sel.parentPop === plot.population) selectedKey(e, sel);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return {
    drag,
    poly,
    hover,
    hoverGeom,
    hoverCounts,
    preview,
    labelsMovable,
    maps,
    geomOf,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave: () => setHover(null),
      onDoubleClick,
    },
  };
}
