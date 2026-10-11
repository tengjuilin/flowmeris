import { type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { registerTransform, transformOfKind } from './axisDefaults.ts';
import { DEFAULT_FIGURE, TILE_FIGURE } from './figure.ts';
import { newPlot, newTilePlot } from './plotFactories.ts';
import { panelAtDefaults, resetPanel } from './plotPanels.ts';

function setup() {
  const ws: Workspace = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const g = newGroup('G', ['s1'], ['FSC-A', 'SSC-A']);
  ws.groups.push(g);
  ws.samples.s1 = {
    channels: [
      { pnn: 'FSC-A', kind: 'scatter', pnr: 262144 },
      { pnn: 'SSC-A', kind: 'scatter', pnr: 262144 },
    ],
    keywords: {},
  } as unknown as Sample;
  return { ws, g, p: newPlot(ws, g, 'root') };
}

describe('plot settings panel reset', () => {
  it('has nothing to reset on the Settings and Gate tabs', () => {
    const { ws, g, p } = setup();
    p.style.pointPx = 9;
    expect(panelAtDefaults('settings', p, g, ws, true)).toBe(true);
    expect(panelAtDefaults('gate', p, g, ws, true)).toBe(true);
  });

  it('resets one tab and leaves the others', () => {
    const { ws, g, p } = setup();
    p.style.figure = { ...structuredClone(DEFAULT_FIGURE), fontSize: 20, tickWidth: 3 };
    expect(panelAtDefaults('figure', p, g, ws, true)).toBe(true);
    expect(panelAtDefaults('text', p, g, ws, true)).toBe(false);
    resetPanel('text', p, g, ws, true);
    expect(panelAtDefaults('text', p, g, ws, true)).toBe(true);
    expect(p.style.figure?.tickWidth).toBe(3);
  });

  it('puts the axes back to the factory scale on the Axis tab, as defaults only for a Gate-view plot', () => {
    const { ws, g, p } = setup();
    const log = registerTransform(ws, transformOfKind('log', 262144));
    p.x.transform = log;
    expect(panelAtDefaults('axis', p, g, ws, true)).toBe(false);
    const tile = newTilePlot(ws, g, 'root');
    tile.x.transform = log;
    g.axisDefaults['FSC-A'] = { ...tile.x };
    resetPanel('axis', tile, g, ws, false);
    expect(panelAtDefaults('axis', tile, g, ws, false)).toBe(true);
    expect(g.axisDefaults['FSC-A']?.transform).toBe(log);
    resetPanel('axis', p, g, ws, true);
    expect(panelAtDefaults('axis', p, g, ws, true)).toBe(true);
    expect(g.axisDefaults['FSC-A']).toEqual(p.x);
  });

  it('measures a Tiles or grid plot against their smaller text', () => {
    const { ws, g } = setup();
    const tile = newTilePlot(ws, g, 'root');
    expect(tile.style.figure?.fontSize).toBe(TILE_FIGURE.fontSize);
    expect(panelAtDefaults('text', tile, g, ws, false)).toBe(true);
    expect(panelAtDefaults('text', tile, g, ws, true)).toBe(false);
  });
});
