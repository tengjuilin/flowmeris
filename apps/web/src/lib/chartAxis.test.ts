import { describe, expect, it } from 'vitest';
import { barPath, linearAxis, logAxis, makeAxis, validFix } from './chartAxis.ts';

describe('chart axes', () => {
  it('a linear axis pads the data by 5%, with nice ticks inside', () => {
    const a = linearAxis(1, 9, 0, 100, false, {});
    expect(a.lo).toBeLessThanOrEqual(0.6);
    expect(a.hi).toBeGreaterThanOrEqual(9.4);
    expect(a.ticks.map((t) => t.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(a.map(a.lo)).toBe(0);
    expect(a.map(a.hi)).toBe(100);
  });

  it('a bar axis starts at zero without padding below it', () => {
    const a = linearAxis(3, 9, 0, 100, true, {});
    expect(a.lo).toBe(0);
    expect(a.map(0)).toBe(0);
  });

  it('fixed ends are kept exactly, and ticks outside them dropped', () => {
    const a = linearAxis(1, 9, 0, 100, false, { min: 2, max: 7 });
    expect([a.lo, a.hi]).toEqual([2, 7]);
    expect(a.ticks.every((t) => t.pos >= 0 && t.pos <= 100)).toBe(true);
  });

  it('a single value gets a range around it', () => {
    const a = linearAxis(5, 5, 0, 100, false, {});
    expect(a.lo).toBeLessThan(5);
    expect(a.hi).toBeGreaterThan(5);
    const fixedMin = linearAxis(5, 5, 0, 100, false, { min: 5 });
    expect(fixedMin.lo).toBe(5);
    expect(fixedMin.hi).toBeGreaterThan(5);
  });

  it('a log axis labels decades, and 2 and 5 when it spans less than 1.5 decades', () => {
    const wide = logAxis(1, 1000, 0, 100, {});
    expect(wide.ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['10⁰', '10¹', '10²', '10³']);
    expect(wide.ticks.filter((t) => !t.major).every((t) => t.label === '')).toBe(true);
    const narrow = logAxis(1.5, 20, 0, 100, {});
    expect(narrow.ticks.map((t) => t.label).filter(Boolean)).toEqual(['2', '5', '10¹', '20']);
  });

  it('a log axis inside one decade labels its ends', () => {
    const a = logAxis(3, 4, 0, 100, {});
    expect(a.ticks.filter((t) => t.label).length).toBeGreaterThanOrEqual(2);
  });

  it('a range that cannot be drawn is ignored', () => {
    expect(validFix(5, 1, false)).toEqual({});
    expect(validFix(-1, 10, true)).toEqual({ max: 10 });
    expect(validFix(undefined, Number.NaN, false)).toEqual({});
    expect(validFix(1, 10, true)).toEqual({ min: 1, max: 10 });
  });

  it('custom ticks replace the automatic ones within the axis', () => {
    const a = makeAxis(0, 10, 0, 100, {
      log: false,
      zero: false,
      fix: { min: 0, max: 10 },
      ticks: [{ value: 0 }, { value: 5, label: 'mid' }, { value: 20 }],
    });
    expect(a.ticks).toEqual([
      { pos: 0, label: '0', major: true },
      { pos: 50, label: 'mid', major: true },
    ]);
  });

  it('bars have rounded data ends and square baselines', () => {
    expect(barPath(0, 10, 100, 40, 4)).toBe('M0,100V44Q0,40 4,40H6Q10,40 10,44V100Z');
    expect(barPath(0, 10, 0, 40, 4)).toBe('M0,0V36Q0,40 4,40H6Q10,40 10,36V0Z');
    // The radius never exceeds half the width or the height.
    expect(barPath(0, 4, 100, 99, 4)).toBe('M0,100V100Q0,99 1,99H3Q4,99 4,100V100Z');
  });
});
