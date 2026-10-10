import type { Group, PlotCell, Workspace } from '@flowmeris/model';
import { populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useCallback, useState } from 'react';
import { type Anchor, type PickOption, PickerMenu } from '../../components/ui/PickerMenu.tsx';
import { OpenInIcon } from '../../components/ui/icons.tsx';
import type { PlotHandle } from '../../lib/export/plot.ts';
import { overlayColors, plotOf } from '../../lib/gridCells.ts';
import {
  editCell,
  openInGateView,
  openInTilesView,
  setCellPopulation,
  setCellSample,
} from '../../state/commands/grid.ts';
import { axisPickers } from '../../state/commands/plots.ts';
import { useStore } from '../../state/store.ts';
import { PlotCanvas } from '../plot/index.ts';

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

/**
 * One plot of the grid: its title (population and sample pickers, open in Gate or Tiles; dragged to move
 * the plot), legend and plot.
 */
export function GridCell({
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
  extraClass = '',
  slotProps,
  titleProps,
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
  /** More classes of the cell (cut, dragged, drop target). */
  extraClass?: string;
  /** Props of the cell as a drop target, and of its title as a drag handle (useGridDrag). */
  slotProps?: React.HTMLAttributes<HTMLDivElement>;
  titleProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
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
      {...slotProps}
      className={`grid-cell${active ? ' on' : ''}${extraClass}`}
      style={{ height: size || undefined }}
      onPointerDownCapture={onActivate}
    >
      <div className="cell-title" title="Drag to move this plot" {...titleProps}>
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
          onClick={() => openInTilesView(group, cell, sampleId, sampleId && sampleName(sampleId))}
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
