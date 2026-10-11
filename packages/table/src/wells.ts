/** 96-well plate geometry and well-name parsing. */

export const PLATE_ROWS = 'ABCDEFGH';
export const PLATE_COLS = 12;

export function wellName(row: number, col: number): string {
  return `${PLATE_ROWS[row]}${String(col + 1).padStart(2, '0')}`;
}

/** [row, col] (0-based) of a normalized well name. */
export function wellIndex(well: string): [number, number] {
  return [PLATE_ROWS.indexOf(well[0]!), Number(well.slice(1)) - 1];
}

/** All 96 wells, row by row. */
export const ALL_WELLS: string[] = Array.from({ length: PLATE_ROWS.length * PLATE_COLS }, (_, i) =>
  wellName(Math.floor(i / PLATE_COLS), i % PLATE_COLS),
);

/** "b7", "B07", " B 7 " → "B07"; undefined if not a 96-well plate well. */
export function normalizeWell(s: string): string | undefined {
  const m = /^\s*([A-Ha-h])\s*0*([1-9]\d?)\s*$/.exec(s);
  if (!m) return undefined;
  const col = Number(m[2]);
  return col <= PLATE_COLS ? `${m[1]!.toUpperCase()}${String(col).padStart(2, '0')}` : undefined;
}

const WELL_KEYWORDS = ['$WELLID', 'WELL ID', 'WELLID', 'WELL', '$WELL'];
const WELL_IN_NAME = /(?<![A-Za-z0-9])([A-Ha-h])(0?[1-9]|1[0-2])(?![0-9])/g;

/**
 * Well of a sample: the well keyword written by the cytometer if present,
 * otherwise a single well-like token (e.g. "B07" in "Specimen_001_B07_019.fcs")
 * in the file name. Ambiguous names (several well-like tokens) give undefined.
 */
export function wellFromSample(s: { keywords: Record<string, string>; fileName: string }):
  | string
  | undefined {
  const upper = new Map(Object.entries(s.keywords).map(([k, v]) => [k.toUpperCase(), v]));
  for (const k of WELL_KEYWORDS) {
    const v = upper.get(k);
    const w = v !== undefined ? normalizeWell(v) : undefined;
    if (w) return w;
  }
  const stem = s.fileName.replace(/\.[^.]+$/, '');
  const found = new Set([...stem.matchAll(WELL_IN_NAME)].map((m) => normalizeWell(`${m[1]}${m[2]}`)));
  return found.size === 1 ? [...found][0] : undefined;
}
