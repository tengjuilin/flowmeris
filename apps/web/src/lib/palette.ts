import type { Group, Variable } from '@flowmeris/model';
import { CATEGORICAL, colormapCss } from '@flowmeris/render';
import type { Cell } from '@flowmeris/table';

/** Colours: of populations, of sample-variable values, and text readable on them. */

/** Next population colour: categorical palette in fixed order (dataviz rule: never cycled). */
export function nextColor(g: Group): string {
  const used = Object.keys(g.template.populations).length - 1;
  return CATEGORICAL[Math.min(used, CATEGORICAL.length - 1)]!;
}

/** Colour of each value of a variable: palette slots for categories, a viridis ramp (log when wide and positive) for numbers. */
export function valueColors(
  v: Variable,
  values: Cell[],
): {
  color: (x: Cell) => string | undefined;
  legend: { label: string; color: string }[];
  scale?: { min: number; max: number; log: boolean };
} {
  if (v.type === 'categorical') {
    const index = new Map(values.map((x, i) => [String(x), i]));
    const color = (x: Cell) => {
      const i = x === undefined ? undefined : index.get(String(x));
      return i === undefined ? undefined : CATEGORICAL[i % CATEGORICAL.length];
    };
    return { color, legend: values.map((x) => ({ label: String(x), color: color(x)! })) };
  }
  const nums = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (nums.length === 0) return { color: () => undefined, legend: [] };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const log = min > 0 && max / min >= 100;
  const t = (x: number) =>
    max === min ? 0.5 : log ? Math.log(x / min) / Math.log(max / min) : (x - min) / (max - min);
  const color = (x: Cell) =>
    typeof x === 'number' && Number.isFinite(x) ? colormapCss('viridis', 0.15 + 0.8 * t(x)) : undefined;
  return { color, legend: [], scale: { min, max, log } };
}

/** Text colour readable on a background colour (#rrggbb or rgb()). */
export function inkOn(bg: string): string {
  const m = bg.startsWith('#')
    ? [1, 3, 5].map((i) => Number.parseInt(bg.slice(i, i + 2), 16))
    : (bg.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const [r = 0, g = 0, b = 0] = m;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}
