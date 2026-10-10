import type { PlotKind } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { ExportMenu } from '../../components/controls/ExportMenu.tsx';
import { useSize } from '../../components/hooks/useSize.ts';
import { PlotSizeSlider } from '../../components/ui/PlotSizeSlider.tsx';
import { SettingsToggle } from '../../components/ui/SettingsToggle.tsx';
import type { PlotHandle } from '../../lib/export/plot.ts';
import { type RowFit, nearestColumns, rowMaxColumns, rowPlotSize, sideSpan } from '../../lib/fitSize.ts';
import { cellSample, plotOf } from '../../lib/gridCells.ts';
import { addCell, removeCell, setCellPopulation } from '../../state/commands/grid.ts';
import { exportPlot } from '../../state/export.ts';
import { mutateGroup, toast, useGroup, useSampleNames, useStore } from '../../state/store.ts';
import { EditScopeToggle, ToolButtons } from '../plot/index.ts';
import { PopulationTree } from '../tree/index.ts';
import { GridCell } from './GridCell.tsx';

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
                    activeSample,
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
