import type { Group, PlotCell, PlotKind, PlotSpec, Workspace } from '@flowmeris/model';
import { type ReactNode, useEffect, useRef } from 'react';
import {
  SCALE_KINDS,
  type ScaleKind,
  defaultAxis,
  groupSample,
  registerTransform,
  scaleKindOf,
  transformOfKind,
} from '../lib/axisDefaults.ts';
import type { PlotHandle } from '../lib/export/plot.ts';
import { withAxesChange } from '../lib/figure.ts';
import { newPlot, newTilePlot } from '../lib/plotFactories.ts';
import { exportPlot } from '../state/export.ts';
import { type Tool, useGroup, useStore } from '../state/store.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { PlotCanvas } from './PlotCanvas.tsx';
import { useSize } from './hooks.ts';

const TOOLS: { id: Tool; label: string; key: string; title: string; oneD?: boolean; twoD?: boolean }[] = [
  { id: 'select', label: 'Select', key: 'V', title: 'Select, move and edit gates (V)' },
  { id: 'rect', label: 'Rectangle', key: 'R', title: 'Rectangle gate: drag (R)', twoD: true },
  {
    id: 'ellipse',
    label: 'Ellipse',
    key: 'E',
    title: 'Ellipse gate: drag, then rotate/resize with handles (E)',
    twoD: true,
  },
  {
    id: 'polygon',
    label: 'Polygon',
    key: 'P',
    title: 'Polygon gate: click vertices; close by clicking the first vertex, double-click or Enter (P)',
    twoD: true,
  },
  { id: 'quadrant', label: 'Quadrant', key: 'Q', title: 'Quadrant gate: click the centre (Q)', twoD: true },
  {
    id: 'spider',
    label: 'Spider',
    key: 'S',
    title: 'Spider gate: click the centre, then drag arm handles (S)',
    twoD: true,
  },
  {
    id: 'range',
    label: 'Range',
    key: 'H',
    title: 'Range gate on a histogram: drag horizontally (H)',
    oneD: true,
  },
  {
    id: 'split',
    label: 'Bisector',
    key: 'B',
    title: 'Bisector on a histogram: click to split the events into − and + at that value (B)',
    oneD: true,
  },
];

/** Line icons for the gate drawing tools, drawn on a 20×20 grid in the button's text colour. */
const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: (
    <path d="M5.5 3.5v12.2l3.3-3.1 2.3 4.9 2.2-1-2.3-4.8 4.5-.3z" fill="currentColor" fillOpacity="0" />
  ),
  rect: <rect x="3.5" y="5" width="13" height="10" rx="1.5" />,
  ellipse: <ellipse cx="10" cy="10" rx="7.2" ry="4.3" transform="rotate(-28 10 10)" />,
  polygon: (
    <>
      <path d="M4 5.5 15.5 4l-4 6.2 5 5.8L5 15.5z" />
      <g fill="currentColor" stroke="none">
        <circle cx="4" cy="5.5" r="1.4" />
        <circle cx="15.5" cy="4" r="1.4" />
        <circle cx="11.5" cy="10.2" r="1.4" />
        <circle cx="16.5" cy="16" r="1.4" />
        <circle cx="5" cy="15.5" r="1.4" />
      </g>
    </>
  ),
  quadrant: (
    <>
      <path d="M7.5 2.5v15M2.5 12.5h15" />
      <circle cx="7.5" cy="12.5" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  spider: (
    <>
      <path d="M9.8 9 11.8 2.5M9.8 9 2.5 13M9.8 9l7.7 2.7M9.8 9l3.4 8.5" />
      <circle cx="9.8" cy="9" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  range: (
    <>
      <path d="M2.5 17c3.5 0 4.5-8 7.5-8s4 8 7.5 8" strokeOpacity="0.45" />
      <path d="M5 3.5v5M15 3.5v5M5 6h10" />
    </>
  ),
  split: (
    <>
      <path d="M2.5 17c3.5 0 4.5-8 7.5-8s4 8 7.5 8" strokeOpacity="0.45" />
      <path d="M10 2.5v15M3 6h14" />
    </>
  ),
};

const KINDS: { id: PlotKind; label: string }[] = [
  { id: 'pseudocolor', label: 'Pseudocolor' },
  { id: 'dot', label: 'Dot' },
  { id: 'density', label: 'Density' },
  { id: 'contour', label: 'Contour' },
  { id: 'histogram', label: 'Histogram' },
];

export function usePlotForPopulation(): PlotSpec | undefined {
  const group = useGroup();
  const ui = useStore((s) => s.ui);
  if (!group) return undefined;
  return (
    group.plots.find((p) => p.id === ui.plotId && p.population === ui.popId) ??
    group.plots.find((p) => p.population === ui.popId)
  );
}

/** The Tiles plot of the population being gated; made from the Gate view's plot on first visit. */
export function useTilePlot(group: Group | undefined): PlotSpec | undefined {
  const popId = useStore((s) => s.ui.popId);
  const plot = group?.tilePlots.find((p) => p.population === popId);
  const missing = !!group && !plot && !!group.template.populations[popId];
  useEffect(() => {
    if (!missing || !group) return;
    useStore.getState().mutateQuiet((w) => {
      const g = w.groups.find((x) => x.id === group.id);
      if (g && !g.tilePlots.some((p) => p.population === popId)) newTilePlot(w, g, popId);
    });
  }, [missing, group, popId]);
  return plot;
}

/** Make sure the active population has a plot (creates one with the parent's axes). */
export function ensurePlot(popId: string): string {
  const st = useStore.getState();
  const g = st.ws.groups.find((x) => x.id === st.ui.groupId);
  if (!g) return '';
  const existing = g.plots.find((p) => p.population === popId);
  if (existing) return existing.id;
  let id = '';
  st.mutate('Add plot', (ws) => {
    const gg = ws.groups.find((x) => x.id === g.id)!;
    const pop = gg.template.populations[popId];
    const parentGate = pop?.gate ? gg.template.gates[pop.gate] : undefined;
    const parentPlot = gg.plots.find((p) => p.population === parentGate?.parentPop);
    const xy: [string, string] | undefined = parentPlot?.y
      ? [parentPlot.x.channel, parentPlot.y.channel]
      : undefined;
    id = newPlot(
      ws,
      gg,
      popId,
      parentPlot?.kind === 'histogram' ? 'pseudocolor' : (parentPlot?.kind ?? 'pseudocolor'),
      xy,
    ).id;
  });
  return id;
}

export function drill(popId: string) {
  const id = ensurePlot(popId);
  useStore.getState().setUi({ popId, plotId: id, selectedGateId: null });
}

/** The fields the plot-type and axis pickers edit; shared by saved plots and reference plots. */
type PlotAxes = Pick<PlotSpec, 'kind' | 'x' | 'y' | 'style'>;
type EditAxes = (label: string, fn: (p: PlotAxes, g: Group, w: Workspace) => void) => void;

/** Which of a group's plots a settings panel edits: the Gate view's, the Tiles view's, or the Plot view's grid. */
export type PlotTarget = 'gate' | 'tiles' | 'grid';

/** The group's plots of `target`; a grid cell is edited as a plot (its sample and overlays aside). */
export function plotsOf(g: Group, target: PlotTarget): PlotSpec[] {
  if (target === 'tiles') return g.tilePlots;
  if (target === 'grid') return g.grid.cells.filter((c): c is PlotCell => c !== null);
  return g.plots;
}

function editPlot(
  groupId: string,
  plotId: string,
  label: string,
  fn: (p: PlotSpec, g: Group, w: Workspace) => void,
  target: PlotTarget = 'gate',
) {
  useStore.getState().mutate(label, (w) => {
    const g = w.groups.find((x) => x.id === groupId);
    const p = g && plotsOf(g, target).find((x) => x.id === plotId);
    if (g && p) fn(p, g, w);
  });
}

/** Edits the group's plot `plotId` of `target` (the Tiles or grid plots leave the Gate view's alone). */
export const targetEdit =
  (groupId: string, plotId: string, target: PlotTarget): EditAxes =>
  (label, fn) =>
    editPlot(groupId, plotId, label, fn, target);

/** Edits the group's Tiles plot `plotId`, leaving the Gate view's plots alone. */
export const tilesEdit = (groupId: string, plotId: string): EditAxes => targetEdit(groupId, plotId, 'tiles');

/** Put `channel` on a plot's axis with that channel's default scale. */
export function setAxisChannel(edit: EditAxes, axis: 'x' | 'y', channel: string) {
  edit('Change axis channel', (p, g, w) => {
    withAxesChange(p, () => {
      p[axis] = { ...defaultAxis(w, g, channel) };
    });
  });
}

/** Changes the axis channel of the population's plot, or of `edit`'s target (for clickable axis titles). */
export function axisChannelSetter(group: Group, plot: PlotSpec, edit?: EditAxes) {
  return axisPickers(group, plot, edit).onPickChannel;
}

/**
 * Props making a plot's axis titles clickable: the x / y channel, or what a histogram's y axis shows
 * (`histNorm`), of the population's plot or of `edit`'s target.
 */
export function axisPickers(group: Group, plot: PlotSpec, edit?: EditAxes) {
  const ed: EditAxes = edit ?? ((label, fn) => editPlot(group.id, plot.id, label, fn));
  return {
    onPickChannel: (axis: 'x' | 'y', channel: string) => setAxisChannel(ed, axis, channel),
    onPickHistNorm: (norm: PlotSpec['style']['histNorm']) =>
      ed('Change histogram y axis', (p) => {
        p.style.histNorm = norm;
      }),
  };
}

/** Plot type picker; edits the population's Gate-view plot, or `edit`'s target. */
export function PlotKindSelect({
  group,
  plot,
  edit,
  label = 'Plot',
}: { group: Group; plot: PlotSpec; edit?: EditAxes; label?: string }) {
  const ed: EditAxes = edit ?? ((label, fn) => editPlot(group.id, plot.id, label, fn));
  const setKind = (k: PlotKind) =>
    ed('Change plot type', (p, g, w) => {
      withAxesChange(p, () => {
        p.kind = k;
        if (k !== 'histogram' && !p.y) {
          const other = g.channels.find((c) => c !== p.x.channel) ?? p.x.channel;
          p.y = { ...defaultAxis(w, g, other) };
        }
      });
    });
  return (
    <label className="field">
      {label}
      <select value={plot.kind} onChange={(e) => setKind(e.target.value as PlotKind)}>
        {KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** X / Y channel pickers and axis swap for the population's plot, or `edit`'s target. */
export function AxisSelects({ group, plot, edit }: { group: Group; plot: PlotSpec; edit?: EditAxes }) {
  const ws = useStore((s) => s.ws);
  const ed: EditAxes = edit ?? ((label, fn) => editPlot(group.id, plot.id, label, fn));
  const sample = groupSample(ws, group);
  const chLabel = (c: string) => {
    const s = sample?.channels.find((x) => x.pnn === c)?.pns;
    return s ? `${c} (${s})` : c;
  };
  const setChannel = (axis: 'x' | 'y', ch: string) => setAxisChannel(ed, axis, ch);
  const setScale = (axis: 'x' | 'y', k: ScaleKind) =>
    ed('Change axis scale', (p, g, w) => {
      const a = p[axis];
      if (!a) return;
      const cur = w.transforms[a.transform];
      const top = cur && 'T' in cur ? cur.T : 262144;
      a.transform = registerTransform(w, transformOfKind(k, top));
      a.range = [0, 1];
      g.axisDefaults[a.channel] = { ...a };
    });
  const scaleSelect = (axis: 'x' | 'y') => {
    const def = ws.transforms[plot[axis]?.transform ?? ''];
    if (!def) return null;
    return (
      <select
        title={`${axis.toUpperCase()} axis scale`}
        aria-label={`${axis.toUpperCase()} axis scale`}
        value={scaleKindOf(def)}
        onChange={(e) => setScale(axis, e.target.value as ScaleKind)}
      >
        {SCALE_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
    );
  };
  const is1d = plot.kind === 'histogram';
  const options = group.channels.map((c) => (
    <option key={c} value={c}>
      {chLabel(c)}
    </option>
  ));
  return (
    <>
      <label className="field">
        X
        <select value={plot.x.channel} onChange={(e) => setChannel('x', e.target.value)}>
          {options}
        </select>
        {scaleSelect('x')}
      </label>
      {!is1d && plot.y && (
        <label className="field">
          Y
          <select value={plot.y.channel} onChange={(e) => setChannel('y', e.target.value)}>
            {options}
          </select>
          {scaleSelect('y')}
        </label>
      )}
      {!is1d && plot.y && (
        <button
          type="button"
          title="Swap axes"
          onClick={() =>
            ed('Swap axes', (p) => {
              if (!p.y) return;
              withAxesChange(p, () => {
                const t = p.x;
                p.x = p.y!;
                p.y = t;
              });
            })
          }
        >
          ⇄
        </button>
      )}
    </>
  );
}

/** Gate drawing tools for a 1D or 2D plot; they act on the Gate view's plot or the Plot view's active cell. */
export function ToolButtons({ is1d }: { is1d: boolean }) {
  const tool = useStore((s) => s.ui.tool);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="seg tool-seg">
      {TOOLS.filter((t) => (is1d ? !t.twoD : !t.oneD)).map((t) => (
        <button
          type="button"
          key={t.id}
          title={t.title}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          className={tool === t.id ? 'on' : ''}
          onClick={() => setUi({ tool: t.id })}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {TOOL_ICONS[t.id]}
          </svg>
        </button>
      ))}
    </div>
  );
}

/** Whether gate edits change the group template or only the plotted sample. */
export function EditScopeToggle() {
  const editScope = useStore((s) => s.ui.editScope);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="seg" title="Whether gate edits change the group template or only this sample">
      <button
        type="button"
        className={editScope === 'template' ? 'on' : ''}
        onClick={() => setUi({ editScope: 'template' })}
      >
        Edit template
      </button>
      <button
        type="button"
        className={editScope === 'sample' ? 'on warn' : ''}
        onClick={() => setUi({ editScope: 'sample' })}
      >
        This sample only
      </button>
    </div>
  );
}

/** The Gate view's plot, for the export card beside it. */
const gatePlotHandle: { current: PlotHandle | null } = { current: null };

/** Card above the population tree: export the Gate view's plot. */
export function GateExportCard() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup();
  const plot = usePlotForPopulation();
  if (!group || !plot) return null;
  const sampleId = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];
  const name = ws.samples[sampleId ?? '']?.fileName ?? 'plot';
  return (
    <ExportMenu
      className="side-export"
      onExport={(format, dpi) =>
        gatePlotHandle.current ? exportPlot(gatePlotHandle.current, plot, format, name, dpi) : undefined
      }
    />
  );
}

/** The Gate view's gating tools, above its plot and side column (as in the Plot view). */
export function GateToolbar() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  if (!group || !plot) return null;
  return (
    <div className="toolbar" role="toolbar" aria-label="Gating tools">
      <ToolButtons is1d={plot.kind === 'histogram'} />
      <EditScopeToggle />
    </div>
  );
}

export function PlotPanel() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup();
  const plot = usePlotForPopulation();
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);

  if (!group) return <div className="empty">Select or add a group.</div>;
  const sampleId = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];
  if (!sampleId) return <div className="empty">This group has no samples.</div>;
  if (!plot) {
    return (
      <div className="empty">
        <button type="button" onClick={() => drill(ui.popId)}>
          Create a plot for this population
        </button>
      </div>
    );
  }
  return (
    <div className="plot-panel">
      <div className="plot-box" ref={box}>
        {size.width > 0 && (
          <PlotCanvas
            ref={gatePlotHandle}
            ws={ws}
            group={group}
            sampleId={sampleId}
            plot={plot}
            width={Math.min(size.width, size.height + 120)}
            height={Math.min(size.height, size.width)}
            interactive
            onDrill={drill}
            {...axisPickers(group, plot)}
          />
        )}
      </div>
    </div>
  );
}
