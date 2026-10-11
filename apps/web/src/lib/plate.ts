import type { Workspace } from '@flowmeris/model';
import { wellIndex, wellName } from '@flowmeris/table';

/** The Metadata view's plate map: wells, their samples, and values set or filled across selected wells. */

/** A value as a well shows it: 4 significant digits, exponent form when very small or large. */
export function fmtWellValue(x: unknown): string {
  if (typeof x !== 'number') return x === undefined ? '' : String(x);
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(2) : String(Number(x.toPrecision(4)));
}

/** Wells of the rectangle spanned by two wells. */
export function wellRect(a: string, b: string): string[] {
  const [r0, c0] = wellIndex(a);
  const [r1, c1] = wellIndex(b);
  const out: string[] = [];
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) out.push(wellName(r, c));
  return out;
}

/** Samples of each well, among the given samples. */
export function samplesByWell(ws: Workspace, sampleIds: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const id of sampleIds) {
    const w = ws.samples[id]?.well;
    if (!w) continue;
    const list = m.get(w);
    if (list) list.push(id);
    else m.set(w, [id]);
  }
  return m;
}

/** A numeric series filled across wells: `start`, then × or + `step` for each further column or row. */
export interface Series {
  start: number;
  step: number;
  op: 'mul' | 'add';
  along: 'cols' | 'rows';
}

/** The selected columns (or rows), left to right (or top to bottom): each gets the next value of a series. */
export function seriesSteps(wells: string[], along: Series['along']): number[] {
  const axis = along === 'cols' ? 1 : 0;
  return [...new Set(wells.map((w) => wellIndex(w)[axis]))].sort((a, b) => a - b);
}

/** Value `i` of a series, rounded to 12 significant digits. */
export function seriesValue(s: Series, i: number): number {
  return Number((s.op === 'mul' ? s.start * s.step ** i : s.start + s.step * i).toPrecision(12));
}

/** Set the series' values of `variableId` on the samples in `wells`. Call inside `mutate`. */
export function fillSeries(
  w: Workspace,
  variableId: string,
  wells: string[],
  byWell: Map<string, string[]>,
  s: Series,
) {
  const steps = seriesSteps(wells, s.along);
  const axis = s.along === 'cols' ? 1 : 0;
  for (const well of wells) {
    const i = steps.indexOf(wellIndex(well)[axis]);
    for (const id of byWell.get(well) ?? []) {
      const sample = w.samples[id];
      if (sample) sample.meta[variableId] = seriesValue(s, i);
    }
  }
}

/** CSS gradient of a numeric color scale, from `min` to `max` (geometric steps on a log scale). */
export function rampGradient(
  scale: { min: number; max: number; log: boolean },
  color: (x: number) => string | undefined,
): string {
  const at = (t: number) =>
    scale.log ? scale.min * (scale.max / scale.min) ** t : scale.min + t * (scale.max - scale.min);
  return `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => color(at(t))).join(',')})`;
}
