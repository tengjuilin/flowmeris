import { describe, expect, it } from 'vitest';
import { clampFontSize, scaleFontSizes } from './textScale.ts';

describe('base font size', () => {
  it('scales the other sizes by the same factor, to half pixels, within 4–48', () => {
    const f = { fontSize: 10, a: 11, b: 9, c: 40, other: 7 };
    expect(scaleFontSizes(f, ['a', 'b', 'c'], 15)).toBe(true);
    expect(f).toEqual({ fontSize: 15, a: 16.5, b: 13.5, c: 48, other: 7 });
    expect(scaleFontSizes(f, ['a'], 15)).toBe(false);
    expect(scaleFontSizes(f, ['a'], 100)).toBe(true);
    expect(f.fontSize).toBe(48);
  });

  it('keeps sizes within 4–48 px', () => {
    expect(clampFontSize(2)).toBe(4);
    expect(clampFontSize(60)).toBe(48);
    expect(clampFontSize(12.5)).toBe(12.5);
  });
});
