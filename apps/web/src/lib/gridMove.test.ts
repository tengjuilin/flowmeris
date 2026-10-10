import { describe, expect, it } from 'vitest';
import { dropSide, moveSlot, putSlot, trimSlots } from './gridMove.ts';

const ABCD = ['A', 'B', 'C', 'D'];

describe('moveSlot', () => {
  it('puts a plot before or after the target, shifting the slots between', () => {
    expect(moveSlot(ABCD, 0, 2, 'before')).toEqual(['B', 'A', 'C', 'D']);
    expect(moveSlot(ABCD, 0, 2, 'after')).toEqual(['B', 'C', 'A', 'D']);
    expect(moveSlot(ABCD, 3, 1, 'before')).toEqual(['A', 'D', 'B', 'C']);
    expect(moveSlot(ABCD, 3, 1, 'after')).toEqual(['A', 'B', 'D', 'C']);
  });

  it('leaves the slots as they are when the plot lands where it was', () => {
    expect(moveSlot(ABCD, 1, 1, 'after')).toEqual(ABCD);
    expect(moveSlot(ABCD, 0, 1, 'before')).toEqual(ABCD);
    expect(moveSlot(ABCD, 2, 1, 'after')).toEqual(ABCD);
  });

  it('shifts empty slots with the plots', () => {
    expect(moveSlot(['A', null, 'B', 'C'], 0, 3, 'after')).toEqual([null, 'B', 'C', 'A']);
    expect(moveSlot(['A', null, 'B'], 2, 0, 'before')).toEqual(['B', 'A']);
  });

  it('moves into an empty slot, leaving the old one empty, also past the end', () => {
    expect(moveSlot(['A', null, 'B'], 0, 1, 'into')).toEqual([null, 'A', 'B']);
    expect(moveSlot(['A', 'B'], 0, 4, 'into')).toEqual([null, 'B', null, null, 'A']);
    expect(moveSlot(['A', 'B'], 1, 3, 'into')).toEqual(['A', null, null, 'B']);
  });

  it('drops empty slots at the end', () => {
    expect(moveSlot(['A', 'B', null], 1, 2, 'into')).toEqual(['A', null, 'B']);
    expect(moveSlot(['A', 'B'], 1, 0, 'before')).toEqual(['B', 'A']);
    expect(moveSlot(['A', null, 'B'], 2, 1, 'into')).toEqual(['A', 'B']);
  });

  it('does nothing for an empty source slot', () => {
    expect(moveSlot(['A', null], 1, 0, 'before')).toEqual(['A', null]);
  });
});

describe('putSlot', () => {
  it('replaces the target, or fills an empty slot past the end', () => {
    expect(putSlot(ABCD, 1, 'X')).toEqual(['A', 'X', 'C', 'D']);
    expect(putSlot(['A'], 2, 'X')).toEqual(['A', null, 'X']);
  });

  it('moves a cut plot, leaving its slot empty', () => {
    expect(putSlot(ABCD, 1, 'D', 3)).toEqual(['A', 'D', 'C']);
    expect(putSlot(ABCD, 3, 'A', 0)).toEqual([null, 'B', 'C', 'A']);
    expect(putSlot(ABCD, 2, 'C', 2)).toEqual(ABCD);
  });
});

describe('trimSlots', () => {
  it('drops trailing empty slots only', () => {
    expect(trimSlots([null, 'A', null, null])).toEqual([null, 'A']);
  });
});

describe('dropSide', () => {
  it('is before or after a plot by the half dropped on, and into an empty slot', () => {
    expect(dropSide(true, 149, 100, 100)).toBe('before');
    expect(dropSide(true, 150, 100, 100)).toBe('after');
    expect(dropSide(false, 110, 100, 100)).toBe('into');
  });
});
