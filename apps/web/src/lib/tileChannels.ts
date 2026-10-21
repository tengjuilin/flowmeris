import type { AxisSpec, Group, PlotSpec, Workspace } from '@flowmeris/model';
import { Immer } from 'immer';
import { defaultAxis } from './axisDefaults.ts';
import { jsonClone } from './json.ts';

/**
 * The Tiles view's Channels mode: one sample's plot with one axis kept (`fixed`) and the other axis
 * varied over the sample's channels, a tile each. A histogram varies its x axis.
 */

export type TileAxis = 'x' | 'y';

/** Builds the tiles' plots on a copy of the workspace, leaving the workspace given unfrozen. */
const builder = new Immer({ autoFreeze: false });

/** The axis a Channels tile varies: x for a histogram, else the one not fixed. */
export function variedAxis(plot: PlotSpec, fixed: TileAxis): TileAxis {
  if (plot.kind === 'histogram' || !plot.y) return 'x';
  return fixed === 'x' ? 'y' : 'x';
}

/**
 * The channels the varied axis goes through, in the group's order: all but the hidden ones and, for a
 * 2D plot, the fixed axis's channel.
 */
export function tileChannels(g: Group, plot: PlotSpec, fixed: TileAxis, hidden: readonly string[]): string[] {
  const skip = new Set(hidden);
  const is1d = plot.kind === 'histogram' || !plot.y;
  if (!is1d) skip.add(plot[fixed]?.channel ?? '');
  return g.channels.filter((c) => !skip.has(c));
}

/**
 * The tiles' plots, one per channel: `plot` with its varied axis on that channel. That axis is the
 * plot's own when it is on the channel already, else the group's default for the channel. Returns the
 * workspace with what building them registered (transforms, axis defaults), as `gateViewPlot` does.
 */
export function channelTilePlots(
  ws: Workspace,
  g: Group,
  plot: PlotSpec,
  fixed: TileAxis,
  channels: readonly string[],
): { plots: PlotSpec[]; ws: Workspace } {
  const vary = variedAxis(plot, fixed);
  const own = plot[vary];
  let axes: AxisSpec[] = [];
  const next = builder.produce(ws, (w) => {
    const gg = w.groups.find((x) => x.id === g.id);
    if (!gg) return;
    // Plain copies: the axes hold parts of the draft.
    axes = channels.map((c) => (own?.channel === c ? own : jsonClone(defaultAxis(w, gg, c))));
  });
  return { plots: axes.map((a) => ({ ...plot, [vary]: a })), ws: next };
}

/** The population's saved Gate-view plot of the same kind on the same channels as `plot`, if any. */
export function savedPlotLike(g: Group, plot: PlotSpec): PlotSpec | undefined {
  return g.plots.find(
    (p) =>
      p.population === plot.population &&
      p.kind === plot.kind &&
      p.x.channel === plot.x.channel &&
      p.y?.channel === plot.y?.channel,
  );
}
