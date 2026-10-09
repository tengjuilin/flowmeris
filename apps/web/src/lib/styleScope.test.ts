import { describe, expect, it } from 'vitest';
import {
  type StyleScopes,
  applyShared,
  applyToScopes,
  carryShared,
  resetScopeEverywhere,
  scopeAtDefaults,
  scopesAtDefaults,
  scopesMatch,
  setPerScope,
  sharedMatch,
  withScopeChange,
} from './styleScope.ts';

interface S {
  size: number;
  title?: string;
}
interface H {
  id: string;
  channel: string;
  s: S;
  byChannel?: Record<string, S>;
  styleFollow?: boolean;
  styleBase?: S;
}
const A: StyleScopes<H, S> = {
  scope: (h) => h.channel,
  get: (h) => h.s,
  set: (h, s) => void (h.s = structuredClone(s)),
  saved: (h) => h.byChannel,
  setSaved: (h, saved) => void (h.byChannel = saved),
};
const DEF: S = { size: 1 };
const isDef = (s: S) => s.size === 1 && s.title === undefined;
const holder = (id = 'a', size = 1): H => ({ id, channel: 'x', s: { size } });
const toChannel = (h: H, ch: string) => withScopeChange(A, h, DEF, () => void (h.channel = ch));

describe('settings kept per scope', () => {
  it('carry the settings in use to a new scope while they follow the plot', () => {
    const h = holder('a', 5);
    expect(toChannel(h, 'y')).toBe(false);
    expect(h.s.size).toBe(5);
    expect(h.byChannel).toEqual({ x: { size: 5 } });
  });

  it('restore each scope’s own settings when kept per scope, defaults for a new one', () => {
    const h = holder('a', 5);
    setPerScope(h, true);
    expect(toChannel(h, 'y')).toBe(true);
    expect(h.s).toEqual(DEF);
    h.s.size = 7;
    toChannel(h, 'x');
    expect(h.s.size).toBe(5);
    toChannel(h, 'y');
    expect(h.s.size).toBe(7);
  });

  it('apply the current settings to every scope, including unused ones', () => {
    const h = holder('a', 5);
    setPerScope(h, true);
    toChannel(h, 'y');
    expect(scopesMatch(A, h, isDef)).toBe(false);
    h.s.size = 3;
    applyToScopes(A, h);
    expect(scopesMatch(A, h, isDef)).toBe(true);
    toChannel(h, 'z');
    expect(h.s.size).toBe(3);
  });

  it('reset one scope wherever it is shown or saved', () => {
    const [a, b] = [holder('a', 5), holder('b', 6)];
    setPerScope(b, true);
    toChannel(b, 'y');
    b.s.size = 9;
    resetScopeEverywhere(A, [a, b], 'x', DEF);
    expect(a.s).toEqual(DEF);
    expect(b.byChannel?.x).toEqual(DEF);
    expect(b.s.size).toBe(9);
    expect(scopeAtDefaults(A, [a, b], 'x', isDef)).toBe(true);
    expect(scopesAtDefaults(A, b, isDef)).toBe(false);
  });

  it('share settings across holders, each keeping its own title', () => {
    const share = (from: H, to: H): S => ({ ...from.s, title: to.s.title });
    const [a, b] = [holder('a', 5), { ...holder('b', 2), s: { size: 2, title: 'B' } }];
    expect(sharedMatch(A, share, [a, b], 'a')).toBe(false);
    applyShared(A, share, [a, b], 'a');
    expect(b.s).toEqual({ size: 5, title: 'B' });
    expect(sharedMatch(A, share, [a, b], 'a')).toBe(true);
    expect(carryShared(A, share, a, b)).toBe(false);
    a.s.size = 8;
    expect(carryShared(A, share, a, b)).toBe(true);
    expect(b.s.size).toBe(8);
  });
});
