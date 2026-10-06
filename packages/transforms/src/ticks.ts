import type { Transform } from '@flowmeris/model';

export interface Tick {
  /** Data value. */
  value: number;
  /** Position in scale (display) units. */
  pos: number;
  major: boolean;
  /** Label for major ticks (empty when suppressed to avoid crowding). */
  label: string;
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Format ±10^k as "10³" / "−10³"; 0 as "0". */
export function formatPow10(sign: number, k: number): string {
  if (sign === 0) return '0';
  const exp = String(k)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
  return `${sign < 0 ? '−' : ''}10${exp}`;
}

/** "Nice" linear ticks (1, 2, 5 × 10^k steps). */
export function niceLinearTicks(lo: number, hi: number, target = 6): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step)
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function formatLinear(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  const trim = (x: number) => String(Number(x.toPrecision(4)));
  if (a >= 1e9) return `${sign}${trim(a / 1e9)}G`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}K`;
  if (a < 1e-3) {
    const k = Math.floor(Math.log10(a));
    return `${sign}${trim(a / 10 ** k)}×${formatPow10(1, k)}`;
  }
  return `${sign}${trim(a)}`;
}

/**
 * Axis ticks for a transform over a display range [lo, hi] in scale units.
 *
 * - flin: nice linear ticks in data units.
 * - flog, fasinh, logicle, hyperlog: decade ticks ±10^k (major, labelled) plus
 *   2–9 × 10^k minor ticks, and 0 when it is on scale. Major labels that would
 *   fall closer than `minLabelGap` (scale units) to an already-labelled tick
 *   are suppressed, which handles crowding around zero.
 */
export function axisTicks(
  def: Transform,
  forward: (x: number) => number,
  inverse: (y: number) => number,
  lo: number,
  hi: number,
  minLabelGap = 0.045,
): Tick[] {
  const ticks: Tick[] = [];
  const inRange = (p: number) => Number.isFinite(p) && p >= lo - 1e-9 && p <= hi + 1e-9;
  if (def.kind === 'flin') {
    const dLo = inverse(lo);
    const dHi = inverse(hi);
    for (const v of niceLinearTicks(Math.min(dLo, dHi), Math.max(dLo, dHi))) {
      const pos = forward(v);
      if (inRange(pos)) ticks.push({ value: v, pos, major: true, label: formatLinear(v) });
    }
    return ticks;
  }
  const dLo = inverse(lo);
  const dHi = inverse(hi);
  const maxAbs = Math.max(Math.abs(dLo), Math.abs(dHi), 1);
  const kMax = Math.ceil(Math.log10(maxAbs)) + 1;
  const kMin = def.kind === 'flog' ? Math.floor(Math.log10(Math.max(dLo, Number.MIN_VALUE))) - 1 : -1;
  const candidates: { value: number; major: boolean; sign: number; k: number }[] = [];
  if (def.kind !== 'flog') candidates.push({ value: 0, major: true, sign: 0, k: 0 });
  for (let k = kMin; k <= kMax; k++) {
    for (const sign of def.kind === 'flog' ? [1] : [1, -1]) {
      for (let m = 1; m <= 9; m++) candidates.push({ value: sign * m * 10 ** k, major: m === 1, sign, k });
    }
  }
  for (const c of candidates) {
    const pos = forward(c.value);
    if (!inRange(pos)) continue;
    ticks.push({ value: c.value, pos, major: c.major, label: c.major ? formatPow10(c.sign, c.k) : '' });
  }
  ticks.sort((a, b) => a.pos - b.pos);
  // Label crowding suppression: keep 0 and the largest magnitudes first.
  const majors = ticks.filter((t) => t.major).sort((a, b) => priority(b) - priority(a));
  const kept: number[] = [];
  for (const t of majors) {
    if (kept.some((p) => Math.abs(p - t.pos) < minLabelGap)) {
      t.label = '';
    } else kept.push(t.pos);
  }
  return ticks;
}

function priority(t: Tick): number {
  if (t.value === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(t.value);
}
