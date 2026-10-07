import { type Variable, type Workspace, newId } from '@flowmeris/model';
import { CATEGORICAL, colormapCss } from '@flowmeris/render';
import { type Cell, compareCells, parseNumber } from '@flowmeris/table';

/** A typed value from text: a number for numeric variables (undefined if not one), trimmed text otherwise; '' clears. */
export function coerce(v: Variable, raw: string): number | string | undefined | null {
  const t = raw.trim();
  if (t === '') return null;
  return v.type === 'numeric' ? parseNumber(t) : t;
}

/** Set (or with null, clear) one sample's value of a variable. Call inside `mutate`. */
export function setValue(ws: Workspace, sampleId: string, variableId: string, value: number | string | null) {
  const s = ws.samples[sampleId];
  if (!s) return;
  if (value === null) delete s.meta[variableId];
  else s.meta[variableId] = value;
}

/** Add a variable named `name` (made unique) and return its id. Call inside `mutate`. */
export function addVariable(ws: Workspace, name: string, type: Variable['type'], unit?: string): string {
  const taken = new Set(ws.variables.map((v) => v.name));
  let n = name.trim() || 'Variable';
  for (let k = 2; taken.has(n); k++) n = `${name.trim() || 'Variable'} ${k}`;
  const id = newId('var_');
  ws.variables.push({ id, name: n, type, levels: [], ...(unit ? { unit } : {}) });
  return id;
}

/**
 * Change a variable's type, converting its values: numbers become text; text
 * that is not a number is dropped. Returns how many values were dropped.
 */
export function retype(ws: Workspace, variableId: string, type: Variable['type']): number {
  const v = ws.variables.find((x) => x.id === variableId);
  if (!v || v.type === type) return 0;
  v.type = type;
  let dropped = 0;
  for (const s of Object.values(ws.samples)) {
    const x = s.meta[variableId];
    if (x === undefined) continue;
    if (type === 'categorical') s.meta[variableId] = String(x);
    else {
      const n = typeof x === 'number' ? x : parseNumber(x);
      if (n === undefined) {
        delete s.meta[variableId];
        dropped++;
      } else s.meta[variableId] = n;
    }
  }
  if (type === 'numeric') v.levels = [];
  return dropped;
}

/** Distinct values of a variable among the given samples, in display order. */
export function distinctValues(ws: Workspace, v: Variable, sampleIds: string[]): Cell[] {
  const seen = new Map<string, Cell>();
  for (const id of sampleIds) {
    const x = ws.samples[id]?.meta[v.id];
    if (x !== undefined && x !== '') seen.set(JSON.stringify(x), x);
  }
  return [...seen.values()].sort((a, b) => compareCells(a, b, v.levels));
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
