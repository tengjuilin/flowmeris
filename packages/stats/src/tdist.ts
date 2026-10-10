import { sem } from './summary.ts';

/** Student's t distribution and the confidence interval of a replicate mean (M-STAT-AGG; docs/methods/statistics.md). */

/**
 * ln Γ(x) for x a positive multiple of ½ (all the t distribution needs), by
 * the recurrence Γ(x) = (x − 1)·Γ(x − 1) down to Γ(1) = 1 or Γ(½) = √π. Exact
 * up to rounding, unlike the usual Lanczos series (~1e-8 relative).
 */
function lnGammaHalf(x: number): number {
  let s = 0;
  let y = x;
  while (y > 1) {
    y -= 1;
    s += Math.log(y);
  }
  return y === 1 ? s : s + 0.5 * Math.log(Math.PI);
}

/** Stirling series of ln Γ(z) less its leading terms (truncation error < 1e-16 for z ≥ 30). */
function stirlingTail(z: number): number {
  const z2 = z * z;
  return (1 / 12 - (1 / 360 - (1 / 1260 - 1 / (1680 * z2)) / z2) / z2) / z;
}

/**
 * ln B(a, b) = ln Γ(a) + ln Γ(b) − ln Γ(a + b), for a and b positive multiples of ½. With b = ½
 * and large a (the t distribution with many degrees of freedom) the three ln Γ terms are large and
 * nearly cancel, so ln Γ(a + ½) − ln Γ(a) is taken from Stirling's series instead, with the leading
 * terms (a)·ln(a + ½) − (a − ½)·ln a − ½ rewritten as ½·ln a + a·log1p(1/(2a)) − ½.
 */
function lnBetaHalf(a: number, b: number): number {
  if (b === 0.5 && a >= 30) {
    const ratio =
      0.5 * Math.log(a) + a * Math.log1p(1 / (2 * a)) - 0.5 + stirlingTail(a + 0.5) - stirlingTail(a);
    return 0.5 * Math.log(Math.PI) - ratio;
  }
  return lnGammaHalf(a) + lnGammaHalf(b) - lnGammaHalf(a + b);
}

/** Continued fraction of the regularised incomplete beta function (modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b), for a and b positive multiples of ½. */
function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = -lnBetaHalf(a, b) + a * Math.log(x) + b * Math.log(1 - x);
  return x < (a + 1) / (a + b + 2)
    ? (Math.exp(lbt) * betaCf(a, b, x)) / a
    : 1 - (Math.exp(lbt) * betaCf(b, a, 1 - x)) / b;
}

/** P(T > t) for t ≥ 0, Student's t with `df` degrees of freedom (no 1 − p cancellation). */
function tUpper(t: number, df: number): number {
  return 0.5 * betaInc(df / (df + t * t), df / 2, 0.5);
}

/** Student's t cumulative distribution function with `df` (integer) degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const tail = tUpper(Math.abs(t), df);
  return t >= 0 ? 1 - tail : tail;
}

/** Quantile of Student's t distribution (0 < p < 1), by bisection on the upper tail. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0) || !Number.isInteger(df)) return Number.NaN;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  const q = 1 - p;
  let lo = 0;
  let hi = 1;
  while (tUpper(hi, df) > q) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-14 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (tUpper(mid, df) > q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Half-width of the two-sided 95% confidence interval of the mean: t₀.₉₇₅,ₙ₋₁ · SEM. */
export function ci95HalfWidth(xs: ArrayLike<number>): number {
  return xs.length < 2 ? Number.NaN : tQuantile(0.975, xs.length - 1) * sem(xs);
}
