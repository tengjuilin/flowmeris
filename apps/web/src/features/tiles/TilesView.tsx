import type { Group, PlotSpec } from '@flowmeris/model';
import { useMemo, useRef, useState } from 'react';
import { useSettled } from '../../components/hooks/useSettled.ts';
import { useSize } from '../../components/hooks/useSize.ts';
import { PlotSizeSlider } from '../../components/ui/PlotSizeSlider.tsx';
import { SettingsToggle } from '../../components/ui/SettingsToggle.tsx';
import { TILE_FIGURE } from '../../lib/figure.ts';
import { type RowFit, nearestColumns, rowMaxColumns, rowPlotSize, sideSpan } from '../../lib/fitSize.ts';
import { useGroup, useStore } from '../../state/store.ts';
import { EditScopeToggle, ToolButtons, useTilePlot } from '../plot/index.ts';
import { PopulationTree } from '../tree/index.ts';
import { ChannelTiles } from './ChannelTiles.tsx';
import { SampleTiles } from './SampleTiles.tsx';
import { TilesModeControls } from './TilesModeControls.tsx';

/**
 * Tiles in a row: 12 px apart, each 10 px wider than its plot (padding and border), at least 160 px.
 * The populations card is at least SIDE_MIN wide (it spans as many tile columns as reach it).
 */
const TILES_ROW: RowFit = { gap: 12, pad: 10, minSize: 160, minColumns: 2, maxColumns: 12 };
const SIDE_MIN = 280;

export function TilesView() {
  const group = useGroup();
  const saved = useTilePlot(group);
  if (!group || !saved)
    return (
      <div className="empty">Open a population first; tiles show its plot for every sample in the group.</div>
    );
  return <Tiles group={group} saved={saved} />;
}

function Tiles({ group, saved }: { group: Group; saved: PlotSpec }) {
  // A Tiles plot without saved figure options is drawn with the Tiles defaults.
  const plot = useMemo(
    () => (!saved.style.figure ? { ...saved, style: { ...saved.style, figure: TILE_FIGURE } } : saved),
    [saved],
  );
  const mode = useStore((s) => s.views.tilesMode);
  const settingsOpen = useStore((s) => s.views.tilesSettings);
  const setViews = useStore((s) => s.setViews);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  // Tile sizes are discrete: each fills a full-width row (below the populations card) with a whole
  // number of tiles. The slider picks one; as the window changes, the number per row changes to keep
  // the size near it.
  const { minColumns, minSize } = TILES_ROW;
  const maxColumns = rowMaxColumns(width, TILES_ROW);
  const picked = useStore((s) => s.views.tilesPlotSize);
  const sizeFor = (n: number) => rowPlotSize(width, n, TILES_ROW);
  const columns = width > 0 ? nearestColumns(picked, sizeFor, minColumns, maxColumns) : minColumns;
  const tile = width > 0 ? Math.max(minSize, sizeFor(columns)) : 0;
  // The populations card takes the top-right columns (as in the Plot view): as many as show its rows in
  // full, and at least SIDE_MIN.
  const [treeWidth, setTreeWidth] = useState(0);
  const sideW = Math.max(SIDE_MIN, treeWidth);
  const span = tile > 0 ? sideSpan(sideW, tile, columns, TILES_ROW) : 1;
  // Tiles resize live; their plots are recomputed at the new size once the slider settles.
  const renderSize = useSettled(tile, 150);
  const Shown = mode === 'channels' ? ChannelTiles : SampleTiles;
  return (
    <div className="tiles-view">
      <div className="toolbar">
        <ToolButtons is1d={plot.kind === 'histogram'} />
        <EditScopeToggle />
        <TilesModeControls group={group} plot={plot} />
        <div className="spacer" />
        <div className="view-controls">
          <PlotSizeSlider
            columns={columns}
            min={minColumns}
            max={maxColumns}
            sizeFor={sizeFor}
            onPick={(tilesPlotSize) => setViews({ tilesPlotSize })}
          />
          <SettingsToggle open={settingsOpen} onToggle={() => setViews({ tilesSettings: !settingsOpen })} />
        </div>
      </div>
      <div className="tiles" ref={box}>
        <div
          className="tiles-grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${tile > 0 ? `${tile + 10}px` : 'minmax(0, 1fr)'})`,
          }}
        >
          {/* Stretched to the height of the first row of tiles; the tiles fill the cells around it. */}
          <div
            className="plot-side tiles-side"
            style={{
              gridColumn: `${columns - span + 1} / span ${span}`,
              gridRow: 1,
              minHeight: tile || undefined,
            }}
          >
            <PopulationTree onWidth={setTreeWidth} />
          </div>
          <Shown
            group={group}
            plot={plot}
            size={tile}
            renderSize={renderSize || tile}
            emptySpan={Math.max(1, columns - span)}
          />
        </div>
      </div>
    </div>
  );
}
