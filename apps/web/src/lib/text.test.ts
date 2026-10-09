import { describe, expect, it } from 'vitest';
import { wrapText } from './text.ts';

describe('wrapping ridge labels', () => {
  const m = (s: string) => s.length * 10;
  it('keeps a short label on one line', () => {
    expect(wrapText('WT_rep1', 100, m)).toEqual(['WT_rep1']);
  });
  it('breaks at separators without losing text', () => {
    const lines = wrapText('2024-05 CD4 stim_rep1 (n=1,234)', 100, m);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => m(l) <= 100)).toBe(true);
    expect(lines.join('').replace(/\s/g, '')).toBe('2024-05CD4stim_rep1(n=1,234)');
  });
  it('breaks a word wider than the column between characters', () => {
    expect(wrapText('abcdefghijkl', 50, m)).toEqual(['abcde', 'fghij', 'kl']);
  });
});
