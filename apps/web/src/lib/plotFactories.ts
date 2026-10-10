import { type Group, type PlotKind, type PlotSpec, type Workspace, newId } from '@flowmeris/model';
import { defaultAxis, defaultChannels } from './axisDefaults.ts';
import { DEFAULT_STYLE, TILE_STYLE } from './figure.ts';

/** New plots with the default axes and appearance (on a draft: call inside `mutate`). */

/** Add a Gate-view plot of `population`, on `xy` or the default channels. */
export function newPlot(
  ws: Workspace,
  g: Group,
  population: string,
  kind: PlotKind = 'pseudocolor',
  xy?: [string, string],
): PlotSpec {
  const plot = makePlot(ws, g, population, kind, xy);
  g.plots.push(plot);
  return plot;
}

/** A Gate-view plot of `population`, on `xy` or the default channels, not added to the group. */
function makePlot(
  ws: Workspace,
  g: Group,
  population: string,
  kind: PlotKind = 'pseudocolor',
  xy?: [string, string],
): PlotSpec {
  const [xc, yc] = xy ?? defaultChannels(ws, g);
  const plot: PlotSpec = {
    id: newId('plt_'),
    population,
    kind,
    x: { ...defaultAxis(ws, g, xc) },
    style: structuredClone(DEFAULT_STYLE),
  };
  if (kind !== 'histogram') plot.y = { ...defaultAxis(ws, g, yc) };
  return plot;
}

/**
 * The plot a population gets when it has none, not added to the group: its parent plot's channels and
 * type (a parent histogram gives a pseudocolor plot), else pseudocolor on the default channels.
 */
export function populationPlot(ws: Workspace, g: Group, popId: string): PlotSpec {
  const pop = g.template.populations[popId];
  const parentGate = pop?.gate ? g.template.gates[pop.gate] : undefined;
  const parentPlot = g.plots.find((p) => p.population === parentGate?.parentPop);
  const xy: [string, string] | undefined = parentPlot?.y
    ? [parentPlot.x.channel, parentPlot.y.channel]
    : undefined;
  const kind = parentPlot?.kind === 'histogram' ? 'pseudocolor' : (parentPlot?.kind ?? 'pseudocolor');
  return makePlot(ws, g, popId, kind, xy);
}

/**
 * Add the population's Tiles plot: a copy of the Gate view's plot type and axes (or the defaults when it
 * has none) with the Tiles default appearance. Not linked to the Gate view's plot afterwards.
 */
export function newTilePlot(ws: Workspace, g: Group, population: string): PlotSpec {
  const src = g.plots.find((p) => p.population === population);
  const [xc, yc] = defaultChannels(ws, g);
  const plot: PlotSpec = {
    id: newId('tpl_'),
    population,
    kind: src?.kind ?? 'pseudocolor',
    x: { ...(src?.x ?? defaultAxis(ws, g, xc)) },
    style: structuredClone(TILE_STYLE),
  };
  if (plot.kind !== 'histogram') plot.y = { ...(src?.y ?? defaultAxis(ws, g, yc)) };
  g.tilePlots.push(plot);
  return plot;
}
