import type { Group, PlotSpec } from '@flowmeris/model';
import { memo } from 'react';
import { openTileInGrid } from '../../state/commands/grid.ts';
import { axisPickers, tilesEdit } from '../../state/commands/plots.ts';
import { useSampleNames, useSelectedSampleIds, useStore } from '../../state/store.ts';
import { Tile, TileButton } from './Tile.tsx';

export interface TileListProps {
  group: Group;
  /** The Tiles plot, with the Tiles figure defaults when it has none of its own. */
  plot: PlotSpec;
  /** The tiles' live size, 0 until the view is measured, and the size their plots are drawn at. */
  size: number;
  renderSize: number;
  /** Grid columns left of the populations card, for a message in the first row. */
  emptySpan: number;
}

/** The Samples mode of the Tiles view: the plot for every sample checked in the sidebar. */
export function SampleTiles({ group, plot, size, renderSize, emptySpan }: TileListProps) {
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  if (shown.length === 0)
    return (
      <div className="empty" style={{ gridColumn: `1 / span ${emptySpan}`, gridRow: 1 }}>
        No samples selected: check some in the sidebar.
      </div>
    );
  if (size <= 0) return null;
  return shown.map((id) => (
    <SampleTile
      key={id}
      group={group}
      sampleId={id}
      plot={plot}
      size={size}
      renderSize={renderSize}
      name={names[id] ?? id}
    />
  ));
}

const SampleTile = memo(function SampleTile({
  group,
  sampleId,
  plot,
  size,
  renderSize,
  name,
}: { group: Group; sampleId: string; plot: PlotSpec; size: number; renderSize: number; name: string }) {
  const ws = useStore((s) => s.ws);
  const current = useStore((s) => s.ui.sampleId === sampleId);
  const setUi = useStore((s) => s.setUi);
  const setViews = useStore((s) => s.setViews);
  const ov = group.overrides.some((o) => o.sampleId === sampleId);
  return (
    <Tile
      ws={ws}
      group={group}
      sampleId={sampleId}
      plot={plot}
      {...axisPickers(group, plot, tilesEdit(group.id, plot.id))}
      name={name}
      hint={ws.samples[sampleId]?.relativePath}
      badge={ov && <span className="badge warn">override</span>}
      // Selecting a tile makes it the gated sample; the tools then act on it as in the Gate view.
      current={current}
      onSelect={() => setUi({ sampleId, selectedGateId: null })}
      size={size}
      renderSize={renderSize}
      buttons={
        <>
          <TileButton
            label="Gate"
            title="Open in the Gate view"
            ariaLabel={`Open ${name} in the Gate view`}
            onClick={() => setUi({ sampleId, view: 'gate' })}
          />
          <TileButton
            label="Plot"
            title="Open in the Plot view (as a new plot unless it is already there)"
            ariaLabel={`Open ${name} in the Plot view`}
            onClick={() => openTileInGrid(group, plot, sampleId)}
          />
          <TileButton
            label="Channels"
            title="Tile this sample's plot over its channels"
            ariaLabel={`Tile ${name} by channel`}
            onClick={() => setViews({ tilesMode: 'channels' })}
          />
        </>
      }
    />
  );
});
