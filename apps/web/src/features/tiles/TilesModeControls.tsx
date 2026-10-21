import type { PlotSpec } from '@flowmeris/model';
import { useStore } from '../../state/store.ts';

/**
 * The Tiles toolbar's mode controls: tile by samples or by channels; in Channels mode, which axis is
 * fixed and on which channel. Picking a channel on a tile's axis title fixes that axis (ChannelTiles).
 */
export function TilesModeControls({ plot }: { plot: PlotSpec }) {
  const mode = useStore((s) => s.views.tilesMode);
  const fixed = useStore((s) => s.views.tilesFixedAxis);
  const setViews = useStore((s) => s.setViews);
  const is1d = plot.kind === 'histogram' || !plot.y;
  return (
    <>
      <div className="seg" title="Tile the plot over the samples, or one sample's plot over its channels">
        <button
          type="button"
          className={mode === 'samples' ? 'on' : ''}
          onClick={() => setViews({ tilesMode: 'samples' })}
        >
          Samples
        </button>
        <button
          type="button"
          className={mode === 'channels' ? 'on' : ''}
          onClick={() => setViews({ tilesMode: 'channels' })}
        >
          Channels
        </button>
      </div>
      {mode === 'channels' && !is1d && (
        <span
          className="tiles-fixed"
          title="Click a tile's axis title and pick a channel to fix that axis on it"
        >
          {fixed.toUpperCase()} fixed: {plot[fixed]?.channel}
        </span>
      )}
    </>
  );
}
