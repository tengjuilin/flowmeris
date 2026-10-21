import type { PlotCell } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './figure.ts';
import { plotOf } from './gridCells.ts';

const axis = (channel: string) => ({
  channel,
  comp: 'group' as const,
  transform: 't',
  range: [0, 1] as [number, number],
});

describe('plotOf', () => {
  it("keeps a Pseudocolor channel cell's color axis", () => {
    const cell: PlotCell = {
      id: 'c',
      population: 'root',
      overlay: [],
      kind: 'pseudocolor-channel',
      x: axis('FL1-A'),
      y: axis('FL2-A'),
      color: { ...axis('FL3-A'), stat: 'mean' },
      style: structuredClone(DEFAULT_STYLE),
    };
    expect(plotOf(cell).color).toEqual(cell.color);
    expect(plotOf({ ...cell, color: undefined })).not.toHaveProperty('color');
  });
});
