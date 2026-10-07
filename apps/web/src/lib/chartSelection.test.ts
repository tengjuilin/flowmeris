import { summaryForPlot } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { includedRows, pointKey, visiblePoints } from './chartSelection.ts';

const row = (id: string, g: string, dose: number, y: number) => ({
  id,
  values: { 'var:g': g, 'var:dose': dose, y },
});
const rows = [
  row('a', 'ctrl', 1, 1),
  row('b', 'ctrl', 1, 3),
  row('c', 'ctrl', 10, 5),
  row('d', 'drug', 1, 2),
  row('e', 'drug', 1, 100),
];

describe('chart point selection', () => {
  it('leaves excluded rows out of the means', () => {
    const s = summaryForPlot(includedRows(rows, ['e']), 'var:dose', 'y', 'var:g', 'sd');
    const drug = s.find((x) => x.key === 'drug')!;
    expect(drug.points.map((p) => [p.x, p.mean, p.n, p.rowIds])).toEqual([[1, 2, 1, ['d']]]);
  });

  it('drops hidden points, and series left without points', () => {
    const s = summaryForPlot(rows, 'var:dose', 'y', 'var:g', 'sd');
    const shown = visiblePoints(s, [pointKey('ctrl', 10), pointKey('drug', 1)]);
    expect(shown.map((x) => [x.key, x.points.map((p) => p.x)])).toEqual([['ctrl', [1]]]);
  });

  it('keys points without a series by null', () => {
    expect(pointKey(undefined, 'x')).toBe('[null,"x"]');
  });
});
