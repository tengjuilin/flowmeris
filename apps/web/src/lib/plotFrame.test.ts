import type { Gate, GatingTemplate, Geometry } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import type { DimMap } from './geometry.ts';
import { type ShownGate, hitGate, plotFrame, popAt, shapePx } from './plotFrame.ts';

const id: DimMap = { identity: true, f: (v) => v, inv: (v) => v };
const f = plotFrame([0, 1], [0, 1], 100, 100);
const shown = (gateId: string, geom: Geometry, dims = 2): ShownGate => ({
  gate: { id: gateId } as Gate,
  geom,
  maps: Array(dims).fill(id),
});

describe('plotFrame', () => {
  it('maps display units to pixels with y up, and back', () => {
    expect(f.X(0.25)).toBe(25);
    expect(f.Y(0.25)).toBe(75);
    expect(f.toData(25, 75)).toEqual([0.25, 0.25]);
  });
});

describe('hitGate', () => {
  const box = shown('box', { kind: 'rect', min: [0.1, 0.1], max: [0.5, 0.5] });
  const quad = shown('quad', { kind: 'quadrant', center: [0.8, 0.8] });

  it('finds a closed shape by its inside and a quadrant by its centre', () => {
    expect(shapePx(f, box.maps, box.geom)).toHaveLength(4);
    expect(hitGate(f, [box, quad], 30, 70, false)?.id).toBe('box');
    expect(hitGate(f, [box, quad], 85, 25, false)?.id).toBe('quad');
    expect(hitGate(f, [box, quad], 50, 5, false)).toBeUndefined();
  });

  it('prefers the gate drawn last', () => {
    const top = shown('top', { kind: 'rect', min: [0, 0], max: [1, 1] });
    expect(hitGate(f, [box, top], 30, 70, false)?.id).toBe('top');
  });

  it('on a histogram, finds a range between its edges at any height and a split near its divider', () => {
    const range = shown('range', { kind: 'rect', min: [0.2], max: [null] as unknown as number[] }, 1);
    expect(hitGate(f, [range], 90, 2, true)?.id).toBe('range');
    expect(hitGate(f, [range], 10, 2, true)).toBeUndefined();
    const split = shown('split', { kind: 'split', at: 0.5 }, 1);
    expect(hitGate(f, [split], 54, 50, true)?.id).toBe('split');
    expect(hitGate(f, [split], 60, 50, true)).toBeUndefined();
  });
});

describe('popAt', () => {
  const template = {
    populations: {
      q1: { id: 'q1', gate: 'quad', region: 'Q1' },
      q2: { id: 'q2', gate: 'quad', region: 'Q2' },
      q3: { id: 'q3', gate: 'quad', region: 'Q3' },
      q4: { id: 'q4', gate: 'quad', region: 'Q4' },
      lo: { id: 'lo', gate: 'split', region: 'lo' },
      hi: { id: 'hi', gate: 'split', region: 'hi' },
      in: { id: 'in', gate: 'box', region: 'in' },
    },
  } as unknown as GatingTemplate;

  it('answers with the quadrant the point is in: Q1 top left, then clockwise', () => {
    const quad = [shown('quad', { kind: 'quadrant', center: [0.5, 0.5] })];
    expect(popAt(f, template, quad, 10, 10, false)).toBe('q1');
    expect(popAt(f, template, quad, 90, 10, false)).toBe('q2');
    expect(popAt(f, template, quad, 90, 90, false)).toBe('q3');
    expect(popAt(f, template, quad, 10, 90, false)).toBe('q4');
  });

  it('answers with the side of a split', () => {
    const split = [shown('split', { kind: 'split', at: 0.5 }, 1)];
    expect(popAt(f, template, split, 10, 50, true)).toBe('lo');
    expect(popAt(f, template, split, 60, 50, true)).toBe('hi');
  });

  it('answers with a closed gate only inside it', () => {
    const box = [shown('box', { kind: 'rect', min: [0.1, 0.1], max: [0.5, 0.5] })];
    expect(popAt(f, template, box, 30, 70, false)).toBe('in');
    expect(popAt(f, template, box, 90, 10, false)).toBeUndefined();
  });
});
