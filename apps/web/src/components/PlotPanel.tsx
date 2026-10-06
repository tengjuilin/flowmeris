import type { PlotKind, PlotSpec } from '@flowmeris/model';
import { useRef } from 'react';
import { defaultAxis, newPlot } from '../lib/defaults.ts';
import { exportPlot } from '../lib/exportPlot.ts';
import { type Tool, useGroup, useStore } from '../state/store.ts';
import { PlotCanvas, type PlotHandle } from './PlotCanvas.tsx';
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
];

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

export function PlotPanel() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  const plot = usePlotForPopulation();
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const handle = useRef<PlotHandle>(null);

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
  const is1d = plot.kind === 'histogram';
  const channels = group.channels;
  const sample = ws.samples[sampleId];
  const chLabel = (c: string) => {
    const s = sample?.channels.find((x) => x.pnn === c)?.pns;
    return s ? `${c} (${s})` : c;
  };

  const updatePlot = (label: string, fn: (p: PlotSpec) => void) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const p = g.plots.find((x) => x.id === plot.id);
      if (p) fn(p);
    });

  const setChannel = (axis: 'x' | 'y', ch: string) =>
    mutate('Change axis channel', (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const p = g.plots.find((x) => x.id === plot.id)!;
      p[axis] = { ...defaultAxis(w, g, ch) };
    });

  const setKind = (k: PlotKind) =>
    mutate('Change plot type', (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const p = g.plots.find((x) => x.id === plot.id)!;
      p.kind = k;
      if (k !== 'histogram' && !p.y) {
        const other = g.channels.find((c) => c !== p.x.channel) ?? p.x.channel;
        p.y = { ...defaultAxis(w, g, other) };
      }
    });

  const tools = TOOLS.filter((t) => (is1d ? !t.twoD : !t.oneD));

  return (
    <div className="plot-panel">
      <div className="toolbar" role="toolbar" aria-label="Gating tools">
        <div className="seg">
          {tools.map((t) => (
            <button
              type="button"
              key={t.id}
              title={t.title}
              aria-pressed={ui.tool === t.id}
              className={ui.tool === t.id ? 'on' : ''}
              onClick={() => setUi({ tool: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="field">
          Plot
          <select value={plot.kind} onChange={(e) => setKind(e.target.value as PlotKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" title="Whether gate edits change the group template or only this sample">
          <button
            type="button"
            className={ui.editScope === 'template' ? 'on' : ''}
            onClick={() => setUi({ editScope: 'template' })}
          >
            Edit template
          </button>
          <button
            type="button"
            className={ui.editScope === 'sample' ? 'on warn' : ''}
            onClick={() => setUi({ editScope: 'sample' })}
          >
            This sample only
          </button>
        </div>
        <div className="spacer" />
        <div className="seg">
          <button
            type="button"
            onClick={() =>
              handle.current && void exportPlot(handle.current, plot, 'svg', `${sample?.fileName ?? 'plot'}`)
            }
          >
            SVG
          </button>
          <button
            type="button"
            onClick={() =>
              handle.current && void exportPlot(handle.current, plot, 'png', `${sample?.fileName ?? 'plot'}`)
            }
          >
            PNG
          </button>
        </div>
      </div>
      <div className="axis-pickers">
        <label className="field">
          X
          <select value={plot.x.channel} onChange={(e) => setChannel('x', e.target.value)}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {chLabel(c)}
              </option>
            ))}
          </select>
        </label>
        {!is1d && plot.y && (
          <label className="field">
            Y
            <select value={plot.y.channel} onChange={(e) => setChannel('y', e.target.value)}>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {chLabel(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!is1d && plot.y && (
          <button
            type="button"
            title="Swap axes"
            onClick={() =>
              updatePlot('Swap axes', (p) => {
                if (!p.y) return;
                const t = p.x;
                p.x = p.y;
                p.y = t;
              })
            }
          >
            ⇄
          </button>
        )}
        <span className="muted">
          {sample?.fileName} · {sample?.eventCount.toLocaleString()} events
        </span>
      </div>
      <div className="plot-box" ref={box}>
        {size.width > 0 && (
          <PlotCanvas
            ref={handle}
            ws={ws}
            group={group}
            sampleId={sampleId}
            plot={plot}
            width={Math.min(size.width, size.height + 120)}
            height={Math.min(size.height, size.width)}
            interactive
            onDrill={drill}
          />
        )}
      </div>
    </div>
  );
}
