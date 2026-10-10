import type { Group, PlotSpec, Workspace } from '@flowmeris/model';
import { axisAtFactory, resetAxisToFactory } from './axisDefaults.ts';
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

export type { PlotPanelTab };

/**
 * Whether the settings of tab `tab` are at the defaults for plot `p`: a Gate-view plot's (`gateView`) or
 * a Tiles or grid plot's, which start with smaller text. The Axis tab includes the axes' scale and range.
 * Settings and Gate have nothing to reset.
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
    tab === 'figure' ? (gateView ? DEFAULT_STYLE : TILE_STYLE) : null,
    gateView ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  return tab === 'axis' ? at && [p.x, p.y].every((a) => !a || axisAtFactory(ws, g, a)) : at;
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
    tab === 'figure' ? (gateView ? DEFAULT_STYLE : TILE_STYLE) : null,
    gateView ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  if (tab !== 'axis') return;
  for (const a of [p.x, p.y]) {
    if (!a) continue;
    resetAxisToFactory(w, g, a);
    if (gateView) g.axisDefaults[a.channel] = { ...a };
  }
}
