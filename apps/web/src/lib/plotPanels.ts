import type { Group, PlotSpec, PlotStyle, Workspace } from '@flowmeris/model';
import { axisAtFactory, axisOnly, resetAxisToFactory } from './axisDefaults.ts';
import {
  DEFAULT_FIGURE,
  DEFAULT_STYLE,
  PANEL_FIGURE_KEYS,
  TILE_FIGURE,
  TILE_STYLE,
  resetStyleKeys,
  styleKeysAtDefaults,
} from './figure.ts';
import type { PlotPanelTab } from './panelSpecs.ts';
import { hasColorAxis } from './plotKinds.ts';

export type { PlotPanelTab };

/**
 * The display settings tab `tab` covers, as defaults to compare with or reset to: the Figure tab's are all
 * of them but, for a plot type with a color axis, the color map, which the Axis tab's Color axis card holds.
 */
function displayOf(tab: PlotPanelTab, p: PlotSpec, gateView: boolean): PlotStyle | null {
  if (tab !== 'figure') return null;
  const d = gateView ? DEFAULT_STYLE : TILE_STYLE;
  return hasColorAxis(p.kind) ? { ...d, colormap: p.style.colormap } : d;
}

/** The color axis the Axis tab shows: a Pseudocolor channel plot's (others keep theirs hidden). */
const shownColor = (p: PlotSpec) => (p.kind === 'pseudocolor-channel' ? p.color : undefined);

/**
 * Whether the settings of tab `tab` are at the defaults for plot `p`: a Gate-view plot's (`gateView`) or
 * a Tiles or grid plot's, which start with smaller text. The Axis tab includes the axes' scale and range,
 * and the color axis's statistic and color map. Settings and Gate have nothing to reset.
 */
export function panelAtDefaults(
  tab: PlotPanelTab,
  p: PlotSpec,
  g: Group,
  ws: Workspace,
  gateView: boolean,
): boolean {
  if (tab === 'settings' || tab === 'gate') return true;
  const at = styleKeysAtDefaults(
    p.style,
    PANEL_FIGURE_KEYS[tab],
    displayOf(tab, p, gateView),
    gateView ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  if (tab !== 'axis') return at;
  const color = shownColor(p);
  return (
    at &&
    [p.x, p.y, color].every((a) => !a || axisAtFactory(ws, g, a)) &&
    (color?.stat ?? 'median') === 'median' &&
    (!hasColorAxis(p.kind) || p.style.colormap === (gateView ? DEFAULT_STYLE : TILE_STYLE).colormap)
  );
}

/**
 * Reset the settings of tab `tab` for plot `p` (call inside `mutate`). Only a Gate-view plot's scales
 * become the channel's defaults, as each axis card's own reset does.
 */
export function resetPanel(tab: PlotPanelTab, p: PlotSpec, g: Group, w: Workspace, gateView: boolean): void {
  if (tab === 'settings' || tab === 'gate') return;
  resetStyleKeys(
    p.style,
    PANEL_FIGURE_KEYS[tab],
    displayOf(tab, p, gateView),
    gateView ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  if (tab !== 'axis') return;
  const color = shownColor(p);
  for (const a of [p.x, p.y, color]) {
    if (!a) continue;
    resetAxisToFactory(w, g, a);
    if (gateView) g.axisDefaults[a.channel] = axisOnly(a);
  }
  if (color) color.stat = 'median';
  if (hasColorAxis(p.kind)) p.style.colormap = (gateView ? DEFAULT_STYLE : TILE_STYLE).colormap;
}
