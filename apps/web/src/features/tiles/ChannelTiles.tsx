import type { Group, PlotSpec } from '@flowmeris/model';
import { memo, useCallback, useMemo, useState } from 'react';
import { type TileAxis, channelTilePlots, tileChannels, variedAxis } from '../../lib/tileChannels.ts';
import { openTileInGrid } from '../../state/commands/grid.ts';
import { axisPickers, openTileInGate, setAxisChannel, tilesEdit } from '../../state/commands/plots.ts';
import { useSelectedSampleIds, useStore } from '../../state/store.ts';
import { useRegisterBuilt } from '../plot/index.ts';
import type { TileListProps } from './SampleTiles.tsx';
import { Tile, TileButton } from './Tile.tsx';

/** The axis titles a Channels tile lets the user pick a channel for: both, none for a histogram. */
const BOTH: readonly TileAxis[] = ['x', 'y'];
const NONE: readonly TileAxis[] = [];

/**
 * The sample the Channels mode shows: the one selected in the sidebar when it is in the group, else the
 * first one checked there, else the group's first.
 */
export function useChannelSample(group: Group): string | null {
  const selected = useStore((s) => s.ui.sampleId);
  const shown = useSelectedSampleIds(group);
  if (selected && group.sampleIds.includes(selected)) return selected;
  return shown[0] ?? group.sampleIds[0] ?? null;
}

/**
 * The Channels mode of the Tiles view: one sample's plot with one axis kept (`views.tilesFixedAxis`) and
 * the other going through the sample's channels (lib/tileChannels.ts). Gates are drawn on the selected
 * tile as in the Gate view, on that tile's channels.
 */
export function ChannelTiles({ group, plot, size, renderSize, emptySpan }: TileListProps) {
  const ws = useStore((s) => s.ws);
  const sampleId = useChannelSample(group);
  const fixed = useStore((s) => s.views.tilesFixedAxis);
  const channels = useMemo(() => tileChannels(group, plot, fixed), [group, plot, fixed]);
  const built = useMemo(
    () => channelTilePlots(ws, group, plot, fixed, channels),
    [ws, group, plot, fixed, channels],
  );
  // The transforms and axis defaults of channels no plot used yet, registered so they can be drawn.
  useRegisterBuilt(ws, built.ws, group.id);
  const [selected, setSelected] = useState<string | null>(null);
  const onSelect = useCallback((channel: string) => {
    setSelected(channel);
    useStore.getState().setUi({ selectedGateId: null });
  }, []);
  const own = plot[variedAxis(plot, fixed)]?.channel;
  if (!sampleId)
    return (
      <div className="empty" style={{ gridColumn: `1 / span ${emptySpan}`, gridRow: 1 }}>
        The group has no samples.
      </div>
    );
  if (size <= 0 || !sampleId) return null;
  const sample = ws.samples[sampleId];
  return built.plots.map((p, i) => {
    const channel = channels[i] ?? '';
    const marker = sample?.channels.find((c) => c.pnn === channel)?.pns;
    return (
      <ChannelTile
        key={channel}
        group={group}
        sampleId={sampleId}
        plot={p}
        fixed={fixed}
        channel={channel}
        name={marker ? `${channel} · ${marker}` : channel}
        own={channel === own}
        current={selected === channel}
        onSelect={onSelect}
        size={size}
        renderSize={renderSize}
      />
    );
  });
}

const ChannelTile = memo(function ChannelTile({
  group,
  sampleId,
  plot,
  fixed,
  channel,
  own,
  name,
  current,
  onSelect,
  size,
  renderSize,
}: {
  group: Group;
  sampleId: string;
  /** The Tiles plot on this tile's channel; it keeps the Tiles plot's id, so edits reach that plot. */
  plot: PlotSpec;
  fixed: TileAxis;
  channel: string;
  /** Whether the Tiles plot's varied axis is on this channel already. */
  own: boolean;
  name: string;
  current: boolean;
  onSelect: (channel: string) => void;
  size: number;
  renderSize: number;
}) {
  const ws = useStore((s) => s.ws);
  const setUi = useStore((s) => s.setUi);
  const setViews = useStore((s) => s.setViews);
  const vary = variedAxis(plot, fixed);
  const edit = tilesEdit(group.id, plot.id);
  return (
    <Tile
      ws={ws}
      group={group}
      sampleId={sampleId}
      plot={plot}
      {...axisPickers(group, plot, edit)}
      // Picking a channel for an axis fixes that axis on it; the other axis goes through the channels.
      onPickChannel={(axis, ch) => {
        setAxisChannel(edit, axis, ch);
        if (axis !== fixed) setViews({ tilesFixedAxis: axis });
      }}
      pickChannelAxes={plot.kind === 'histogram' || !plot.y ? NONE : BOTH}
      name={name}
      current={current}
      onSelect={() => onSelect(channel)}
      size={size}
      renderSize={renderSize}
      buttons={
        <>
          <TileButton
            label="Gate"
            title="Open in the Gate view"
            ariaLabel={`Open ${name} in the Gate view`}
            onClick={() => {
              setUi({ sampleId });
              openTileInGate(group, plot);
            }}
          />
          <TileButton
            label="Plot"
            title="Open in the Plot view (as a new plot unless it is already there)"
            ariaLabel={`Open ${name} in the Plot view`}
            onClick={() => openTileInGrid(group, plot, sampleId)}
          />
          <TileButton
            label="Samples"
            title="Tile this plot over the samples, with this channel on its axis"
            ariaLabel={`Tile ${name} by sample`}
            onClick={() => {
              // An axis already on the channel keeps its scale and range.
              if (!own) setAxisChannel(edit, vary, channel);
              setViews({ tilesMode: 'samples' });
            }}
          />
        </>
      }
    />
  );
});
