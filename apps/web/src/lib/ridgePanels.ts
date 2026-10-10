import type { Group, RidgeLayout, RidgeStyle, Workspace } from '@flowmeris/model';
import { axisAtFactory, resetAxisToFactory } from './axisDefaults.ts';
import { sameJson } from './json.ts';
import { moveIds } from './order.ts';
import { DEFAULT_OVERLAP, DEFAULT_RIDGE_STYLE } from './ridgeStyle.ts';
import { scaleFontSizes } from './textScale.ts';

import type { RidgePanelTab } from './panelSpecs.ts';
export type { RidgePanelTab };

type Keys = (keyof RidgeStyle)[];

/** The style keys of each card, for the card's reset and its tab's "Reset this panel". */
export const RIDGE_CARD_KEYS = {
  ridgeStyle: ['colorMode', 'color', 'fillOpacity', 'strokeColor', 'strokeWidth'] as Keys,
  labels: ['showLabels', 'showCounts', 'countOnNewLine', 'labelWidth', 'labelOverflow'] as Keys,
  layout: ['rowHeight', 'width', 'aspect'] as Keys,
  histogram: ['bins', 'smoothing'] as Keys,
  baseFont: ['fontFamily', 'fontColor', 'fontSize', 'labelFontSize', 'tickFontSize', 'titleFontSize'] as Keys,
  ticks: ['axisColor', 'baselineColor', 'showTickLabels', 'ticks'] as Keys,
  title: ['axisTitle'] as Keys,
  labelText: ['labelText', 'labelFontSize', 'labelAlign'] as Keys,
  tickText: ['tickText', 'tickFontSize'] as Keys,
  titleText: ['titleText', 'titleFontSize'] as Keys,
};

const K = RIDGE_CARD_KEYS;
/** The style keys each tab's "Reset this panel" resets (the Axis tab also resets the scale, the Sample tab its rows). */
export const RIDGE_PANEL_KEYS: Record<'figure' | 'axis' | 'text', Keys> = {
  figure: [...K.ridgeStyle, ...K.labels, ...K.layout, ...K.histogram, ...K.baseFont],
  axis: [...K.ticks, ...K.title],
  text: [...K.labelText, ...K.tickText, ...K.titleText],
};

/** Whether the style `keys` (and the overlap, if `withOverlap`) are at the defaults. */
export function ridgeKeysAtDefaults(style: RidgeStyle, overlap: number, keys: Keys, withOverlap = false) {
  return (
    keys.every((k) => sameJson(style[k], DEFAULT_RIDGE_STYLE[k])) &&
    (!withOverlap || overlap === DEFAULT_OVERLAP)
  );
}

/** Put the style `keys` (and the overlap, if `withOverlap`) of `l` back to the defaults (call inside `mutate`). */
export function resetRidgeKeys(l: RidgeLayout, keys: Keys, withOverlap = false) {
  for (const k of keys) {
    const d = DEFAULT_RIDGE_STYLE[k];
    if (d === undefined) delete l.style[k];
    else (l.style as Record<string, unknown>)[k] = structuredClone(d);
  }
  if (withOverlap) l.overlap = DEFAULT_OVERLAP;
}

/** Whether the ridges `current` (those of this group) have no order, colors or labels of their own. */
export function ridgeRowsAtDefaults(style: RidgeStyle, current: ReadonlySet<string>) {
  return (
    !style.order.some((id) => current.has(id)) &&
    !Object.keys(style.sampleColors).some((id) => current.has(id)) &&
    !Object.keys(style.sampleLabels).some((id) => current.has(id))
  );
}

/** `rec` without the entries of the ridges `current`. */
export const withoutRidges = <T>(rec: Record<string, T>, current: ReadonlySet<string>) =>
  Object.fromEntries(Object.entries(rec).filter(([id]) => !current.has(id)));

/** Drop the order, colors and labels of the ridges `current` from `l` (call inside `mutate`). */
export function resetRidgeRows(l: RidgeLayout, current: ReadonlySet<string>) {
  l.style.order = l.style.order.filter((id) => !current.has(id));
  l.style.sampleColors = withoutRidges(l.style.sampleColors, current);
  l.style.sampleLabels = withoutRidges(l.style.sampleLabels, current);
}

/**
 * Whether tab `tab` of the ridge settings panel is at the defaults for ridge plot `l` (none yet: it is).
 * `current` are the ridges of this group, whose rows the Sample tab resets.
 */
export function ridgePanelAtDefaults(
  tab: RidgePanelTab,
  l: RidgeLayout | undefined,
  ws: Workspace,
  g: Group,
  current: ReadonlySet<string>,
): boolean {
  if (!l || tab === 'settings') return true;
  if (tab === 'sample') return ridgeRowsAtDefaults(l.style, current);
  const at = ridgeKeysAtDefaults(l.style, l.overlap, RIDGE_PANEL_KEYS[tab], tab === 'figure');
  return tab === 'axis' ? at && axisAtFactory(ws, g, l.axis) : at;
}

/** Reset tab `tab` of the ridge settings panel for ridge plot `l` (call inside `mutate`). */
export function resetRidgePanel(
  tab: RidgePanelTab,
  l: RidgeLayout,
  ws: Workspace,
  g: Group,
  current: ReadonlySet<string>,
) {
  if (tab === 'settings') return;
  if (tab === 'sample') return resetRidgeRows(l, current);
  resetRidgeKeys(l, RIDGE_PANEL_KEYS[tab], tab === 'figure');
  if (tab === 'axis') resetAxisToFactory(ws, g, l.axis);
}

/**
 * The saved ridge order after moving `ids` next to `target` (before it, or after it if `after`) among
 * the ridges drawn, `ordered`. `allIds` is every ridge of the group in order, drawn or not: ridges not
 * drawn keep their slots. Order entries of other groups' ridges (`saved` not in `allIds`) are kept at the
 * end. Null if `target` is one of `ids`.
 */
export function moveRidges(
  saved: string[],
  allIds: string[],
  ordered: string[],
  ids: string[],
  target: string,
  after: boolean,
): string[] | null {
  const next = moveIds(ordered, ids, target, after);
  if (!next) return null;
  const vis = new Set(ordered);
  const all = new Set(allIds);
  let k = 0;
  const full = allIds.map((id) => (vis.has(id) ? next[k++]! : id));
  return [...full, ...saved.filter((id) => !all.has(id))];
}

/**
 * Set the base font size of `style` to `px` (clamped to 4–48), scaling the label, tick and title sizes
 * by the same factor, to the nearest half pixel (call inside `mutate`). False if the size is unchanged.
 */
export const scaleRidgeFonts = (style: RidgeStyle, px: number): boolean =>
  scaleFontSizes(style, ['labelFontSize', 'tickFontSize', 'titleFontSize'], px);
