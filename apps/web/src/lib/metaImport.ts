import type { Variable, Workspace } from '@flowmeris/model';
import { type MatchTarget, type PlateBlock, inferType } from '@flowmeris/table';
import { addVariable, coerce, setValue } from './metadata.ts';

/** Importing sample variables from a table (one row per sample) or from plate-layout blocks. */

/** Where an imported column goes: a new variable (with a name and type) or an existing one. */
export interface Target {
  include: boolean;
  to: 'new' | string;
  name: string;
  type: Variable['type'];
}

/** Columns that identify samples (as in the Metadata view's export), left out unless ticked. */
const SAMPLE_ID_HEADERS = new Set(['file_name', 'filename', 'file', 'sample', 'well']);

/**
 * Where each column goes at first: into the variable of the same name, else a new one of the type its
 * values suggest. Columns that are empty, the key column `skip`, or sample identifiers are left out.
 */
export function initialTargets(
  headers: string[],
  columns: string[][],
  variables: Variable[],
  skip: number,
): Target[] {
  return headers.map((h, i) => {
    const existing = variables.find((v) => v.name.toLowerCase() === h.trim().toLowerCase());
    return {
      include:
        i !== skip &&
        columns[i]!.some((x) => x.trim() !== '') &&
        (!!existing || !SAMPLE_ID_HEADERS.has(h.trim().toLowerCase())),
      to: existing?.id ?? 'new',
      name: h,
      type: existing?.type ?? inferType(columns[i]!),
    };
  });
}

/** The samples an import can match: `ids`, with their file names, display names and wells. */
export function matchTargets(ws: Workspace, ids: string[], names: Record<string, string>): MatchTarget[] {
  return ids.flatMap((id) => {
    const s = ws.samples[id];
    return s
      ? [
          {
            id,
            fileName: s.fileName,
            name: s.label ?? names[id] ?? s.fileName,
            ...(s.well ? { well: s.well } : {}),
          },
        ]
      : [];
  });
}

/** Values set, and values skipped because they do not fit their variable's type. */
export type ImportCount = { set: number; bad: number };

/** The target's variable, added first when it is a new one. */
function resolve(w: Workspace, t: Target): Variable {
  const id = t.to === 'new' ? addVariable(w, t.name, t.type) : t.to;
  return w.variables.find((v) => v.id === id)!;
}

/** Import plate blocks: block i's value in a sample's well goes to target i. Call inside `mutate`. */
export function importPlate(
  w: Workspace,
  blocks: PlateBlock[],
  targets: Target[],
  samples: MatchTarget[],
): ImportCount {
  const n: ImportCount = { set: 0, bad: 0 };
  targets.forEach((t, i) => {
    if (!t.include) return;
    const v = resolve(w, t);
    const values = blocks[i]!.values;
    for (const s of samples) {
      const raw = s.well ? values[s.well] : undefined;
      if (raw === undefined) continue;
      const x = coerce(v, raw);
      if (x === undefined) n.bad++;
      else {
        setValue(w, s.id, v.id, x);
        n.set++;
      }
    }
  });
  return n;
}

/**
 * Import table rows: column c of row i goes to target c on the samples `byRow[i]` (matched by the key
 * column `keyColumn`, which is not imported). Blank values are skipped. Call inside `mutate`.
 */
export function importTable(
  w: Workspace,
  rows: string[][],
  targets: Target[],
  keyColumn: number,
  byRow: string[][],
): ImportCount {
  const n: ImportCount = { set: 0, bad: 0 };
  targets.forEach((t, c) => {
    if (!t.include || c === keyColumn) return;
    const v = resolve(w, t);
    rows.forEach((r, i) => {
      const x = coerce(v, r[c] ?? '');
      if (x === undefined) {
        n.bad++;
        return;
      }
      if (x === null) return;
      for (const id of byRow[i]!) {
        setValue(w, id, v.id, x);
        n.set++;
      }
    });
  });
  return n;
}
