import { describe, expect, it } from 'vitest';
import { formatTicks, parseTicks } from './ticks.ts';

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
