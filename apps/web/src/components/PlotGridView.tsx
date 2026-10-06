import type { Group, PlotCell, PlotKind, PlotSpec, Workspace } from '@flowmeris/model';
import { newId, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { useRef } from 'react';
import { DEFAULT_STYLE, defaultAxis, defaultChannels } from '../lib/defaults.ts';
import { exportPlot } from '../lib/exportPlot.ts';
import { useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PlotCanvas, type PlotHandle } from './PlotCanvas.tsx';
import { AxisSelects, EditScopeToggle, PlotKindSelect, ToolButtons } from './PlotPanel.tsx';
import { useSize } from './hooks.ts';

const KINDS: { id: PlotKind; label: string }[] = [
  { id: 'pseudocolor', label: 'Pseudocolor' },
  { id: 'dot', label: 'Dot' },
  { id: 'density', label: 'Density' },
  { id: 'contour', label: 'Contour' },
  { id: 'histogram', label: 'Histogram' },
];

/** Below this cell width plots drop their axes. */
const COMPACT_BELOW = 240;

function editGrid(groupId: string, label: string, fn: (g: Group, w: Workspace) => void) {
  useStore.getState().mutate(label, (w) => {
    const g = w.groups.find((x) => x.id === groupId);
    if (g) fn(g, w);
  });
}

function editCell(
  groupId: string,
  cellId: string,
  label: string,
  fn: (c: PlotCell, g: Group, w: Workspace) => void,
) {
  editGrid(groupId, label, (g, w) => {
    const c = g.grid.cells.find((x) => x?.id === cellId);
    if (c) fn(c, g, w);
  });
}

/** Put a new plot into cell `slot`; its axes are `xy`, or the group's default channels. */
function addCell(groupId: string, slot: number, kind: PlotKind, population: string, xy?: [string, string?]) {
  let id = '';
  editGrid(groupId, 'Add plot to grid', (g, w) => {
    const [dx, dy] = defaultChannels(w, g);
    const xc = xy?.[0] ?? dx;
    const yc = xy?.[1] ?? (dy === xc ? dx : dy);
    const c: PlotCell = {
      id: newId('cell_'),
      population: g.template.populations[population] ? population : 'root',
      overlay: [],
      kind,
      x: { ...defaultAxis(w, g, xc) },
      style: { ...DEFAULT_STYLE },
    };
    if (kind !== 'histogram') c.y = { ...defaultAxis(w, g, yc) };
    while (g.grid.cells.length < slot) g.grid.cells.push(null);
    g.grid.cells[slot] = c;
    id = c.id;
  });
  if (id) useStore.getState().setUi({ gridCellId: id });
}

function removeCell(groupId: string, cellId: string) {
  editGrid(groupId, 'Remove plot from grid', (g) => {
    const cells = g.grid.cells.map((c) => (c?.id === cellId ? null : c));
    while (cells.length && cells[cells.length - 1] === null) cells.pop();
    g.grid.cells = cells;
  });
}

/** Open a cell's population, sample and axes in the Gate view, reusing a matching saved plot. */
function openInGateView(group: Group, cell: PlotCell, sampleId: string | undefined) {
  const same = (p: PlotSpec) =>
    p.population === cell.population &&
    p.kind === cell.kind &&
    p.x.channel === cell.x.channel &&
    (cell.kind === 'histogram' || p.y?.channel === cell.y?.channel);
  let plotId = group.plots.find(same)?.id;
  if (!plotId) {
    const id = newId('plt_');
    editGrid(group.id, 'Open grid plot in Gate view', (g) => {
      g.plots.push({
        id,
        population: cell.population,
        kind: cell.kind,
        x: { ...cell.x },
        ...(cell.y ? { y: { ...cell.y } } : {}),
        style: { ...cell.style },
      });
    });
    plotId = id;
  }
  useStore.getState().setUi({
    view: 'gate',
    popId: cell.population,
    plotId,
    selectedGateId: null,
    ...(sampleId ? { sampleId } : {}),
  });
}

/** The sample a cell gates and shows: its pinned sample, else the selected one. */
function cellSample(group: Group, cell: PlotCell, selected: string | null): string | undefined {
  if (cell.sampleId && group.sampleIds.includes(cell.sampleId)) return cell.sampleId;
  return selected && group.sampleIds.includes(selected) ? selected : group.sampleIds[0];
}

/** Colours of a cell's samples: the plotted sample first, then the overlays in order. */
function overlayColors(cell: PlotCell, sampleId: string, group: Group) {
  const others = cell.overlay.filter((id) => id !== sampleId && group.sampleIds.includes(id));
  const color = (i: number) => CATEGORICAL[i % CATEGORICAL.length]!;
  return { color: color(0), samples: others.map((id, i) => ({ sampleId: id, color: color(i + 1) })) };
}

function plotOf(cell: PlotCell): PlotSpec {
  return {
    id: cell.id,
    population: cell.population,
    kind: cell.kind,
    x: cell.x,
    style: cell.style,
    ...(cell.y ? { y: cell.y } : {}),
  };
}

/** The Plot view: a fixed grid of plots, each with its own population, sample(s), type and axes. */
export function PlotGridView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const handle = useRef<PlotHandle>(null);
  if (!group) return <div className="empty">Select or add a group.</div>;

  const { columns, cells } = group.grid;
  const rows = Math.max(2, Math.ceil(cells.length / columns) + 1);
  const slots = Array.from({ length: rows * columns }, (_, i) => cells[i] ?? null);
  const active = cells.find((c) => c?.id === ui.gridCellId) ?? null;
  const activeSample = active ? cellSample(group, active, ui.sampleId) : undefined;
  const gap = 8;
  const cellW = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;
  const sampleName = (id: string) => names[id] ?? ws.samples[id]?.fileName ?? id;

  const onDrill = (popId: string) => {
    // Double-clicking a gate shows its population in the next empty cell, keeping the parent in view.
    const src = active;
    const slot = group.grid.cells.findIndex((c) => c === null);
    const at = slot >= 0 ? slot : group.grid.cells.length;
    const xy: [string, string?] | undefined = src ? [src.x.channel, src.y?.channel] : undefined;
    addCell(group.id, at, src?.kind ?? 'pseudocolor', popId, xy);
  };

  return (
    <div className="grid-view">
      <div className="toolbar" role="toolbar" aria-label="Gating tools">
        <ToolButtons is1d={active?.kind === 'histogram'} />
        <EditScopeToggle />
        <div className="spacer" />
        <label className="field">
          Columns
          <select
            value={columns}
            onChange={(e) =>
              editGrid(group.id, 'Change grid columns', (g) => void (g.grid.columns = Number(e.target.value)))
            }
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {active ? (
        <CellControls
          group={group}
          cell={active}
          sampleId={activeSample}
          sampleName={sampleName}
          onExport={(fmt) =>
            handle.current &&
            void exportPlot(
              handle.current,
              plotOf(active),
              fmt,
              ws.samples[activeSample ?? '']?.fileName ?? 'plot',
            )
          }
        />
      ) : (
        <p className="muted small grid-hint">
          Add a plot to an empty cell, then click a plot to select it: gate on it with the tools above and
          change its population, sample, overlays, type and axes here.
        </p>
      )}
      <div
        className="plot-grid"
        ref={box}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}
      >
        {slots.map((cell, i) =>
          cell ? (
            <GridCell
              key={cell.id}
              ws={ws}
              group={group}
              cell={cell}
              size={cellW}
              active={cell.id === active?.id}
              sampleId={cellSample(group, cell, ui.sampleId)}
              sampleName={sampleName}
              missing={ui.missing}
              onActivate={() => cell.id !== ui.gridCellId && setUi({ gridCellId: cell.id })}
              onDrill={onDrill}
              handle={cell.id === active?.id ? handle : undefined}
            />
          ) : (
            <div key={`empty${i}`} className="grid-cell empty-cell" style={{ height: cellW || undefined }}>
              <span className="muted small">Add plot</span>
              <div className="add-kinds">
                {KINDS.map((k) => (
                  <button
                    type="button"
                    key={k.id}
                    onClick={() => addCell(group.id, i, k.id, ui.popId)}
                    title={`Add a ${k.label.toLowerCase()} plot of the current population`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Population, sample, overlay, plot type and axis controls of the active cell. */
function CellControls({
  group,
  cell,
  sampleId,
  sampleName,
  onExport,
}: {
  group: Group;
  cell: PlotCell;
  sampleId: string | undefined;
  sampleName: (id: string) => string;
  onExport: (fmt: 'svg' | 'png') => void;
}) {
  const selected = useStore((s) => s.ui.sampleId);
  const edit = (label: string, fn: (c: PlotCell, g: Group, w: Workspace) => void) =>
    editCell(group.id, cell.id, label, fn);
  const plot = plotOf(cell);
  const ids = group.sampleIds;
  const step = (d: number) => {
    if (!sampleId || ids.length < 2) return;
    const next = ids[(ids.indexOf(sampleId) + d + ids.length) % ids.length]!;
    edit('Change grid plot sample', (c) => void (c.sampleId = next));
  };
  const colors = sampleId ? overlayColors(cell, sampleId, group) : null;
  const followName = selected && ids.includes(selected) ? sampleName(selected) : '–';

  return (
    <div className="cell-controls">
      <label className="field">
        Population
        <select
          value={cell.population}
          onChange={(e) => edit('Change grid plot population', (c) => void (c.population = e.target.value))}
        >
          {populationsDepthFirst(group.template).map((p) => (
            <option key={p.id} value={p.id}>
              {'  '.repeat(populationLineage(group.template, p.id).length - 1)}
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field sample-step">
        Sample
        <button type="button" className="icon" title="Previous sample" onClick={() => step(-1)}>
          ◀
        </button>
        <select
          value={cell.sampleId ?? ''}
          onChange={(e) =>
            edit('Change grid plot sample', (c) => {
              if (e.target.value) c.sampleId = e.target.value;
              else c.sampleId = undefined;
            })
          }
        >
          <option value="">Follow selected ({followName})</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {sampleName(id)}
            </option>
          ))}
        </select>
        <button type="button" className="icon" title="Next sample" onClick={() => step(1)}>
          ▶
        </button>
      </div>
      <details className="overlay-picker">
        <summary title="Overlay other samples on this plot, each in its own colour">
          Overlay{colors?.samples.length ? ` (${colors.samples.length})` : ''}
        </summary>
        <div className="overlay-menu">
          {ids.map((id) => {
            const isMain = id === sampleId;
            const on = isMain || cell.overlay.includes(id);
            const color = isMain ? colors?.color : colors?.samples.find((s) => s.sampleId === id)?.color;
            return (
              <label key={id} className="field check">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isMain}
                  onChange={(e) =>
                    edit('Change grid plot overlay', (c) => {
                      c.overlay = e.target.checked ? [...c.overlay, id] : c.overlay.filter((x) => x !== id);
                    })
                  }
                />
                <span className="swatch" style={{ background: on ? color : 'transparent' }} />
                {sampleName(id)}
                {isMain && <span className="muted"> (plotted)</span>}
              </label>
            );
          })}
          {cell.overlay.length > 0 && (
            <button
              type="button"
              className="link"
              onClick={() => edit('Clear grid plot overlay', (c) => void (c.overlay = []))}
            >
              Clear overlay
            </button>
          )}
        </div>
      </details>
      <PlotKindSelect group={group} plot={plot} edit={edit} />
      <AxisSelects group={group} plot={plot} edit={edit} />
      <div className="spacer" />
      <button
        type="button"
        onClick={() => openInGateView(group, cell, cell.sampleId)}
        title="Open this plot in the Gate view"
      >
        Open in Gate view
      </button>
      <div className="seg">
        <button type="button" onClick={() => onExport('svg')}>
          SVG
        </button>
        <button type="button" onClick={() => onExport('png')}>
          PNG
        </button>
      </div>
      <button
        type="button"
        className="icon"
        title="Remove this plot from the grid"
        onClick={() => removeCell(group.id, cell.id)}
      >
        ✕
      </button>
    </div>
  );
}

function GridCell({
  ws,
  group,
  cell,
  size,
  active,
  sampleId,
  sampleName,
  missing,
  onActivate,
  onDrill,
  handle,
}: {
  ws: Workspace;
  group: Group;
  cell: PlotCell;
  size: number;
  active: boolean;
  sampleId: string | undefined;
  sampleName: (id: string) => string;
  missing: Record<string, true>;
  onActivate: () => void;
  onDrill: (popId: string) => void;
  handle: React.RefObject<PlotHandle> | undefined;
}) {
  const pop = group.template.populations[cell.population];
  const overlay = sampleId ? overlayColors(cell, sampleId, group) : null;
  const overlaying = !!overlay && overlay.samples.length > 0;
  const titleH = overlaying ? 44 : 26;
  const side = Math.max(0, Math.min(size, size - titleH));
  return (
    <div
      className={`grid-cell${active ? ' on' : ''}`}
      style={{ height: size || undefined }}
      onPointerDownCapture={onActivate}
    >
      <div className="cell-title">
        <button
          type="button"
          className="link"
          title="Open this plot in the Gate view"
          onClick={() => openInGateView(group, cell, cell.sampleId)}
        >
          {pop?.name ?? 'All events'}
        </button>
        <span className="muted"> – {sampleId ? sampleName(sampleId) : 'no samples'}</span>
        {!cell.sampleId && (
          <span className="badge" title="Follows the sample selected in the sidebar">
            follows
          </span>
        )}
      </div>
      {overlaying && overlay && sampleId && (
        <div className="cell-legend">
          {[{ sampleId, color: overlay.color }, ...overlay.samples].map((o) => (
            <span key={o.sampleId} title={sampleName(o.sampleId)}>
              <span className="swatch" style={{ background: o.color }} />
              {sampleName(o.sampleId)}
              {missing[o.sampleId] && ' (missing)'}
            </span>
          ))}
        </div>
      )}
      <div className="cell-plot">
        {!sampleId ? (
          <div className="empty small">This group has no samples.</div>
        ) : (
          side > 0 && (
            <PlotCanvas
              ref={handle}
              ws={ws}
              group={group}
              sampleId={sampleId}
              plot={plotOf(cell)}
              width={side}
              height={side}
              compact={size < COMPACT_BELOW}
              hideOffScaleNote
              interactive={active}
              onDrill={onDrill}
              {...(overlaying && overlay ? { overlay } : {})}
            />
          )
        )}
      </div>
    </div>
  );
}
