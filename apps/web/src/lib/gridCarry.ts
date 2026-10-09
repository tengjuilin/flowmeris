import type { Group, PlotCell, Workspace } from '@flowmeris/model';
import { PER_PLOT, TILE_FIGURE } from './figure.ts';
import { jsonClone } from './json.ts';

/** One setting changed: its path from the cell and its new value (undefined = removed). */
type Change = { path: string[]; value: unknown };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The settings that differ between `a` and `b`, down to single values (arrays count as one value). */
function diff(a: unknown, b: unknown, path: string[], out: Change[]) {
  if (a === b) return;
  if (isObject(a) && isObject(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], [...path, k], out);
    return;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  out.push({ path, value: jsonClone(b) });
}

/** A grid plot's settings; one without saved figure options shows the grid defaults. */
const styleOf = (c: PlotCell) => (c.style.figure ? c.style : { ...c.style, figure: TILE_FIGURE });

/** Set `value` at `path` under `root`, making missing objects (a missing figure starts at the grid defaults). */
function setAt(root: Record<string, unknown>, path: string[], value: unknown) {
  let o = root;
  for (const k of path.slice(0, -1)) {
    if (!isObject(o[k])) o[k] = k === 'figure' ? structuredClone(TILE_FIGURE) : {};
    o = o[k] as Record<string, unknown>;
  }
  const last = path[path.length - 1]!;
  if (value === undefined) delete o[last];
  else o[last] = jsonClone(value);
}

/** The settings changed on the one grid plot of `before` → `after` that changed, or null if not exactly one did. */
function changesOf(before: Group, after: Group): { cell: PlotCell; changes: Change[] } | null {
  if (before.grid.cells.length !== after.grid.cells.length) return null;
  let found: { cell: PlotCell; changes: Change[] } | null = null;
  for (const [i, c] of after.grid.cells.entries()) {
    const b = before.grid.cells[i];
    if (c === b) continue;
    // Adding, removing or swapping a plot, and a change of type or channels, are the plot's own.
    if (!c || !b || c.id !== b.id || found) return null;
    if (c.kind !== b.kind || c.x.channel !== b.x.channel || c.y?.channel !== b.y?.channel) return null;
    const changes: Change[] = [];
    diff(styleOf(b), styleOf(c), ['style'], changes);
    for (const ax of ['x', 'y'] as const) {
      const ba = b[ax];
      const ca = c[ax];
      if (!ba || !ca) continue;
      diff(
        { transform: ba.transform, range: ba.range },
        { transform: ca.transform, range: ca.range },
        [ax],
        changes,
      );
    }
    found = { cell: c, changes };
  }
  return found;
}

/**
 * While a group carries settings to all grid plots: the change `before` → `after` made to one grid plot's
 * settings, to make to the group's other grid plots too (each keeps its title, ticks and axis titles; an
 * axis's scale and range go to the plots with the same channel on that axis). Null when there is none.
 */
export function gridCarry(before: Workspace, after: Workspace): ((w: Workspace) => void) | null {
  const carries: { groupId: string; cellId: string; changes: Change[] }[] = [];
  for (const g of after.groups) {
    if (!g.gridStyleFollow) continue;
    const old = before.groups.find((x) => x.id === g.id);
    if (!old?.gridStyleFollow || old.grid === g.grid) continue;
    const found = changesOf(old, g);
    const changes = found?.changes.filter(
      (c) => !(c.path[1] === 'figure' && (PER_PLOT as readonly string[]).includes(c.path[2] ?? '')),
    );
    if (found && changes?.length) carries.push({ groupId: g.id, cellId: found.cell.id, changes });
  }
  if (!carries.length) return null;
  return (w) => {
    for (const { groupId, cellId, changes } of carries) {
      const g = w.groups.find((x) => x.id === groupId);
      const src = g?.grid.cells.find((c) => c?.id === cellId);
      if (!g || !src) continue;
      for (const c of g.grid.cells) {
        if (!c || c.id === cellId) continue;
        for (const ch of changes) {
          const ax = ch.path[0];
          if ((ax === 'x' || ax === 'y') && (!c[ax] || c[ax]?.channel !== src[ax]?.channel)) continue;
          setAt(c as unknown as Record<string, unknown>, ch.path, ch.value);
        }
      }
    }
  };
}
