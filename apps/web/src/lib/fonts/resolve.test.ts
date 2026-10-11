import { describe, expect, it } from 'vitest';
import { type FontStep, faceName, fontSteps, parseFamilies, textFont } from './resolve.ts';

const names = (steps: FontStep[]) =>
  steps.map((s) => ('bundled' in s ? s.bundled.family : `installed:${s.installed}`));

describe('text fonts', () => {
  it('reads the family list, weight and slant of a text', () => {
    expect(parseFamilies(`"Liberation Sans", 'Inter',sans-serif`)).toEqual([
      'Liberation Sans',
      'Inter',
      'sans-serif',
    ]);
    expect(textFont({ fontFamily: 'Inter', fontWeight: '700', fontStyle: 'italic' })).toEqual({
      families: ['Inter'],
      bold: true,
      italic: true,
    });
    expect(textFont({ fontFamily: 'x', fontWeight: '500', fontStyle: 'oblique 10deg' })).toMatchObject({
      bold: false,
      italic: true,
    });
    expect(textFont({ fontFamily: 'x', fontWeight: 'bold', fontStyle: 'normal' }).bold).toBe(true);
    expect([
      faceName(false, false),
      faceName(true, false),
      faceName(false, true),
      faceName(true, true),
    ]).toEqual(['regular', 'bold', 'italic', 'bolditalic']);
  });

  it('tries installed fonts in order and ends at the first bundled family', () => {
    expect(names(fontSteps(['Liberation Serif', 'serif']))).toEqual(['Liberation Serif']);
    expect(names(fontSteps(['Futura', 'Liberation Sans', 'sans-serif']))).toEqual([
      'installed:Futura',
      'Liberation Sans',
    ]);
    expect(names(fontSteps(['Futura', 'Optima']))).toEqual([
      'installed:Futura',
      'installed:Optima',
      'Liberation Sans',
    ]);
  });

  it('draws a generic family in its bundled stand-in', () => {
    expect(names(fontSteps(['serif']))).toEqual(['Liberation Serif']);
    expect(names(fontSteps(['Menlo', 'monospace']))).toEqual(['installed:Menlo', 'Liberation Mono']);
    expect(names(fontSteps(['dejavu sans']))).toEqual(['DejaVu Sans']);
  });
});
