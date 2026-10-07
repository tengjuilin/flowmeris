import { PLATE_COLS, PLATE_ROWS, normalizeWell, wellName } from './wells.ts';

/**
 * Import of sample variables from tables (CSV/TSV text, or cell grids read from
 * spreadsheets) — one row per sample, or plate-layout blocks.
 */

export type Grid = string[][];

/** RFC 4180 parsing of CSV/TSV text; the delimiter (tab, comma or semicolon) is detected from the first line. */
export function parseDelimited(text: string): Grid {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (['\t', ',', ';'] as const)
    .map((d) => [d, first.split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  const rows: Grid = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const isBlank = (r: string[]) => r.every((c) => c.trim() === '');

export interface Records {
  headers: string[];
  rows: string[][];
}

/** First non-blank row as headers, the rest (blank rows dropped) as records. */
export function gridToRecords(grid: Grid): Records {
  const rows = grid.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => !isBlank(r));
  const header = rows[0] ?? [];
  const width = Math.max(header.length, ...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => header[i] || `Column ${i + 1}`);
  return { headers, rows: rows.slice(1).map((r) => headers.map((_, i) => r[i] ?? '')) };
}

/** A number written as text ("1.5", "-2e-3", "1,000" is not one). */
export function parseNumber(s: string): number | undefined {
  const t = s.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return undefined;
  return Number(t);
}

/** Numeric when every non-empty value is a number (and there is at least one). */
export function inferType(values: string[]): 'numeric' | 'categorical' {
  const filled = values.filter((v) => v.trim() !== '');
  return filled.length > 0 && filled.every((v) => parseNumber(v) !== undefined) ? 'numeric' : 'categorical';
}

export interface PlateBlock {
  /** Block title (the corner cell, or the cell above it); "Plate N" when none. */
  name: string;
  values: Record<string, string>;
}

/**
 * Plate-layout blocks: a header row 1…12 with row labels A…H below, one block
 * per variable — the layout plate readers and plate-map templates use. The
 * variable name is the corner cell left of "1", or the cell above it.
 */
export function detectPlateGrid(grid: Grid): PlateBlock[] {
  const cell = (r: number, c: number) => String(grid[r]?.[c] ?? '').trim();
  const blocks: PlateBlock[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 1; c + PLATE_COLS - 1 < row.length + 1; c++) {
      let header = true;
      for (let k = 0; k < PLATE_COLS && header; k++) header = Number(cell(r, c + k)) === k + 1;
      if (!header) continue;
      let labels = true;
      for (let k = 0; k < PLATE_ROWS.length && labels; k++)
        labels = cell(r + 1 + k, c - 1).toUpperCase() === PLATE_ROWS[k];
      if (!labels) continue;
      const values: Record<string, string> = {};
      for (let i = 0; i < PLATE_ROWS.length; i++)
        for (let j = 0; j < PLATE_COLS; j++) {
          const v = cell(r + 1 + i, c + j);
          if (v !== '') values[wellName(i, j)] = v;
        }
      const name = cell(r, c - 1) || cell(r - 1, c - 1) || cell(r - 1, c) || `Plate ${blocks.length + 1}`;
      blocks.push({ name, values });
    }
  }
  return blocks;
}

export type MatchMode = 'fileName' | 'stem' | 'name' | 'well';

export const MATCH_MODES: { id: MatchMode; label: string }[] = [
  { id: 'fileName', label: 'File name' },
  { id: 'stem', label: 'File name without extension' },
  { id: 'name', label: 'Sample display name' },
  { id: 'well', label: 'Well' },
];

export interface MatchTarget {
  id: string;
  fileName: string;
  /** Short display name (or user label). */
  name: string;
  well?: string;
}

function keyOf(mode: MatchMode, s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  if (mode === 'well') return normalizeWell(t);
  if (mode === 'stem') return t.replace(/\.(fcs|lmd)$/i, '').toLowerCase();
  return t.toLowerCase();
}

function targetKey(mode: MatchMode, s: MatchTarget): string | undefined {
  if (mode === 'well') return s.well;
  if (mode === 'name') return keyOf('name', s.name);
  return keyOf(mode, s.fileName);
}

/**
 * Sample ids matched by each record (by the value in `column`). Matching is
 * case-insensitive; one record may match several samples (e.g. a well across
 * plates), and a sample is claimed by the first record that matches it.
 */
export function matchSamples(
  rows: string[][],
  column: number,
  mode: MatchMode,
  targets: MatchTarget[],
): { byRow: string[][]; matched: number; unmatchedRows: number[] } {
  const index = new Map<string, string[]>();
  for (const t of targets) {
    const k = targetKey(mode, t);
    if (k === undefined) continue;
    const list = index.get(k);
    if (list) list.push(t.id);
    else index.set(k, [t.id]);
  }
  const claimed = new Set<string>();
  const byRow: string[][] = [];
  const unmatchedRows: number[] = [];
  rows.forEach((r, i) => {
    const k = keyOf(mode, r[column] ?? '');
    const ids = (k !== undefined ? (index.get(k) ?? []) : []).filter((id) => !claimed.has(id));
    for (const id of ids) claimed.add(id);
    byRow.push(ids);
    if (ids.length === 0) unmatchedRows.push(i);
  });
  return { byRow, matched: claimed.size, unmatchedRows };
}

/** Column and mode matching the most samples (ties: first column, then mode order). */
export function suggestKey(
  rows: string[][],
  width: number,
  targets: MatchTarget[],
): { column: number; mode: MatchMode; matched: number } {
  let best = { column: 0, mode: 'fileName' as MatchMode, matched: -1 };
  for (let c = 0; c < width; c++)
    for (const { id } of MATCH_MODES) {
      const { matched } = matchSamples(rows, c, id, targets);
      if (matched > best.matched) best = { column: c, mode: id, matched };
    }
  return best;
}
