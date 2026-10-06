/**
 * Logicle and Hyperlog scales (methods M-TR-LOGICLE, M-TR-HYPERLOG).
 *
 * Direct TypeScript port of the reference algorithms:
 *  - Moore W.A., Parks D.R. (2012) Update for the logicle data scale including
 *    operational code implementations. Cytometry A 81A:273–277.
 *  - Parks D.R., Roederer M., Moore W.A. (2006) A new "Logicle" display method
 *    avoids deceptive effects of logarithmic scaling for low signals and
 *    compensated data. Cytometry A 69A:541–551.
 *  - Bagwell C.B. (2005) Hyperlog—a flexible log-like transform for negative,
 *    zero, and positive valued data. Cytometry A 64A:34–42.
 *
 * Parameterisation follows Gating-ML 2.0 (T, W, M, A); the scale maps T to 1
 * and 0 to x1 = (A + W) / (M + A).
 */

const LN10 = Math.LN10;
const EPS = Number.EPSILON;
const TAYLOR_LENGTH = 16;

export class LogicleParameterError extends RangeError {}

export function validateLogicle(T: number, W: number, M: number, A: number): void {
  if (!(T > 0)) throw new LogicleParameterError('Logicle: T must be > 0');
  if (!(W >= 0)) throw new LogicleParameterError('Logicle: W must be ≥ 0');
  if (!(M > 0)) throw new LogicleParameterError('Logicle: M must be > 0');
  if (!(2 * W <= M)) throw new LogicleParameterError('Logicle: W must be ≤ M/2');
  if (!(-A <= W && A + W <= M - W))
    throw new LogicleParameterError('Logicle: A must satisfy −W ≤ A ≤ M − 2W');
}

/** Solve 2·ln(d) + w·d = 2·ln(b) − w·b for d (Moore & Parks 2012, appendix). */
function solveD(b: number, w: number): number {
  // d → b as w → 0. For w below 1e-12 the Newton/bisection iteration loses all
  // precision (subnormal arithmetic), so the limit is used (M-TR-LOGICLE note 1).
  if (w < 1e-12) return b;
  const tolerance = 2 * b * EPS;
  let dLo = 0;
  let dHi = b;
  let d = (dLo + dHi) / 2;
  let lastDelta = dHi - dLo;
  const fB = -2 * Math.log(b) + w * b;
  let f = 2 * Math.log(d) + w * d + fB;
  let lastF = Number.NaN;
  for (let i = 1; i < 20; i++) {
    const df = 2 / d + w;
    let delta: number;
    if (((d - dHi) * df - f) * ((d - dLo) * df - f) >= 0 || Math.abs(1.9 * f) > Math.abs(lastDelta * df)) {
      // bisection
      delta = (dHi - dLo) / 2;
      d = dLo + delta;
      if (d === dLo) return d;
    } else {
      // Newton
      delta = f / df;
      const t = d;
      d -= delta;
      if (d === t) return d;
    }
    if (Math.abs(delta) < tolerance) return d;
    lastDelta = delta;
    f = 2 * Math.log(d) + w * d + fB;
    if (f === 0 || f === lastF) return d;
    lastF = f;
    if (f < 0) dLo = d;
    else dHi = d;
  }
  throw new Error('Logicle: solveD did not converge');
}

/** Solve inverse(s) = value for s ≥ x1 by bracketing + bisection (value > 0). */
function bisectInverse(inverse: (s: number) => number, value: number, x1: number): number {
  let lo = x1;
  let hi = x1 + 1;
  for (let i = 0; i < 64 && inverse(hi) < value; i++) hi = x1 + (hi - x1) * 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (inverse(mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export class Logicle {
  readonly T: number;
  readonly W: number;
  readonly M: number;
  readonly A: number;
  private readonly a: number;
  private readonly b: number;
  private readonly c: number;
  private readonly d: number;
  private readonly f: number;
  readonly x0: number;
  readonly x1: number;
  readonly x2: number;
  private readonly xTaylor: number;
  private readonly taylor: Float64Array;

  constructor(T: number, W: number, M: number, A: number) {
    validateLogicle(T, W, M, A);
    this.T = T;
    this.W = W;
    this.M = M;
    this.A = A;
    const w = W / (M + A);
    this.x2 = A / (M + A);
    this.x1 = this.x2 + w;
    this.x0 = this.x2 + 2 * w;
    this.b = (M + A) * LN10;
    this.d = solveD(this.b, w);
    const cA = Math.exp(this.x0 * (this.b + this.d));
    const mfA = Math.exp(this.b * this.x1) - cA / Math.exp(this.d * this.x1);
    this.a = T / (Math.exp(this.b) - mfA - cA / Math.exp(this.d));
    this.c = cA * this.a;
    this.f = -mfA * this.a;
    this.xTaylor = this.x1 + w / 4;
    let posCoef = this.a * Math.exp(this.b * this.x1);
    let negCoef = -this.c / Math.exp(this.d * this.x1);
    this.taylor = new Float64Array(TAYLOR_LENGTH);
    for (let i = 0; i < TAYLOR_LENGTH; i++) {
      posCoef *= this.b / (i + 1);
      negCoef *= -this.d / (i + 1);
      this.taylor[i] = posCoef + negCoef;
    }
    this.taylor[1] = 0; // exact by the logicle condition
  }

  private series(scale: number): number {
    const x = scale - this.x1;
    const t = this.taylor;
    let sum = (t[TAYLOR_LENGTH - 1] as number) * x;
    for (let i = TAYLOR_LENGTH - 2; i >= 2; i--) sum = (sum + (t[i] as number)) * x;
    return (sum * x + (t[0] as number)) * x;
  }

  /** Data value → scale value. */
  scale(value: number): number {
    if (Number.isNaN(value)) return Number.NaN;
    if (value === 0) return this.x1;
    const negative = value < 0;
    if (negative) value = -value;
    // Initial guess (reference algorithm), except that the logarithmic guess is
    // only used when it lies above x1: for W = 0 (f = 0) the reference would
    // start tiny values far below x1, outside the Taylor region (note 3).
    const logGuess = Math.log(value / this.a) / this.b;
    let x = value < this.f || !(logGuess > this.x1) ? this.x1 + value / (this.taylor[0] as number) : logGuess;
    const tolerance = x > 1 ? 3 * x * EPS : 3 * EPS;
    for (let i = 0; i < 40; i++) {
      const ae2bx = this.a * Math.exp(this.b * x);
      const ce2mdx = this.c / Math.exp(this.d * x);
      const y = x < this.xTaylor ? this.series(x) - value : ae2bx + this.f - (ce2mdx + value);
      const abe2bx = this.b * ae2bx;
      const cde2mdx = this.d * ce2mdx;
      const dy = abe2bx + cde2mdx;
      const ddy = this.b * abe2bx - this.d * cde2mdx;
      const delta = y / (dy * (1 - (y * ddy) / (2 * dy * dy)));
      x -= delta;
      if (Math.abs(delta) < tolerance) return negative ? 2 * this.x1 - x : x;
    }
    // Halley's method can stall for extreme inputs (e.g. subnormals with W = 0);
    // fall back to bisection on the monotone inverse (M-TR-LOGICLE, note 2).
    const r = bisectInverse((s) => this.inverse(s), value, this.x1);
    return negative ? 2 * this.x1 - r : r;
  }

  /** Scale value → data value. */
  inverse(scale: number): number {
    if (Number.isNaN(scale)) return Number.NaN;
    const negative = scale < this.x1;
    if (negative) scale = 2 * this.x1 - scale;
    const inv =
      scale < this.xTaylor
        ? this.series(scale)
        : this.a * Math.exp(this.b * scale) + this.f - this.c / Math.exp(this.d * scale);
    return negative ? -inv : inv;
  }
}

export class Hyperlog {
  readonly T: number;
  readonly W: number;
  readonly M: number;
  readonly A: number;
  private readonly a: number;
  private readonly b: number;
  private readonly c: number;
  private readonly f: number;
  readonly x0: number;
  readonly x1: number;
  readonly x2: number;
  private readonly xTaylor: number;
  private readonly taylor: Float64Array;
  private readonly inverseX0: number;

  constructor(T: number, W: number, M: number, A: number) {
    if (!(T > 0) || !(W > 0) || !(M > 0) || !(2 * W <= M) || !(-A <= W && A + W <= M - W)) {
      throw new LogicleParameterError('Hyperlog: invalid parameters (T>0, W>0, M>0, W≤M/2, −W≤A≤M−2W)');
    }
    this.T = T;
    this.W = W;
    this.M = M;
    this.A = A;
    const w = W / (M + A);
    this.x2 = A / (M + A);
    this.x1 = this.x2 + w;
    this.x0 = this.x2 + 2 * w;
    this.b = (M + A) * LN10;
    const e0 = Math.exp(this.b * this.x0);
    const cA = e0 / w;
    const fA = Math.exp(this.b * this.x1) + cA * this.x1;
    this.a = T / (Math.exp(this.b) + cA - fA);
    this.c = cA * this.a;
    this.f = fA * this.a;
    this.xTaylor = this.x1 + w / 4;
    let coef = this.a * Math.exp(this.b * this.x1);
    this.taylor = new Float64Array(TAYLOR_LENGTH);
    for (let i = 0; i < TAYLOR_LENGTH; i++) {
      coef *= this.b / (i + 1);
      this.taylor[i] = coef;
    }
    this.taylor[0] = (this.taylor[0] as number) + this.c;
    this.inverseX0 = this.inverse(this.x0);
  }

  private series(scale: number): number {
    const x = scale - this.x1;
    const t = this.taylor;
    let sum = (t[TAYLOR_LENGTH - 1] as number) * x;
    for (let i = TAYLOR_LENGTH - 2; i >= 1; i--) sum = (sum + (t[i] as number)) * x;
    return (sum + (t[0] as number)) * x;
  }

  scale(value: number): number {
    if (Number.isNaN(value)) return Number.NaN;
    if (value === 0) return this.x1;
    const negative = value < 0;
    if (negative) value = -value;
    // Initial guess: linear near zero, logarithmic above the quasi-linear region.
    let x =
      value < this.inverseX0
        ? this.x1 + value / (this.taylor[0] as number)
        : Math.log(value / this.a) / this.b;
    const tolerance = x > 1 ? 3 * x * EPS : 3 * EPS;
    for (let i = 0; i < 40; i++) {
      const ae2bx = this.a * Math.exp(this.b * x);
      const y = x < this.xTaylor ? this.series(x) - value : ae2bx + this.c * x - (this.f + value);
      const abe2bx = this.b * ae2bx;
      const dy = abe2bx + this.c;
      const ddy = this.b * abe2bx;
      const delta = y / (dy * (1 - (y * ddy) / (2 * dy * dy)));
      x -= delta;
      if (Math.abs(delta) < tolerance) return negative ? 2 * this.x1 - x : x;
    }
    const r = bisectInverse((s) => this.inverse(s), value, this.x1);
    return negative ? 2 * this.x1 - r : r;
  }

  inverse(scale: number): number {
    if (Number.isNaN(scale)) return Number.NaN;
    const negative = scale < this.x1;
    if (negative) scale = 2 * this.x1 - scale;
    const inv =
      scale < this.xTaylor ? this.series(scale) : this.a * Math.exp(this.b * scale) + this.c * scale - this.f;
    return negative ? -inv : inv;
  }
}
