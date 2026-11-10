import { describe, expect, it } from 'vitest';
import { LastResult } from './lastResult.ts';

describe('LastResult', () => {
  it('computes again only when an input is a different object', () => {
    const last = new LastResult<number[]>();
    const a = { n: 1 };
    let runs = 0;
    const compute = () => [++runs];
    const first = last.get([a, 'x'], compute);
    expect(last.get([a, 'x'], compute)).toBe(first);
    expect(runs).toBe(1);
    expect(last.get([{ n: 1 }, 'x'], compute)).toEqual([2]);
    expect(last.get([{ n: 1 }, 'x', 3], compute)).toEqual([3]);
  });

  it('remembers an undefined result', () => {
    const last = new LastResult<undefined>();
    let runs = 0;
    last.get([1], () => void runs++);
    last.get([1], () => void runs++);
    expect(runs).toBe(1);
  });
});
