import { formatLinear } from '@flowmeris/transforms';

/** A custom tick in data units, as plots, ridges and charts store it; a missing label is formatted from the value. */
export interface TickMark {
  value: number;
  label?: string;
}

/** Custom ticks as the tick editor shows them: one per line, `1000` or `1000 = 1k`. */
export function formatTicks(ticks: TickMark[] | undefined): string {
  return (ticks ?? [])
    .map((t) => (t.label === undefined ? String(t.value) : `${t.value} = ${t.label}`))
    .join('\n');
}

/** One tick per line or comma: `1000` or `1000 = 1k`. Returns null on a malformed entry. */
export function parseTicks(text: string): TickMark[] | null {
  const out: TickMark[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    const value = Number((eq < 0 ? part : part.slice(0, eq)).trim());
    if (!Number.isFinite(value)) return null;
    out.push(eq < 0 ? { value } : { value, label: part.slice(eq + 1).trim() });
  }
  return out;
}

/** Custom ticks placed on the scale (`apply`), keeping those within the axis range [lo, hi]. */
export function customTicks(ticks: TickMark[], apply: (v: number) => number, [lo, hi]: readonly number[]) {
  return ticks
    .map((t) => ({ pos: apply(t.value), label: t.label ?? formatLinear(t.value), major: true }))
    .filter((t) => Number.isFinite(t.pos) && t.pos >= lo! - 1e-9 && t.pos <= hi! + 1e-9);
}

/**
 * Histogram y ticks from 0 to `top`: quarters for `mode` (normalized to 1), else steps of 1, 2 or 5
 * times a power of ten giving about five ticks.
 */
export function histYTicks(top: number, norm: string): number[] {
  if (norm === 'mode') return [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= top);
  const raw = top / 5;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-12; v += step) out.push(v);
  return out;
}

/** A histogram y tick label: percent for `mode`, two significant digits for `area`, else counts (1.2k). */
export function formatHistTick(v: number, norm: string): string {
  if (norm === 'mode') return `${Math.round(v * 100)}`;
  if (norm === 'area') return v.toPrecision(2);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
