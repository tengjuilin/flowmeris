import { describe, expect, it } from 'vitest';
import { jsonClone, sameJson, sortedJson } from './json.ts';

describe('JSON helpers for settings', () => {
  it('compare ignoring key order, at every depth', () => {
    expect(
      sameJson({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } }, { b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }),
    ).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });

  it('treat undefined members as absent', () => {
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sortedJson({ b: undefined, a: 1 })).toBe('{"a":1}');
  });

  it('copy deeply, dropping undefined members', () => {
    const src = { a: { b: [1, 2] }, c: undefined };
    const copy = jsonClone(src);
    expect(copy).toEqual({ a: { b: [1, 2] } });
    expect('c' in copy).toBe(false);
    expect(copy.a).not.toBe(src.a);
    expect(jsonClone(undefined)).toBeUndefined();
  });
});
