import { describe, expect, it } from 'vitest';
import { backgateHeights, contourPath, histAreaPath, histTop } from './plotPaths.ts';

const X = (v: number) => v * 10;
const Y = (v: number) => 100 - v * 10;

describe('histogram paths', () => {
  it('put the top 5% above the highest bin of any series', () => {
    expect(
      histTop([
        [1, 4, 2],
        [0, 10],
      ]),
    ).toBeCloseTo(10.5);
    expect(histTop([[0, 0]])).toBe(1);
  });

  it('close the area under the bins along the x axis, from the outer bin edges', () => {
    expect(histAreaPath([1, 3], [5, 10], 10, X, 100)).toBe('M0,100L10,50L30,0L40,100Z');
  });

  it('scale backgate counts to the shown normalisation', () => {
    // the shown histogram is the base counts normalised to unit area
    expect(backgateHeights([0.25, 0.75], [10, 30], [2, 4])).toEqual([0.05, 0.1]);
    expect(backgateHeights([1], [0], [3])).toEqual([0]);
  });
});

describe('contourPath', () => {
  it('draws each ring as a closed subpath', () => {
    expect(
      contourPath(
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          [[2, 2]],
        ],
        X,
        Y,
      ),
    ).toBe('M0,100L10,100L10,90ZM20,80Z');
  });
});
