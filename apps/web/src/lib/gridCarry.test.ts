import type { PlotCell, Workspace } from '@flowmeris/model';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './figure.ts';
import { TILE_FIGURE } from './figure.ts';
import { gridCarry } from './gridCarry.ts';

const cell = (id: string, x = 'A', y = 'B'): PlotCell =>
  ({
    id,
    population: 'root',
    overlay: [],
    kind: 'pseudocolor',
    x: { channel: x, transform: 'lin', range: [0, 1] },
    y: { channel: y, transform: 'lin', range: [0, 1] },
    style: structuredClone(DEFAULT_STYLE),
  }) as unknown as PlotCell;

const ws = (cells: (PlotCell | null)[], follow = true): Workspace =>
  ({ groups: [{ id: 'g', gridStyleFollow: follow, grid: { columns: 3, cells } }] }) as unknown as Workspace;

/** Edit the workspace as the store does: the edit, then the carried changes. */
function edit(w: Workspace, fn: (w: Workspace) => void): Workspace {
  const next = produce(w, fn);
  const carry = gridCarry(w, next);
  return carry ? produce(next, carry) : next;
}
const cells = (w: Workspace) => w.groups[0]!.grid.cells as PlotCell[];

describe('carrying settings to all grid plots', () => {
  it('copies only the setting changed, keeping each plot’s other settings', () => {
    const b = cell('b');
    b.style.pointPx = 4;
    b.style.figure = { ...structuredClone(TILE_FIGURE), fontColor: '#ff0000' };
    const w = edit(ws([cell('a'), b]), (w) => {
      const a = cells(w)[0]!;
      a.style.figure ??= structuredClone(TILE_FIGURE);
      a.style.figure.tickFontSize = 9;
    });
    const [a2, b2] = cells(w);
    expect(a2!.style.figure?.tickFontSize).toBe(9);
    expect(b2!.style.figure?.tickFontSize).toBe(9);
    expect(b2!.style.pointPx).toBe(4);
    expect(b2!.style.figure?.fontColor).toBe('#ff0000');
  });

  it('keeps each plot’s title, ticks and axis titles', () => {
    const w = edit(ws([cell('a'), cell('b')]), (w) => {
      const a = cells(w)[0]!;
      a.style.figure = { ...structuredClone(TILE_FIGURE), title: 'A', xTitle: 'X' };
    });
    expect(cells(w)[1]!.style.figure?.title).toBeUndefined();
    expect(cells(w)[1]!.style.figure?.xTitle).toBeUndefined();
  });

  it('carries an axis scale and range only to plots showing the same channel', () => {
    const w = edit(ws([cell('a'), cell('b'), cell('c', 'C')]), (w) => {
      cells(w)[0]!.x.range = [0.2, 0.8];
    });
    expect(cells(w)[1]!.x.range).toEqual([0.2, 0.8]);
    expect(cells(w)[2]!.x.range).toEqual([0, 1]);
  });

  it('carries nothing while off, nor a change of channels, nor a change to several plots', () => {
    const off = edit(ws([cell('a'), cell('b')], false), (w) => void (cells(w)[0]!.style.pointPx = 5));
    expect(cells(off)[1]!.style.pointPx).toBe(DEFAULT_STYLE.pointPx);
    const both = ws([cell('a'), cell('b'), cell('c')]);
    const after = produce(both, (w) => {
      cells(w)[0]!.style.pointPx = 5;
      cells(w)[1]!.style.pointPx = 6;
    });
    expect(gridCarry(both, after)).toBeNull();
    const ch = ws([cell('a'), cell('b')]);
    expect(
      gridCarry(
        ch,
        produce(ch, (w) => void (cells(w)[0]!.x.channel = 'Z')),
      ),
    ).toBeNull();
  });
});
