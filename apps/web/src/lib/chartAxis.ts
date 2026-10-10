import type { ChartStyle } from '@flowmeris/model';
import type { PlotSeries } from '@flowmeris/table';
import { formatLinear, formatPow10, niceLinearTicks } from '@flowmeris/transforms';

/** Axes of the statistics charts (Charts view): data value ↔ px, with ticks. */

export interface Axis {
  /** Data value → px. */
  map: (v: number) => number;
  ticks: { pos: number; label: string; major: boolean }[];
  lo: number;
  hi: number;
}

/** User-fixed ends of an axis, in data units. */
export interface Fix {
  min?: number;
  max?: number;
}

export function linearAxis(lo: number, hi: number, p0: number, p1: number, zero: boolean, fix: Fix): Axis {
  let a = fix.min ?? (zero ? Math.min(0, lo) : lo);
  let b = fix.max ?? (zero ? Math.max(0, hi) : hi);
  if (!(b > a)) {
    const d = Math.abs(fix.min ?? fix.max ?? a) * 0.1 || 1;
    if (fix.min === undefined && fix.max === undefined) {
      a -= d;
      b += d;
    } else if (fix.min === undefined) a = b - 2 * d;
    else b = a + 2 * d;
  }
  const pad = (b - a) * 0.05;
  if (fix.min === undefined && !(zero && a === 0)) a -= pad;
  if (fix.max === undefined && !(zero && b === 0)) b += pad;
  let t = niceLinearTicks(a, b, 6);
  if (fix.min === undefined) a = Math.min(a, t[0]!);
  if (fix.max === undefined) b = Math.max(b, t[t.length - 1]!);
  const eps = (b - a) * 1e-9;
  t = t.filter((v) => v >= a - eps && v <= b + eps);
  const map = (v: number) => p0 + ((v - a) / (b - a)) * (p1 - p0);
  return { map, lo: a, hi: b, ticks: t.map((v) => ({ pos: map(v), label: formatLinear(v), major: true })) };
}

/** Ticks at 1–9 × 10^k between 10^a and 10^b: decades labelled, and 2 and 5 on a short axis. */
function logTicks(a: number, b: number, map: (v: number) => number): Axis['ticks'] {
  const ticks: Axis['ticks'] = [];
  const decades = b - a;
  const eps = decades * 1e-9;
  for (let k = Math.floor(a); k <= Math.ceil(b); k++)
    for (let m = 1; m <= 9; m++) {
      const v = m * 10 ** k;
      const l = Math.log10(v);
      if (l < a - eps || l > b + eps) continue;
      const major = m === 1;
      const label = major ? formatPow10(1, k) : decades < 1.5 && (m === 2 || m === 5) ? formatLinear(v) : '';
      ticks.push({ pos: map(v), label, major });
    }
  return ticks;
}

export function logAxis(lo: number, hi: number, p0: number, p1: number, fix: Fix): Axis {
  let a = Math.log10(fix.min ?? lo);
  let b = Math.log10(fix.max ?? hi);
  if (!(b > a)) {
    if (fix.min === undefined && fix.max === undefined) {
      a -= 0.5;
      b += 0.5;
    } else if (fix.min === undefined) a = b - 1;
    else b = a + 1;
  }
  const pad = (b - a) * 0.05;
  if (fix.min === undefined) a -= pad;
  if (fix.max === undefined) b += pad;
  const map = (v: number) => p0 + ((Math.log10(v) - a) / (b - a)) * (p1 - p0);
  const ticks = logTicks(a, b, map);
  if (!ticks.some((t) => t.label)) {
    // Less than a decade with no 1/2/5 multiple inside: label the ends.
    for (const v of [10 ** a, 10 ** b])
      ticks.push({ pos: map(v), label: formatLinear(Number(v.toPrecision(2))), major: true });
  }
  return { map, lo: 10 ** a, hi: 10 ** b, ticks };
}

/** A fixed range that cannot be drawn (min ≥ max, or ≤ 0 on a log axis) is ignored. */
export function validFix(min: number | undefined, max: number | undefined, log: boolean): Fix {
  const ok = (v: number | undefined) => v !== undefined && Number.isFinite(v) && (!log || v > 0);
  if (ok(min) && ok(max) && !(max! > min!)) return {};
  return { ...(ok(min) ? { min } : {}), ...(ok(max) ? { max } : {}) };
}

/** An axis over the data extent [lo, hi], with the user's range and custom ticks applied. */
export function makeAxis(
  lo: number,
  hi: number,
  p0: number,
  p1: number,
  opts: { log: boolean; zero: boolean; fix: Fix; ticks: ChartStyle['xTicks'] },
): Axis {
  const axis = opts.log ? logAxis(lo, hi, p0, p1, opts.fix) : linearAxis(lo, hi, p0, p1, opts.zero, opts.fix);
  if (!opts.ticks) return axis;
  const [a, b] = [Math.min(axis.lo, axis.hi), Math.max(axis.lo, axis.hi)];
  const eps = (b - a) * 1e-9;
  axis.ticks = opts.ticks
    .filter((t) => t.value >= a - eps && t.value <= b + eps && (!opts.log || t.value > 0))
    .map((t) => ({ pos: axis.map(t.value), label: t.label ?? formatLinear(t.value), major: true }));
  return axis;
}

/** Bar path with a rounded data end (r px) and a square baseline end. */
export function barPath(x: number, w: number, yBase: number, yVal: number, r: number): string {
  const up = yVal < yBase;
  const h = Math.abs(yBase - yVal);
  const rr = Math.min(r, w / 2, h);
  if (up)
    return `M${x},${yBase}V${yVal + rr}Q${x},${yVal} ${x + rr},${yVal}H${x + w - rr}Q${x + w},${yVal} ${x + w},${yVal + rr}V${yBase}Z`;
  return `M${x},${yBase}V${yVal - rr}Q${x},${yVal} ${x + rr},${yVal}H${x + w - rr}Q${x + w},${yVal} ${x + w},${yVal - rr}V${yBase}Z`;
}

/**
 * Extents of what a chart draws: means, error bar ends and (if shown) replicates on y, numeric x values
 * unless x is a band. Values `okY`/`okX` reject (e.g. ≤ 0 on a log axis) are left out; `dropped` counts
 * the points that lose their mean or x that way.
 */
export function dataExtents(
  series: PlotSeries[],
  o: { okX: (v: number) => boolean; okY: (v: number) => boolean; band: boolean; showPoints: boolean },
) {
  const y = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
  const x = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
  const extend = (e: typeof y, v: number) => {
    e.min = Math.min(e.min, v);
    e.max = Math.max(e.max, v);
  };
  let dropped = 0;
  for (const p of series.flatMap((s) => s.points)) {
    const err = Number.isFinite(p.err) ? [p.mean - p.err, p.mean + p.err] : [];
    for (const v of [p.mean, ...err, ...(o.showPoints ? p.values : [])]) if (o.okY(v)) extend(y, v);
    if (!o.okY(p.mean)) dropped++;
    if (o.band || typeof p.x !== 'number') continue;
    if (o.okX(p.x)) extend(x, p.x);
    else dropped++;
  }
  return { yMin: y.min, yMax: y.max, xMin: x.min, xMax: x.max, dropped };
}
