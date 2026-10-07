import { describe, expect, it } from 'vitest';
import { pasteTargets } from './metadata.ts';

const at = (t: { r: number; c: number; raw: string }[]) => t.map(({ r, c, raw }) => `${r}${c}${raw}`);

describe('pasting into a selection', () => {
  it('fills the whole selection with a single value', () => {
    expect(at(pasteTargets([['x']], { r0: 2, c0: 1, r1: 0, c1: 2 }, 10, 5))).toEqual([
      '01x',
      '02x',
      '11x',
      '12x',
      '21x',
      '22x',
    ]);
  });

  it('repeats a block that fits the selection evenly', () => {
    expect(at(pasteTargets([['a'], ['b']], { r0: 0, c0: 0, r1: 3, c1: 0 }, 10, 5))).toEqual([
      '00a',
      '10b',
      '20a',
      '30b',
    ]);
  });

  it('places a block that does not fit at the top-left corner, clipped to the table', () => {
    expect(
      at(
        pasteTargets(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { r0: 4, c0: 3, r1: 6, c1: 4 },
          6,
          5,
        ),
      ),
    ).toEqual(['43a', '44b', '53c', '54d']);
    expect(at(pasteTargets([['a', 'b', 'c']], { r0: 0, c0: 3, r1: 0, c1: 3 }, 1, 5))).toEqual(['03a', '04b']);
  });
});
