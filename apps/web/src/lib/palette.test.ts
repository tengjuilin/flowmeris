import { type Group, newGroup } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { describe, expect, it } from 'vitest';
import { nextColor } from './palette.ts';

/** Add a population of the next color to `g` (as adding a gate does), returning its color. */
function add(g: Group, id: string): string {
  const color = nextColor(g);
  g.template.populations[id] = { id, parent: 'root', gate: 'gate', region: 'in', name: id, color } as never;
  return color;
}

describe('nextColor', () => {
  it('takes the palette in order, then cycles past the eighth population', () => {
    const g = newGroup('One', ['a'], ['FSC-A']);
    const colors = Array.from({ length: CATEGORICAL.length + 2 }, (_, i) => add(g, `p${i}`));
    expect(colors).toEqual([...CATEGORICAL, CATEGORICAL[0], CATEGORICAL[1]]);
  });

  it("reuses a deleted population's color before any other", () => {
    const g = newGroup('One', ['a'], ['FSC-A']);
    for (let i = 0; i < 4; i++) add(g, `p${i}`);
    Reflect.deleteProperty(g.template.populations, 'p1');
    expect(add(g, 'p4')).toBe(CATEGORICAL[1]);
    expect(add(g, 'p5')).toBe(CATEGORICAL[4]);
  });

  it('skips colors set by hand, in any case', () => {
    const g = newGroup('One', ['a'], ['FSC-A']);
    add(g, 'p0');
    g.template.populations.p0!.color = CATEGORICAL[0]!.toUpperCase();
    g.template.populations.x = { ...g.template.populations.p0!, id: 'x', color: CATEGORICAL[1]! };
    expect(add(g, 'p2')).toBe(CATEGORICAL[2]);
  });
});
