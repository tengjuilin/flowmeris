import { ellipseAxes } from '@flowmeris/gating';
import type { Geometry, PlotSpec } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { applyHandle, clampToRange, edgeArms, newGateBase, shapeFromDrag, translate } from './gateEdit.ts';

const unit = (p: readonly [number, number]) => clampToRange(p, [0, 1], [0, 1]);

describe('translate', () => {
  it('moves every shape and keeps open rectangle sides open', () => {
    expect(translate({ kind: 'rect', min: [0, null], max: [1, 2] }, 1, 10)).toEqual({
      kind: 'rect',
      min: [1, null],
      max: [2, 12],
    });
    expect(translate({ kind: 'split', at: 3 }, 2, 5)).toEqual({ kind: 'split', at: 5 });
    expect(translate({ kind: 'polygon', vertices: [[0, 0]] }, 1, 1)).toEqual({
      kind: 'polygon',
      vertices: [[1, 1]],
    });
  });
});

describe('clampToRange and edgeArms', () => {
  it('clamps to reversed ranges too', () => {
    expect(clampToRange([5, -5], [1, 0], [0, 2])).toEqual([1, 0]);
  });

  it('puts spider arms at the edge midpoints: top, right, bottom, left', () => {
    expect(edgeArms([0, 2], [0, 4])).toEqual([
      [1, 4],
      [2, 2],
      [1, 0],
      [0, 2],
    ]);
  });
});

describe('applyHandle', () => {
  const rect: Geometry = { kind: 'rect', min: [0.2, 0.2], max: [0.6, 0.6] };

  it('moves rectangle sides and swaps them when dragged past each other', () => {
    expect(applyHandle(rect, 'ne', [0.8, 0.9], false, unit)).toEqual({
      kind: 'rect',
      min: [0.2, 0.2],
      max: [0.8, 0.9],
    });
    expect(applyHandle(rect, 'w', [0.7, 0], false, unit)).toEqual({
      kind: 'rect',
      min: [0.6, 0.2],
      max: [0.7, 0.6],
    });
  });

  it('ignores y on a histogram range', () => {
    const range: Geometry = { kind: 'rect', min: [0.2], max: [0.6] };
    expect(applyHandle(range, 'e', [0.9, 0.9], true, unit)).toEqual({ kind: 'rect', min: [0.2], max: [0.9] });
  });

  it('moves one polygon vertex', () => {
    const g: Geometry = {
      kind: 'polygon',
      vertices: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    };
    expect(applyHandle(g, 'v1', [2, 2], false, unit)).toEqual({
      kind: 'polygon',
      vertices: [
        [0, 0],
        [2, 2],
        [0, 1],
      ],
    });
  });

  it('turns and stretches an ellipse by its major axis handle', () => {
    const e = shapeFromDrag('ellipse', [0, 0], [2, 1]);
    const out = applyHandle(e, 'a', [1, 2], false, unit)!;
    if (out.kind !== 'ellipse') throw new Error('not an ellipse');
    const ax = ellipseAxes(out.mean, out.cov, out.d2);
    expect(ax.cx).toBeCloseTo(1);
    expect(ax.cy).toBeCloseTo(0.5);
    expect(ax.a).toBeCloseTo(1.5);
    expect(ax.b).toBeCloseTo(0.5);
    expect(Math.abs(ax.theta)).toBeCloseTo(Math.PI / 2);
  });

  it('keeps spider points inside the plot and rejects arms that make it invalid', () => {
    const spider: Geometry = { kind: 'spider', center: [0.5, 0.5], arms: edgeArms([0, 1], [0, 1]) };
    expect(applyHandle(spider, 'c', [3, -1], false, unit)).toMatchObject({ center: [1, 0] });
    expect(applyHandle(spider, 'arm0', [0.6, 2], false, unit)).toMatchObject({
      arms: [[0.6, 1], ...spider.arms.slice(1)],
    });
    // the top arm swung past the right one
    expect(applyHandle(spider, 'arm0', [1, 0.2], false, unit)).toBeNull();
  });
});

describe('new gates', () => {
  const plot = {
    population: 'p1',
    x: { channel: 'FSC', comp: 'group', transform: 't1', range: [0, 1] },
    y: { channel: 'SSC', comp: 'none', transform: 't2', range: [0, 1] },
  } as unknown as PlotSpec;

  it('take the plot population and axes', () => {
    expect(newGateBase(plot, false)).toEqual({
      parentPop: 'p1',
      dims: [
        { channel: 'FSC', comp: 'group', transform: 't1' },
        { channel: 'SSC', comp: 'none', transform: 't2' },
      ],
    });
    expect(newGateBase(plot, true).dims).toHaveLength(1);
  });

  it('are the dragged box, sorted', () => {
    expect(shapeFromDrag('rect', [3, 1], [1, 4])).toEqual({ kind: 'rect', min: [1, 1], max: [3, 4] });
    expect(shapeFromDrag('range', [3, 1], [1, 4])).toEqual({ kind: 'rect', min: [1], max: [3] });
  });
});
