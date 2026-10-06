import type { Transform } from '@flowmeris/model';
import { Hyperlog, Logicle } from './logicle.ts';

export { Hyperlog, Logicle, LogicleParameterError, validateLogicle } from './logicle.ts';
export * from './ticks.ts';

/**
 * A scale transform: data units ↔ display (scale) units.
 * All Gating-ML 2.0 transforms map the top of scale T to 1.
 */
export interface Scale {
  readonly def: Transform;
  apply(x: number): number;
  inverse(y: number): number;
  /** Vectorised forward transform into a Float64Array. */
  applyArray(src: ArrayLike<number>, out?: Float64Array): Float64Array;
}

const LN10 = Math.LN10;

/**
 * Build a Scale from its Gating-ML definition (methods M-TR-*):
 *
 *  flin    f(x) = (x + A) / (T + A)
 *  flog    f(x) = (1/M)·log10(x/T) + 1                 (NaN for x ≤ 0; M-TR-LOGNP)
 *  fasinh  f(x) = (asinh(x·sinh(M·ln10)/T) + A·ln10) / ((M + A)·ln10)
 *  logicle f    = inverse of the biexponential B(y) (Moore & Parks 2012)
 *  hyperlog f   = inverse of the hyperlog function (Bagwell 2005)
 */
export function makeScale(def: Transform): Scale {
  let apply: (x: number) => number;
  let inverse: (y: number) => number;
  switch (def.kind) {
    case 'flin': {
      const { T, A } = def;
      apply = (x) => (x + A) / (T + A);
      inverse = (y) => y * (T + A) - A;
      break;
    }
    case 'flog': {
      const { T, M } = def;
      apply = (x) => (x > 0 ? (1 / M) * Math.log10(x / T) + 1 : Number.NaN);
      inverse = (y) => T * 10 ** ((y - 1) * M);
      break;
    }
    case 'fasinh': {
      const { T, M, A } = def;
      const preScale = Math.sinh(M * LN10) / T;
      const transpose = A * LN10;
      const divisor = (M + A) * LN10;
      apply = (x) => (Math.asinh(x * preScale) + transpose) / divisor;
      inverse = (y) => Math.sinh(y * divisor - transpose) / preScale;
      break;
    }
    case 'logicle': {
      const l = new Logicle(def.T, def.W, def.M, def.A);
      apply = (x) => l.scale(x);
      inverse = (y) => l.inverse(y);
      break;
    }
    case 'hyperlog': {
      const h = new Hyperlog(def.T, def.W, def.M, def.A);
      apply = (x) => h.scale(x);
      inverse = (y) => h.inverse(y);
      break;
    }
  }
  return {
    def,
    apply,
    inverse,
    applyArray(src, out) {
      const n = src.length;
      const res = out ?? new Float64Array(n);
      for (let i = 0; i < n; i++) res[i] = apply(src[i] as number);
      return res;
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience constructors with flow-cytometry-friendly defaults
// ---------------------------------------------------------------------------

/** Linear axis from `min` to `max` data units → [0, 1]. */
export function linearDef(max: number, min = 0): Transform {
  return { kind: 'flin', T: max, A: Math.max(0, -min) };
}

/** log10 axis spanning `decades` decades below `max`. */
export function logDef(max: number, decades = 5): Transform {
  return { kind: 'flog', T: max, M: decades };
}

/** Logicle with the common defaults W = 0.5, M = 4.5, A = 0. */
export function logicleDef(T = 262144, W = 0.5, M = 4.5, A = 0): Transform {
  return { kind: 'logicle', T, W, M, A };
}

/**
 * arcsinh(x / cofactor), expressed in Gating-ML fasinh parameters: for a
 * given top of scale T, M = asinh(T / cofactor) / ln10, so that
 * fasinh(x) = (asinh(x / cofactor) + A·ln10) / ((M + A)·ln10).
 */
export function asinhDefFromCofactor(cofactor: number, T = 262144, A = 0): Transform {
  return { kind: 'fasinh', T, M: Math.asinh(T / cofactor) / LN10, A };
}

/** Cofactor c of a fasinh definition: c = T / sinh(M·ln10). */
export function asinhCofactor(def: Extract<Transform, { kind: 'fasinh' }>): number {
  return def.T / Math.sinh(def.M * LN10);
}

/**
 * Suggested logicle W from the data (Parks et al. 2006, eq. 13 / Moore & Parks 2012):
 * W = (M − log10(T / |r|)) / 2, where r is the 5th percentile of the negative
 * data (the "reference" low value). Returns 0 when there are no negative values.
 */
export function suggestLogicleW(values: ArrayLike<number>, T: number, M: number): number {
  const neg: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (v < 0) neg.push(v);
  }
  if (neg.length === 0) return 0;
  neg.sort((a, b) => a - b);
  const r = neg[Math.floor(0.05 * (neg.length - 1))] as number;
  const w = (M - Math.log10(T / Math.abs(r))) / 2;
  return Math.min(Math.max(w, 0), M / 2);
}
