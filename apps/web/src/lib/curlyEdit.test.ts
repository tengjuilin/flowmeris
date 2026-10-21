import { curlyRegion, validateCurly } from '@flowmeris/gating';
import { newWorkspace, transformId } from '@flowmeris/model';
import { logicleDef } from '@flowmeris/transforms';
import { describe, expect, it } from 'vitest';
import {
  type CurlyAxes,
  curlyAt,
  curlyAxes,
  curlyGeometry,
  curlyTop,
  dragCurly,
  handleVertex,
  newCurly,
  withCurliness,
} from './curlyEdit.ts';

const lin: CurlyAxes = [
  { toLinear: (v) => v, fromLinear: (v) => v },
  { toLinear: (v) => v, fromLinear: (v) => v },
];

function logicleAxes() {
  const ws = newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });
  const def = logicleDef(262144, 0.5, 4.5, 0);
  const id = transformId(def);
  ws.transforms[id] = def;
  const dims = [
    { channel: 'A', comp: 'group' as const, transform: id },
    { channel: 'B', comp: 'group' as const, transform: id },
  ];
  return { axes: curlyAxes(ws, dims), dims };
}

describe('curly quadrant editing', () => {
  it('a new curly quadrant bends each leg 10% of the plot by its edge', () => {
    const g = newCurly([100, 100], lin, [1000, 1000], [0, 1000], [0, 1000]);
    expect(g.up.at(-1)![0]).toBeCloseTo(200, 9);
    expect(g.right.at(-1)![1]).toBeCloseTo(200, 9);
    expect(validateCurly(g.center, g.up, g.right)).toBeNull();
  });

  it('on logicle axes the legs run to the top of scale and do not cross', () => {
    const { axes, dims } = logicleAxes();
    const top = curlyTop(dims, [0, 0.9], [0, 0.9]);
    expect(top).toEqual([1, 1]);
    const g = newCurly([0.4, 0.4], axes, top, [0, 0.9], [0, 0.9]);
    expect(g.a[0]).toBeGreaterThan(0);
    expect(g.up.at(-1)![1]).toBe(1);
    expect(validateCurly(g.center, g.up, g.right)).toBeNull();
    // the upper leg curls right as it rises
    expect(g.up.at(-1)![0]).toBeGreaterThan(g.up[1]![0]);
  });

  it('dragging a leg handle puts the leg through the pointer at the handle', () => {
    const g = curlyGeometry([100, 100], [1, 1], lin, [1000, 1000]);
    const h = g.up[handleVertex(g.up)]!;
    const d = dragCurly(g, 'up', [h[0] + 30, h[1] + 500], lin)!;
    const k = handleVertex(d.up);
    expect(d.up[k]![1]).toBe(h[1]);
    expect(d.up[k]![0]).toBeCloseTo(h[0] + 30, 9);
    expect(d.a[1]).toBe(1);
    // dragged left of the center the leg is straight
    expect(dragCurly(g, 'right', [h[0], 50], lin)!.a).toEqual([1, 0]);
  });

  it('moving keeps the curliness and the legs’ reach; crossing legs are refused or eased', () => {
    const g = curlyGeometry([100, 100], [1, 2], lin, [1000, 1000]);
    const m = dragCurly(g, 'c', [150, 120], lin)!;
    expect(m.center).toEqual([150, 120]);
    expect(m.a).toEqual([1, 2]);
    expect(m.up.at(-1)![1]).toBe(1000);
    expect(withCurliness(g, [200, 200], lin)).toBeNull();
    const eased = curlyAt(curlyGeometry([1, 1], [0, 0], lin, [1000, 1000]), [1, 1], lin);
    expect(eased.a).toEqual([0, 0]);
    const r = (x: number, y: number) => curlyRegion(m.center, m.up, m.right, x, y);
    expect([r(100, 900), r(900, 900), r(900, 100), r(100, 100)]).toEqual([1, 2, 3, 4]);
  });
});
