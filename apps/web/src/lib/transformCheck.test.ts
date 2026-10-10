import type { Transform } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { cofactorError, transformError } from './transformCheck.ts';

describe('transformError', () => {
  it('accepts usable scales', () => {
    const ok: Transform[] = [
      { kind: 'flin', T: 262144, A: 0 },
      { kind: 'flog', T: 262144, M: 4.5 },
      { kind: 'fasinh', T: 262144, M: 4, A: 0 },
      { kind: 'logicle', T: 262144, W: 0.5, M: 4.5, A: 0 },
    ];
    for (const t of ok) expect(transformError(t)).toBeNull();
  });

  it.each([
    [{ kind: 'flin', T: 0, A: 0 }, 'Linear: T must be > 0'],
    [{ kind: 'flin', T: 100, A: -1 }, 'Linear: A must be ≥ 0'],
    [{ kind: 'flog', T: -5, M: 4 }, 'Log10: T must be > 0'],
    [{ kind: 'flog', T: 100, M: 0 }, 'Log10: M must be > 0'],
    [{ kind: 'fasinh', T: 100, M: 0, A: 0 }, 'Arcsinh: M must be > 0'],
    [{ kind: 'logicle', T: 100, W: -1, M: 4.5, A: 0 }, 'Logicle: W must be ≥ 0'],
    [{ kind: 'logicle', T: 100, W: 3, M: 4.5, A: 0 }, 'Logicle: W must be ≤ M/2'],
    [{ kind: 'flog', T: Number.NaN, M: 4 }, 'Log10: T must be a finite number'],
  ] as [Transform, string][])('refuses %j: %s', (t, message) => {
    expect(transformError(t)).toBe(message);
  });
});

describe('cofactorError', () => {
  it('accepts a positive cofactor and refuses others', () => {
    expect(cofactorError(150)).toBeNull();
    expect(cofactorError(0)).toBe('Arcsinh: cofactor must be > 0');
    expect(cofactorError(-1)).toBe('Arcsinh: cofactor must be > 0');
  });
});
