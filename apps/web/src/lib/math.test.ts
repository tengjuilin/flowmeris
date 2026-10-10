import { expect, it } from 'vitest';
import { clamp } from './math.ts';

it('clamp limits a value to the range', () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});
