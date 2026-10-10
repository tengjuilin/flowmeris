import { describe, expect, it } from 'vitest';
import { moveIds } from './order.ts';

describe('moving ids in a list', () => {
  it('moves ids, in their order in the list, before or after the target', () => {
    expect(moveIds(['a', 'b', 'c', 'd'], ['d', 'b'], 'a', false)).toEqual(['b', 'd', 'a', 'c']);
    expect(moveIds(['a', 'b', 'c', 'd'], ['a'], 'c', true)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIds(['a', 'b', 'c', 'd'], ['a'], 'd', true)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('does nothing when the target is one of the ids', () => {
    expect(moveIds(['a', 'b'], ['a', 'b'], 'b', true)).toBeNull();
    expect(moveIds(['a', 'b'], ['a'], 'a', false)).toBeNull();
  });
});
