import type { Workspace } from '@flowmeris/model';
import { type Cell, compareCells } from '@flowmeris/table';

/** The ridges of a ridge plot: one per sample, or one per combination of replicate variables. */

/** One ridge: a single sample, or replicates combined. `id` keys the ridge's order, colour and label. */
export interface RidgeRow {
  id: string;
  /** Default label (short sample name or the combined values). */
  label: string;
  sampleIds: string[];
}

/** `ids` in display order: those listed in `order` first, the rest in their given order. */
export function applyOrder(ids: string[], order: string[]): string[] {
  const all = new Set(ids);
  const head = order.filter((id) => all.has(id));
  const seen = new Set(head);
  return [...head, ...ids.filter((id) => !seen.has(id))];
}

/**
 * Replicates combined: one ridge per distinct combination of the `by` variables' values among
 * `sampleIds`, sorted by those values (categorical values in their level order). A sample without a
 * value forms its own combination with the others lacking it.
 */
export function comboRows(ws: Workspace, sampleIds: string[], by: string[]): RidgeRow[] {
  const vars = by.flatMap((id) => ws.variables.filter((v) => v.id === id));
  const groups = new Map<string, { values: Cell[]; ids: string[] }>();
  for (const sid of sampleIds) {
    const meta = ws.samples[sid]?.meta ?? {};
    const values = vars.map((v) => meta[v.id]);
    const id = `combo:${JSON.stringify(Object.fromEntries(vars.map((v, i) => [v.id, values[i] ?? null])))}`;
    const g = groups.get(id);
    if (g) g.ids.push(sid);
    else groups.set(id, { values, ids: [sid] });
  }
  const cmp = (a: Cell[], b: Cell[]) => {
    for (let i = 0; i < vars.length; i++) {
      const c = compareCells(a[i], b[i], vars[i]!.levels);
      if (c) return c;
    }
    return 0;
  };
  return [...groups.entries()]
    .sort(([, a], [, b]) => cmp(a.values, b.values))
    .map(([id, g]) => ({
      id,
      label: vars.length
        ? vars
            .map((v, i) => {
              const x = g.values[i];
              return x === undefined || x === '' ? `no ${v.name}` : `${x}${v.unit ? ` ${v.unit}` : ''}`;
            })
            .join(' · ')
        : 'All samples',
      sampleIds: g.ids,
    }));
}

/**
 * The combined ridges to draw: `hidden` ridges dropped, `exclude`d replicates removed from the others, and
 * ridges left without replicates dropped.
 */
export function selectRidges(rows: RidgeRow[], hidden: string[], exclude: string[]): RidgeRow[] {
  const off = new Set(hidden);
  const out = new Set(exclude);
  return rows.flatMap((r) => {
    if (off.has(r.id)) return [];
    const sampleIds = r.sampleIds.filter((id) => !out.has(id));
    return sampleIds.length ? [{ ...r, sampleIds }] : [];
  });
}
