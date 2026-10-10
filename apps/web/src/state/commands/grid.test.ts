import { type PlotSpec, type Sample, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { cellSample } from '../../lib/gridCells.ts';
import { newTilePlot } from '../../lib/plotFactories.ts';
import { APP_INFO, useStore } from '../store.ts';
import { addCell, editCell, openInTilesView, openTileInGrid, removeCell, setCellSample } from './grid.ts';

const S = useStore.getState;
const g = () => S().ws.groups[0]!;

beforeEach(() => {
  const ws: Workspace = newWorkspace('t', APP_INFO);
  const grp = newGroup('G', ['a', 'b'], ['FSC-A', 'SSC-A', 'FL1-A']);
  grp.id = 'g';
  ws.groups.push(grp);
  for (const id of ['a', 'b'])
    ws.samples[id] = {
      channels: ['FSC-A', 'SSC-A', 'FL1-A'].map((pnn) => ({ pnn, kind: 'scatter', pnr: 1024 })),
      keywords: {},
    } as unknown as Sample;
  S().setWorkspace(ws);
});

describe('grid commands', () => {
  it('add a plot on the default channels into a slot and select it', () => {
    addCell('g', 2, 'dot', 'root');
    const cells = g().grid.cells;
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect([cells[2]?.kind, cells[2]?.x.channel, cells[2]?.y?.channel]).toEqual(['dot', 'FSC-A', 'SSC-A']);
    expect(S().ui.gridCellId).toBe(cells[2]!.id);
  });

  it('remove a plot, dropping empty slots at the end', () => {
    addCell('g', 0, 'dot', 'root');
    addCell('g', 3, 'dot', 'root');
    removeCell('g', g().grid.cells[3]!.id);
    expect(g().grid.cells).toHaveLength(1);
  });

  it('carry a grid plot’s settings to the others while the group carries them', () => {
    addCell('g', 0, 'dot', 'root');
    addCell('g', 1, 'dot', 'root');
    useStore.getState().mutate('follow', (w) => void (w.groups[0]!.gridStyleFollow = true));
    editCell('g', g().grid.cells[0]!.id, 'Point size', (c) => void (c.style.pointPx = 7));
    expect(g().grid.cells.map((c) => c?.style.pointPx)).toEqual([7, 7]);
  });

  it('pin a plot to a sample, and follow the selection when unpinned', () => {
    addCell('g', 0, 'dot', 'root');
    const id = g().grid.cells[0]!.id;
    setCellSample('g', id, 'b');
    expect(cellSample(g(), g().grid.cells[0]!, 'a')).toBe('b');
    setCellSample('g', id, undefined);
    expect(cellSample(g(), g().grid.cells[0]!, 'a')).toBe('a');
  });

  it('open a tile in the grid once, reusing the cell next time', () => {
    const tile = {
      id: 't',
      population: 'root',
      kind: 'dot',
      x: { channel: 'FSC-A', comp: 'group', transform: 'x', range: [0, 1] },
      y: { channel: 'SSC-A', comp: 'group', transform: 'x', range: [0, 1] },
      style: { pointPx: 2 },
    } as unknown as PlotSpec;
    openTileInGrid(g(), tile, 'b');
    openTileInGrid(g(), tile, 'b');
    expect(g().grid.cells).toHaveLength(1);
    expect(g().grid.cells[0]?.sampleId).toBe('b');
    expect(S().ui).toMatchObject({ view: 'plot', sampleId: 'b', gridCellId: g().grid.cells[0]!.id });
  });

  it('open a plot in Tiles: its population and sample, with the Tiles plot on its type and axes', () => {
    addCell('g', 0, 'dot', 'root', ['FL1-A', 'FSC-A']);
    const id = g().grid.cells[0]!.id;
    editCell('g', id, 'Range', (c) => void (c.x.range = [0.1, 0.9]));
    setCellSample('g', id, 'b');
    S().setUi({ view: 'plot', sampleId: 'a' });
    const cell = g().grid.cells[0]!;
    openInTilesView(g(), cell, 'b');
    const tile = g().tilePlots.find((p) => p.population === 'root')!;
    expect(tile.kind).toBe('dot');
    expect(tile.x).toEqual(cell.x);
    expect(tile.y).toEqual(cell.y);
    expect(S().ui).toMatchObject({ view: 'tiles', popId: 'root', sampleId: 'b' });
    expect(S().status.toast).toBeNull();
  });

  it('open a plot in Tiles as one undo step, and none when the Tiles plot already matches', () => {
    addCell('g', 0, 'histogram', 'root', ['SSC-A']);
    S().mutate('Tiles plot', (w) => void newTilePlot(w, w.groups[0]!, 'root'));
    const cell = g().grid.cells[0]!;
    const style = structuredClone(g().tilePlots[0]!.style);
    openInTilesView(g(), cell, 'a');
    const tile = g().tilePlots.find((p) => p.population === 'root')!;
    expect([tile.kind, tile.x.channel]).toEqual(['histogram', 'SSC-A']);
    expect(tile.style).toEqual(style);
    const past = S().past.length;
    openInTilesView(g(), cell, 'a');
    expect(S().past.length).toBe(past);
    S().undo();
    expect(g().tilePlots.find((p) => p.population === 'root')?.kind).toBe('pseudocolor');
  });

  it('open a histogram in Tiles with what its y axis shows', () => {
    addCell('g', 0, 'histogram', 'root', ['SSC-A']);
    const id = g().grid.cells[0]!.id;
    editCell('g', id, 'Y axis', (c) => void (c.style.histNorm = 'area'));
    S().mutate('Tiles plot', (w) => void newTilePlot(w, w.groups[0]!, 'root'));
    openInTilesView(g(), g().grid.cells[0]!, 'a');
    expect(g().tilePlots.find((p) => p.population === 'root')?.style.histNorm).toBe('area');
    // A different y axis on the same channel is a change too.
    editCell('g', id, 'Y axis', (c) => void (c.style.histNorm = 'count'));
    openInTilesView(g(), g().grid.cells[0]!, 'a');
    expect(g().tilePlots.find((p) => p.population === 'root')?.style.histNorm).toBe('count');
  });

  it('open a plot in Tiles whose sample is unchecked: select it and say to check it', () => {
    addCell('g', 0, 'dot', 'root');
    S().setUi({ excluded: { b: true } });
    openInTilesView(g(), g().grid.cells[0]!, 'b', 'B02');
    expect(S().ui).toMatchObject({ view: 'tiles', sampleId: 'b', excluded: { b: true } });
    expect(S().status.toast?.text).toMatch(/B02 is unchecked in the sidebar/);
  });
});
