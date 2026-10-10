import { type RidgeLayout, type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { factoryAxis, registerTransform, transformOfKind } from './axisDefaults.ts';
import {
  moveRidges,
  resetRidgePanel,
  ridgeKeysAtDefaults,
  ridgePanelAtDefaults,
  scaleRidgeFonts,
} from './ridgePanels.ts';
import { DEFAULT_OVERLAP, DEFAULT_RIDGE_COMBINE, DEFAULT_RIDGE_STYLE } from './ridgeStyle.ts';

function setup() {
  const ws: Workspace = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1', 's2'], ['FSC-A']);
  ws.groups.push(g);
  ws.samples.s1 = {
    channels: [{ pnn: 'FSC-A', kind: 'scatter', pnr: 262144 }],
    keywords: {},
  } as unknown as Sample;
  const l: RidgeLayout = {
    kind: 'ridge',
    id: 'lay_1',
    population: 'root',
    axis: factoryAxis(ws, g, 'FSC-A'),
    overlap: DEFAULT_OVERLAP,
    norm: 'mode',
    style: structuredClone(DEFAULT_RIDGE_STYLE),
    combine: structuredClone(DEFAULT_RIDGE_COMBINE),
  };
  return { ws, g, l, current: new Set(['s1', 's2']) };
}

describe('ridge settings panel reset', () => {
  it('has nothing to reset without a ridge plot or on the Settings tab', () => {
    const { ws, g, l, current } = setup();
    l.style.bins = 64;
    expect(ridgePanelAtDefaults('figure', undefined, ws, g, current)).toBe(true);
    expect(ridgePanelAtDefaults('settings', l, ws, g, current)).toBe(true);
    expect(ridgePanelAtDefaults('figure', l, ws, g, current)).toBe(false);
  });

  it('resets one tab and leaves the others; the Figure tab includes the overlap', () => {
    const { ws, g, l, current } = setup();
    l.style.bins = 64;
    l.overlap = 0.3;
    l.style.axisTitle = 'X';
    l.style.fontSize = 20;
    resetRidgePanel('figure', l, ws, g, current);
    expect(l.style.fontSize).toBe(20);
    expect(ridgePanelAtDefaults('text', l, ws, g, current)).toBe(false);
    expect(l.style.bins).toBe(DEFAULT_RIDGE_STYLE.bins);
    expect(l.overlap).toBe(DEFAULT_OVERLAP);
    expect(l.style.axisTitle).toBe('X');
    expect(ridgePanelAtDefaults('axis', l, ws, g, current)).toBe(false);
  });

  it('puts the axis back to its factory scale on the Axis tab', () => {
    const { ws, g, l, current } = setup();
    l.axis.transform = registerTransform(ws, transformOfKind('log', 262144));
    expect(ridgePanelAtDefaults('axis', l, ws, g, current)).toBe(false);
    resetRidgePanel('axis', l, ws, g, current);
    expect(l.axis).toEqual(factoryAxis(ws, g, 'FSC-A'));
    expect(ridgePanelAtDefaults('axis', l, ws, g, current)).toBe(true);
  });

  it('drops only this group’s ridges’ order, colors and labels on the Sample tab', () => {
    const { ws, g, l, current } = setup();
    l.style.order = ['s2', 's1', 'other'];
    l.style.sampleColors = { s1: '#ff0000', other: '#00ff00' };
    l.style.sampleLabels = { s2: 'B' };
    expect(ridgePanelAtDefaults('sample', l, ws, g, current)).toBe(false);
    resetRidgePanel('sample', l, ws, g, current);
    expect(l.style.order).toEqual(['other']);
    expect(l.style.sampleColors).toEqual({ other: '#00ff00' });
    expect(l.style.sampleLabels).toEqual({});
    expect(ridgePanelAtDefaults('sample', l, ws, g, current)).toBe(true);
  });

  it('checks a card’s keys, and the overlap only when asked', () => {
    const s = { ...DEFAULT_RIDGE_STYLE };
    expect(ridgeKeysAtDefaults(s, 0.2, ['bins'])).toBe(true);
    expect(ridgeKeysAtDefaults(s, 0.2, ['bins'], true)).toBe(false);
    expect(ridgeKeysAtDefaults({ ...s, bins: 1 }, DEFAULT_OVERLAP, ['bins'])).toBe(false);
  });
});

describe('reordering ridges', () => {
  it('keeps the slots of ridges not drawn and other groups’ order entries', () => {
    // b is unchecked in the sidebar: it stays in the second slot.
    expect(moveRidges(['x'], ['a', 'b', 'c', 'd'], ['a', 'c', 'd'], ['d'], 'a', false)).toEqual([
      'd',
      'b',
      'a',
      'c',
      'x',
    ]);
  });
});

describe('ridge base font size', () => {
  it('scales the other sizes by the same factor, to half pixels, within 4–48', () => {
    const s = { ...DEFAULT_RIDGE_STYLE, fontSize: 10, labelFontSize: 11, tickFontSize: 9, titleFontSize: 40 };
    expect(scaleRidgeFonts(s, 15)).toBe(true);
    expect(s).toMatchObject({ fontSize: 15, labelFontSize: 16.5, tickFontSize: 13.5, titleFontSize: 48 });
    expect(scaleRidgeFonts(s, 15)).toBe(false);
    expect(scaleRidgeFonts(s, 100)).toBe(true);
    expect(s.fontSize).toBe(48);
  });
});
