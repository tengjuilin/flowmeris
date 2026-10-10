import type { Variable, Workspace } from '@flowmeris/model';
import { PLATE_COLS, PLATE_ROWS, normalizeWell } from '@flowmeris/table';
import { type CellRect, coerce, setValue } from './metadata.ts';

/**
 * The Metadata view's table: one row per sample; columns Well, Row and Column (linked: editing one updates
 * the others), then one per variable.
 */

/** Leading columns before the variables: the well, then its row and column (both edit the well). */
export const WELL_COLS = ['Well', 'Row', 'Column'] as const;
export const NW = WELL_COLS.length;

/** A row or column typed while the other half is still missing, so there is no well to store yet. */
export type PartialWell = { row?: string; col?: number };

export function wellParts(well: string | undefined, partial: PartialWell | undefined): PartialWell {
  return well ? { row: well[0], col: Number(well.slice(1)) } : (partial ?? {});
}

/**
 * Write one cell's text into sample `sampleId` of the draft workspace; false if it does not fit the
 * column. A row or column without the other half is kept in `partial`. Call inside `mutate`.
 */
export function writeMetaCell(
  x: Workspace,
  sampleId: string,
  vars: Variable[],
  col: number,
  raw: string,
  partial: Map<string, PartialWell>,
): boolean {
  const s = x.samples[sampleId];
  if (!s) return true;
  const t = raw.trim();
  if (col === 0) {
    const w = t === '' ? undefined : normalizeWell(raw);
    if (t && !w) return false;
    s.well = w;
    partial.delete(s.id);
    return true;
  }
  if (col < NW) return writeWellPart(s, col, t, partial);
  const v = vars[col - NW]!;
  const value = coerce(v, raw);
  if (value === undefined) return false;
  setValue(x, s.id, v.id, value);
  return true;
}

/** Write a well's row (col 1) or column (col 2), completing the well when the other half is known. */
function writeWellPart(
  s: { id: string; well?: string | undefined },
  col: number,
  t: string,
  partial: Map<string, PartialWell>,
): boolean {
  const p = { ...wellParts(s.well, partial.get(s.id)) };
  if (col === 1) {
    if (t && !(t.length === 1 && PLATE_ROWS.includes(t.toUpperCase()))) return false;
    p.row = t ? t.toUpperCase() : undefined;
  } else {
    const n = Number(t);
    if (t && !(Number.isInteger(n) && n >= 1 && n <= PLATE_COLS)) return false;
    p.col = t ? n : undefined;
  }
  if (p.row && p.col) {
    s.well = `${p.row}${String(p.col).padStart(2, '0')}`;
    partial.delete(s.id);
  } else {
    s.well = undefined;
    if (p.row || p.col) partial.set(s.id, p);
    else partial.delete(s.id);
  }
  return true;
}

/** What cell `col` of sample `sampleId` shows. */
export function metaCellValue(
  ws: Workspace,
  sampleId: string,
  vars: Variable[],
  col: number,
  partial: Map<string, PartialWell>,
): number | string | undefined {
  const s = ws.samples[sampleId];
  if (!s) return undefined;
  if (col === 0) return s.well;
  if (col < NW) {
    const p = wellParts(s.well, partial.get(s.id));
    return col === 1 ? p.row : p.col;
  }
  return s.meta[vars[col - NW]!.id];
}

/** Why `raw` was not written to column `col` (see `writeMetaCell`). */
export function rejectMessage(col: number, raw: string, vars: Variable[]): string {
  if (col === 0) return `“${raw}” is not a well of a 96-well plate (A01–H12).`;
  if (col === 1) return `“${raw}” is not a plate row (A–H).`;
  if (col === 2) return `“${raw}” is not a plate column (1–12).`;
  return `“${raw}” is not a number (${vars[col - NW]!.name} is numeric).`;
}

/** A block of cells as tab-separated lines, for the clipboard. */
export function blockText(rect: CellRect, text: (r: number, c: number) => string): string {
  const lines: string[] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    const cells: string[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) cells.push(text(r, c));
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/** The categories offered while typing in a cell: those containing `query` (all of them for null or blank). */
export function filterLevels(levels: string[], query: string | null): string[] {
  const q = query?.trim().toLowerCase();
  return q ? levels.filter((l) => l.toLowerCase().includes(q)) : levels;
}
