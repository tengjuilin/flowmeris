import { type Variable, type Workspace, newId } from '@flowmeris/model';
import { type Cell, compareCells, parseNumber, wellFromSample } from '@flowmeris/table';

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

/** A block of table cells, rows r0…r1 and columns c0…c1 (inclusive, any corner order). */
export interface CellRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export function normRect(s: CellRect): CellRect {
  return {
    r0: Math.min(s.r0, s.r1),
    c0: Math.min(s.c0, s.c1),
    r1: Math.max(s.r0, s.r1),
    c1: Math.max(s.c0, s.c1),
  };
}

/**
 * Where pasted cells go, as spreadsheets do it: a single value fills the whole
 * selection; a block that fits the selection a whole number of times is
 * repeated across it; otherwise the block is placed at the selection's top-left
 * corner. Cells beyond the table (`nrow` × `ncol`) are dropped.
 */
export function pasteTargets(
  grid: string[][],
  sel: CellRect,
  nrow: number,
  ncol: number,
): { r: number; c: number; raw: string }[] {
  const s = normRect(sel);
  const h = grid.length;
  const w = Math.max(0, ...grid.map((row) => row.length));
  if (h === 0 || w === 0) return [];
  const sh = s.r1 - s.r0 + 1;
  const sw = s.c1 - s.c0 + 1;
  const tile = sh % h === 0 && sw % w === 0;
  const rows = tile ? sh : h;
  const cols = tile ? sw : w;
  const out: { r: number; c: number; raw: string }[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const r = s.r0 + i;
      const c = s.c0 + j;
      const raw = grid[i % h]?.[j % w];
      if (r < nrow && c < ncol && raw !== undefined) out.push({ r, c, raw });
    }
  return out;
}

/** Variable of the Metadata view: the selected one, else the first ('' = all cards closed, still the first). */
export function activeVariable(vars: Variable[], id: string | null): Variable | undefined {
  return vars.find((v) => v.id === id) ?? vars[0];
}

/**
 * Set the well of each sample without one from its $WELLID keyword or file name; returns how many were
 * found. Call inside `mutate`.
 */
export function detectWells(ws: Workspace, sampleIds: string[]): number {
  let n = 0;
  for (const id of sampleIds) {
    const s = ws.samples[id];
    if (!s || s.well) continue;
    const well = wellFromSample(s);
    if (well) {
      s.well = well;
      n++;
    }
  }
  return n;
}
