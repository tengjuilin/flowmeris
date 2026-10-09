import type { Group, PlotCell, PlotKind, PlotSpec, Workspace } from '@flowmeris/model';
import { newId, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultAxis, defaultChannels } from '../lib/axisDefaults.ts';
import type { PlotHandle } from '../lib/export/plot.ts';
import { TILE_FIGURE, TILE_STYLE } from '../lib/figure.ts';
import { nearestColumns } from '../lib/fitSize.ts';
import { exportPlot } from '../state/export.ts';
import { toast, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { OpenInIcon, SettingsIcon } from './Inspector.tsx';
import { type Anchor, type PickOption, PickerMenu } from './PickerMenu.tsx';
import { PlotCanvas } from './PlotCanvas.tsx';
import { EditScopeToggle, ToolButtons, axisPickers } from './PlotPanel.tsx';
import { PlotSizeSlider } from './PlotSizeSlider.tsx';
import { PopulationTree } from './PopulationTree.tsx';
import { useSize } from './hooks.ts';

const KINDS: { id: PlotKind; label: string }[] = [
  { id: 'pseudocolor', label: 'Pseudocolor' },
  { id: 'dot', label: 'Dot' },
  { id: 'density', label: 'Density' },
  { id: 'contour', label: 'Contour' },
  { id: 'histogram', label: 'Histogram' },
];

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
      style: structuredClone(TILE_STYLE),
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

/** Grid gap, and the narrowest cell offered (as for tiles), so plots keep room for their axes. */
const GAP = 8;
const MIN_CELL = 160;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 12;
/** Narrowest populations card; it spans as many cells as reach this width, or its rows' width (as in Tiles). */
const SIDE_MIN = 280;

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
        // The grid's figure options (smaller text) stay with the grid plot.
        style: { ...cell.style, figure: undefined },
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

/**
 * Open a Tiles plot of `sampleId` in the Plot view: select the grid plot already showing it (same
 * population, type and axes, pinned to that sample), else put a copy pinned to the sample in the next
 * empty cell, leaving the other grid plots as they are.
 */
export function openTileInGrid(group: Group, plot: PlotSpec, sampleId: string) {
  const same = (c: PlotCell | null): c is PlotCell =>
    !!c &&
    c.sampleId === sampleId &&
    c.population === plot.population &&
    c.kind === plot.kind &&
    c.x.channel === plot.x.channel &&
    (plot.kind === 'histogram' || c.y?.channel === plot.y?.channel);
  let id = group.grid.cells.find(same)?.id;
  if (!id) {
    const cellId = newId('cell_');
    editGrid(group.id, 'Open tile in Plot view', (g) => {
      const slot = g.grid.cells.findIndex((c) => c === null);
      const c: PlotCell = {
        id: cellId,
        population: plot.population,
        sampleId,
        overlay: [],
        kind: plot.kind,
        x: { ...plot.x },
        ...(plot.y && plot.kind !== 'histogram' ? { y: { ...plot.y } } : {}),
        // A tile drawn with the Tiles defaults leaves the cell on the grid defaults (the same).
        style:
          plot.style.figure === TILE_FIGURE
            ? structuredClone({ ...plot.style, figure: undefined })
            : structuredClone(plot.style),
      };
      if (slot >= 0) g.grid.cells[slot] = c;
      else g.grid.cells.push(c);
    });
    id = cellId;
  }
  useStore.getState().setUi({ view: 'plot', sampleId, gridCellId: id, selectedGateId: null });
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

/** The group's populations, depth first and indented, with their colours. */
function populationOptions(group: Group): PickOption[] {
  return populationsDepthFirst(group.template).map((p) => ({
    value: p.id,
    label: p.name,
    depth: populationLineage(group.template, p.id).length - 1,
    swatch: p.color,
  }));
}

function setCellPopulation(groupId: string, cellId: string, popId: string) {
  editCell(groupId, cellId, 'Change grid plot population', (c) => void (c.population = popId));
}

/** Pin a cell to `sampleId`, or let it follow the sidebar selection when there is none. */
function setCellSample(groupId: string, cellId: string, sampleId: string | undefined) {
  editCell(groupId, cellId, 'Change grid plot sample', (c) => {
    if (sampleId) c.sampleId = sampleId;
    else c.sampleId = undefined;
  });
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

/** A cell as a plot to draw; one without saved figure options is drawn with the grid (Tiles) defaults. */
function plotOf(cell: PlotCell): PlotSpec {
  return {
    id: cell.id,
    population: cell.population,
    kind: cell.kind,
    x: cell.x,
    style: cell.style.figure ? cell.style : { ...cell.style, figure: TILE_FIGURE },
    ...(cell.y ? { y: cell.y } : {}),
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
  const maxColumns = Math.max(
    MIN_COLUMNS,
    Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_CELL + GAP))),
  );
  const sizeFor = (n: number) => Math.floor((width - GAP * (n - 1)) / n);
  const columns =
    width <= 0
      ? Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, group.grid.columns))
      : group.grid.size
        ? nearestColumns(group.grid.size, sizeFor, MIN_COLUMNS, maxColumns)
        : Math.max(MIN_COLUMNS, Math.min(maxColumns, group.grid.columns));
  const active = cells.find((c) => c?.id === ui.gridCellId) ?? null;
  const activeSample = active ? cellSample(group, active, ui.sampleId) : undefined;
  const gap = GAP;
  const cellW = width > 0 ? sizeFor(columns) : 0;
  // The populations card takes the top-right cells (as in Tiles), as many as show its rows in full;
  // the plot slots flow around it.
  const sideW = Math.max(SIDE_MIN, treeWidth);
  const span = cellW > 0 ? Math.min(columns, Math.ceil((sideW + gap) / (cellW + gap))) : 1;
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
          <div className="tiles-controls">
            <PlotSizeSlider
              columns={columns}
              min={MIN_COLUMNS}
              max={maxColumns}
              sizeFor={sizeFor}
              onPick={(size) =>
                editGrid(group.id, 'Change plot size', (g) => {
                  g.grid.size = size;
                  g.grid.columns = nearestColumns(size, sizeFor, MIN_COLUMNS, maxColumns);
                })
              }
            />
            <button
              type="button"
              className="tiles-settings"
              aria-expanded={gridSettings}
              aria-label="Settings"
              title={gridSettings ? 'Hide settings' : 'Show settings'}
              onClick={() => setViews({ gridSettings: !gridSettings })}
            >
              <SettingsIcon />
            </button>
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

export function clearCellOverlay(groupId: string, cellId: string) {
  editCell(groupId, cellId, 'Clear grid plot overlay', (c) => void (c.overlay = []));
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
