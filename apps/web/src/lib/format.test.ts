import { describe, expect, it } from 'vitest';
import { toSigFigs } from './format.ts';

describe('toSigFigs', () => {
  it('rounds to n significant figures in plain notation', () => {
    expect(toSigFigs(1.23456, 3)).toBe('1.23');
    expect(toSigFigs(12345.6, 3)).toBe('12300');
    expect(toSigFigs(0.000123456, 2)).toBe('0.00012');
    expect(toSigFigs(-0.98765, 2)).toBe('-0.99');
    expect(toSigFigs(1234567, 1)).toBe('1000000');
  });

  it('keeps trailing zeros and carries across a power of ten', () => {
    expect(toSigFigs(1.5, 3)).toBe('1.50');
    expect(toSigFigs(0.0012, 3)).toBe('0.00120');
    expect(toSigFigs(9.996, 3)).toBe('10.0');
    expect(toSigFigs(0, 3)).toBe('0.00');
  });

  it('passes non-finite values through', () => {
    expect(toSigFigs(Number.POSITIVE_INFINITY, 3)).toBe('Infinity');
    expect(toSigFigs(Number.NaN, 3)).toBe('NaN');
  });
});
