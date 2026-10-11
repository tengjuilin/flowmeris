import { describe, expect, it } from 'vitest';
import { bandSlots, chartMargins } from './chartLayout.ts';
import { DEFAULT_CHART_STYLE } from './chartStyle.ts';

describe('chart layout', () => {
  it('margins make room for titles and tick labels (the legend adds its own room)', () => {
    const st = { ...DEFAULT_CHART_STYLE, titleFontSize: 12, tickFontSize: 10, showTickLabels: true };
    expect(chartMargins(st, { xTitle: true, yTitle: true, yLabelW: 30 })).toEqual({
      l: 14 + 20 + 30 + 8,
      r: 20,
      t: 14,
      b: 20 + 30,
    });
    expect(
      chartMargins({ ...st, showTickLabels: false }, { xTitle: false, yTitle: false, yLabelW: 0 }),
    ).toEqual({ l: 22, r: 20, t: 14, b: 12 });
  });

  it('series share a category: at most 24 px each by default, else a set fraction of it', () => {
    expect(bandSlots(100, 2, undefined, true)).toEqual({ slot: 24, gap: 2, groupW: 50 });
    expect(bandSlots(20, 2, undefined, false)).toEqual({ slot: 8, gap: 4, groupW: 20 });
    expect(bandSlots(100, 2, 0.5, true)).toEqual({ slot: 24, gap: 2, groupW: 50 });
    expect(bandSlots(10, 3, 0.1, false).slot).toBe(1);
  });
});
