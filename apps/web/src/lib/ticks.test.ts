import { describe, expect, it } from 'vitest';
import { customTicks, formatHistTick, formatTicks, histYTicks, parseTicks } from './ticks.ts';

describe('parseTicks', () => {
  it('reads values and labels, one per line or comma', () => {
    expect(parseTicks('0\n1000 = 1k, 1e4=10k')).toEqual([
      { value: 0 },
      { value: 1000, label: '1k' },
      { value: 10000, label: '10k' },
    ]);
  });
  it('skips blank entries and returns [] for empty text', () => {
    expect(parseTicks(' \n,\n')).toEqual([]);
  });
  it('returns null when a value is not a number', () => {
    expect(parseTicks('10\nabc = x')).toBeNull();
  });
  it('keeps an empty label after "="', () => {
    expect(parseTicks('5 =')).toEqual([{ value: 5, label: '' }]);
  });
});

describe('formatTicks', () => {
  it('writes one tick per line and round-trips through parseTicks', () => {
    const ticks = [{ value: 0 }, { value: 1000, label: '1k' }];
    expect(formatTicks(ticks)).toBe('0\n1000 = 1k');
    expect(parseTicks(formatTicks(ticks))).toEqual(ticks);
  });
  it('is empty for no ticks', () => {
    expect(formatTicks(undefined)).toBe('');
  });
});

describe('customTicks', () => {
  it('places ticks on the scale, formats missing labels and drops those off the axis', () => {
    const t = customTicks(
      [{ value: 10 }, { value: 100, label: 'hundred' }, { value: 1e6 }],
      Math.log10,
      [0, 3],
    );
    expect(t).toEqual([
      { pos: 1, label: '10', major: true },
      { pos: 2, label: 'hundred', major: true },
    ]);
  });

  it('drops ticks the scale cannot place', () => {
    expect(customTicks([{ value: -1 }], Math.log10, [-10, 10])).toEqual([]);
  });
});

describe('histYTicks', () => {
  it('uses quarters up to the top for a mode-normalized histogram', () => {
    expect(histYTicks(1.05, 'mode')).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(histYTicks(0.6, 'mode')).toEqual([0, 0.25, 0.5]);
  });

  it('steps by 1, 2 or 5 times a power of ten, about five ticks', () => {
    expect(histYTicks(1000, 'count')).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(histYTicks(42, 'count')).toEqual([0, 10, 20, 30, 40]);
    expect(histYTicks(0, 'count')).toEqual([0]);
  });
});

describe('formatHistTick', () => {
  it('formats by what the y axis shows', () => {
    expect(formatHistTick(0.25, 'mode')).toBe('25');
    expect(formatHistTick(0.0123, 'area')).toBe('0.012');
    expect(formatHistTick(400, 'count')).toBe('400');
    expect(formatHistTick(1500, 'count')).toBe('1.5k');
  });
});
