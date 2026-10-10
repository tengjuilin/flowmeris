import type { Group, PlotCell, PlotKind, Workspace } from '@flowmeris/model';
import { populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditScopeToggle, PlotCanvas, ToolButtons } from '../features/plot/index.ts';
import type { PlotHandle } from '../lib/export/plot.ts';
import { type RowFit, nearestColumns, rowMaxColumns, rowPlotSize, sideSpan } from '../lib/fitSize.ts';
import { cellSample, overlayColors, plotOf } from '../lib/gridCells.ts';
import {
  addCell,
  editCell,
  openInGateView,
  removeCell,
  setCellPopulation,
  setCellSample,
} from '../state/commands/grid.ts';
import { axisPickers } from '../state/commands/plots.ts';
import { exportPlot } from '../state/export.ts';
import { mutateGroup, toast, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PopulationTree } from './PopulationTree.tsx';
import { ExportMenu } from './controls/ExportMenu.tsx';
import { useSize } from './hooks/useSize.ts';
import { type Anchor, type PickOption, PickerMenu } from './ui/PickerMenu.tsx';
import { PlotSizeSlider } from './ui/PlotSizeSlider.tsx';
import { SettingsToggle } from './ui/SettingsToggle.tsx';
import { OpenInIcon } from './ui/icons.tsx';

const KINDS: { id: PlotKind; label: string }[] = [
  { id: 'pseudocolor', label: 'Pseudocolor' },
  { id: 'dot', label: 'Dot' },
  { id: 'density', label: 'Density' },
  { id: 'contour', label: 'Contour' },
  { id: 'histogram', label: 'Histogram' },
];

/** Grid cells 8 px apart, at least 160 px wide (as tiles), so plots keep room for their axes. */
const GRID_ROW: RowFit = { gap: 8, pad: 0, minSize: 160, minColumns: 2, maxColumns: 12 };
const { minColumns: MIN_COLUMNS, maxColumns: MAX_COLUMNS } = GRID_ROW;
/** Narrowest populations card; it spans as many cells as reach this width, or its rows' width (as in Tiles). */
const SIDE_MIN = 280;

/** The group's populations, depth first and indented, with their colours. */
function populationOptions(group: Group): PickOption[] {
  return populationsDepthFirst(group.template).map((p) => ({
    value: p.id,
    label: p.name,
    depth: populationLineage(group.template, p.id).length - 1,
    swatch: p.color,
  }));
}

/** Sample choices of a cell: following the sidebar selection, then each of the group's samples. */
function sampleOptions(group: Group, sampleName: (id: string) => string, followName: string): PickOption[] {
  return [
    { value: '', label: `Follow selected (${followName})` },
    ...group.sampleIds.map((id) => ({ value: id, label: sampleName(id) })),
  ];
}

/**
 * Open a cell title's picker on press: pressing an unselected cell selects it and shows its controls
 * above the grid, which moves the title away before the click would land. Keyboard clicks still open it.
 */
function openOnPress(open: (el: HTMLElement) => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => e.button === 0 && open(e.currentTarget),
    onClick: (e: React.MouseEvent<HTMLElement>) => e.detail === 0 && open(e.currentTarget),
  };
}

/** The Plot view: a fixed grid of plots, each with its own population, sample(s), type and axes. */
export function PlotGridView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const missing = useStore((s) => s.status.missing);
  const gridSettings = useStore((s) => s.views.gridSettings);
  const setViews = useStore((s) => s.setViews);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const handle = useRef<PlotHandle>(null);
  const [treeWidth, setTreeWidth] = useState(0);
  // Delete (or Backspace) removes the selected plot, unless a gate is selected (then it removes the
  // gate), a polygon is being drawn, or the key goes to a text field or menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('input, select, textarea, [contenteditable="true"], [role="dialog"]')
      )
        return;
      const { ui: u, ws: w } = useStore.getState();
      if (u.tool !== 'select' || u.selectedGateId || !u.gridCellId) return;
      const g = w.groups.find((x) => x.id === u.groupId);
      if (!g?.grid.cells.some((c) => c?.id === u.gridCellId)) return;
      e.preventDefault();
      removeCell(g.id, u.gridCellId);
      useStore.getState().setUi({ gridCellId: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!group) return <div className="empty">Select or add a group.</div>;

  const { cells } = group.grid;
  // Cell sizes are discrete (as in Tiles): each fills the row with a whole number of cells, at least
  // MIN_CELL wide. The slider picks one; as the window changes, the number of columns changes to keep
  // the size near it.
  const maxColumns = rowMaxColumns(width, GRID_ROW);
  const sizeFor = (n: number) => rowPlotSize(width, n, GRID_ROW);
  const columns =
    width <= 0
      ? Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, group.grid.columns))
      : group.grid.size
        ? nearestColumns(group.grid.size, sizeFor, MIN_COLUMNS, maxColumns)
        : Math.max(MIN_COLUMNS, Math.min(maxColumns, group.grid.columns));
  const active = cells.find((c) => c?.id === ui.gridCellId) ?? null;
  const activeSample = active ? cellSample(group, active, ui.sampleId) : undefined;
  const { gap } = GRID_ROW;
  const cellW = width > 0 ? sizeFor(columns) : 0;
  // The populations card takes the top-right cells (as in Tiles), as many as show its rows in full;
  // the plot slots flow around it.
  const sideW = Math.max(SIDE_MIN, treeWidth);
  const span = cellW > 0 ? sideSpan(sideW, cellW, columns, GRID_ROW) : 1;
  const rows = Math.max(2, Math.ceil((cells.length + span) / columns) + 1);
  const slots = Array.from({ length: rows * columns - span }, (_, i) => cells[i] ?? null);
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
      <div className="grid-head">
        <div className="toolbar" role="toolbar" aria-label="Gating tools">
          <ToolButtons is1d={active?.kind === 'histogram'} />
          <EditScopeToggle />
          <ExportMenu
            className="side-export"
            onExport={(format, dpi) =>
              !active || !handle.current
                ? void toast('Select a plot to export it.')
                : exportPlot(
                    handle.current,
                    plotOf(active),
                    format,
                    ws.samples[activeSample ?? '']?.fileName ?? 'plot',
                    dpi,
                  )
            }
          />
          <div className="spacer" />
          <div className="view-controls">
            <PlotSizeSlider
              columns={columns}
              min={MIN_COLUMNS}
              max={maxColumns}
              sizeFor={sizeFor}
              onPick={(size) =>
                mutateGroup(group.id, 'Change plot size', (g) => {
                  g.grid.size = size;
                  g.grid.columns = nearestColumns(size, sizeFor, MIN_COLUMNS, maxColumns);
                })
              }
            />
            <SettingsToggle open={gridSettings} onToggle={() => setViews({ gridSettings: !gridSettings })} />
          </div>
        </div>
      </div>
      <div
        className="plot-grid"
        ref={box}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}
      >
        <div
          className="plot-side grid-side"
          style={{
            gridColumn: `${columns - span + 1} / span ${span}`,
            gridRow: 1,
            height: cellW || undefined,
          }}
        >
          {/* Shows the selected plot's population and sample; clicking a population sets the plot's. */}
          <PopulationTree
            popId={active?.population}
            onWidth={setTreeWidth}
            sampleId={activeSample}
            {...(active ? { onPick: (popId: string) => setCellPopulation(group.id, active.id, popId) } : {})}
          />
        </div>
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
              missing={missing}
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

/** Population and sample pickers of a grid plot, at the bottom of the Plot card of its settings panel. */
export function CellSourceFields({ group, cell }: { group: Group; cell: PlotCell }) {
  const ws = useStore((s) => s.ws);
  const selected = useStore((s) => s.ui.sampleId);
  const names = useSampleNames(group);
  const sampleName = (id: string) => names[id] ?? ws.samples[id]?.fileName ?? id;
  const sampleId = cellSample(group, cell, selected);
  const edit = (label: string, fn: (c: PlotCell) => void) => editCell(group.id, cell.id, label, fn);
  const ids = group.sampleIds;
  const step = (d: number) => {
    if (!sampleId || ids.length < 2) return;
    const next = ids[(ids.indexOf(sampleId) + d + ids.length) % ids.length]!;
    edit('Change grid plot sample', (c) => void (c.sampleId = next));
  };
  const followName = selected && ids.includes(selected) ? sampleName(selected) : '–';

  return (
    <>
      <label className="field">
        Population
        <select
          value={cell.population}
          onChange={(e) => setCellPopulation(group.id, cell.id, e.target.value)}
        >
          {populationsDepthFirst(group.template).map((p) => (
            <option key={p.id} value={p.id}>
              {'\u00a0\u00a0'.repeat(populationLineage(group.template, p.id).length - 1)}
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        Sample
        <div className="sample-step">
          <button type="button" className="icon" title="Previous sample" onClick={() => step(-1)}>
            ◀
          </button>
          <select
            aria-label="Sample"
            value={cell.sampleId ?? ''}
            onChange={(e) => setCellSample(group.id, cell.id, e.target.value || undefined)}
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
      </div>
    </>
  );
}

/** Checklist of the samples drawn over a grid plot, each in its own colour: its Sample overlay card. */
export function CellOverlayFields({ group, cell }: { group: Group; cell: PlotCell }) {
  const ws = useStore((s) => s.ws);
  const selected = useStore((s) => s.ui.sampleId);
  const names = useSampleNames(group);
  const sampleName = (id: string) => names[id] ?? ws.samples[id]?.fileName ?? id;
  const sampleId = cellSample(group, cell, selected);
  const edit = (label: string, fn: (c: PlotCell) => void) => editCell(group.id, cell.id, label, fn);
  const colors = sampleId ? overlayColors(cell, sampleId, group) : null;
  return (
    <div className="overlay-list" title="Overlay other samples on this plot, each in its own colour">
      {group.sampleIds.map((id) => {
        const isMain = id === sampleId;
        const on = isMain || cell.overlay.includes(id);
        const color = isMain ? colors?.color : colors?.samples.find((x) => x.sampleId === id)?.color;
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
            {/* Hidden while off, keeping the names aligned. */}
            <span className="swatch" style={on ? { background: color } : { visibility: 'hidden' }} />
            {sampleName(id)}
            {isMain && <span className="muted"> (plotted)</span>}
          </label>
        );
      })}
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
  const selected = useStore((s) => s.ui.sampleId);
  const [menu, setMenu] = useState<{ kind: 'population' | 'sample'; anchor: Anchor } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const followName = selected && group.sampleIds.includes(selected) ? sampleName(selected) : '–';
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
          className="link cell-pop"
          title={`${pop?.name ?? 'All events'}: change the population this plot shows`}
          aria-haspopup="dialog"
          aria-expanded={menu?.kind === 'population'}
          {...openOnPress((el) => setMenu({ kind: 'population', anchor: el }))}
        >
          {pop?.name ?? 'All events'}
        </button>
        <span className="muted"> – </span>
        {sampleId ? (
          <button
            type="button"
            className="link cell-sample"
            title={`${sampleName(sampleId)}: change the sample this plot shows`}
            aria-haspopup="dialog"
            aria-expanded={menu?.kind === 'sample'}
            {...openOnPress((el) => setMenu({ kind: 'sample', anchor: el }))}
          >
            {sampleName(sampleId)}
          </button>
        ) : (
          <span className="muted">no samples</span>
        )}
        {menu?.kind === 'population' && (
          <PickerMenu
            anchor={menu.anchor}
            title="Population"
            options={populationOptions(group)}
            value={cell.population}
            onPick={(id) => setCellPopulation(group.id, cell.id, id)}
            onClose={closeMenu}
          />
        )}
        {menu?.kind === 'sample' && (
          <PickerMenu
            anchor={menu.anchor}
            title="Sample"
            options={sampleOptions(group, sampleName, followName)}
            value={cell.sampleId ?? ''}
            onPick={(id) => setCellSample(group.id, cell.id, id || undefined)}
            onClose={closeMenu}
          />
        )}
        {!cell.sampleId && (
          <span className="badge" title="Follows the sample selected in the sidebar">
            follows
          </span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="icon labeled"
          title="Open in the Gate view"
          aria-label="Open this plot in the Gate view"
          onClick={() => openInGateView(group, cell, sampleId)}
        >
          <OpenInIcon />
          Gate
        </button>
        <button
          type="button"
          className="icon labeled"
          title="Open in the Tiles view"
          aria-label="Open this plot in the Tiles view"
          onClick={() => useStore.getState().setUi({ view: 'tiles', ...(sampleId ? { sampleId } : {}) })}
        >
          <OpenInIcon />
          Tiles
        </button>
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
              hideOffScaleNote
              interactive={active}
              onDrill={onDrill}
              {...axisPickers(group, plotOf(cell), (label, fn) => editCell(group.id, cell.id, label, fn))}
              {...(overlaying && overlay ? { overlay } : {})}
            />
          )
        )}
      </div>
    </div>
  );
}
