import { exportGatingML } from '@flowmeris/export';
import type { Group, Workspace } from '@flowmeris/model';
import type { Cell, ColumnDef, Row, Table } from '@flowmeris/table';
import { safeName } from './download.ts';
import { stripDataExt } from './files.ts';

/** File names and contents of the Statistics view's exports. */

/** The statistics CSV of `group`: `kind` is 'samples' or 'grouped' (table), or 'tidy' or 'wide'. */
export const statsCsvName = (groupName: string, kind: string) =>
  `${safeName(`${groupName}_statistics_${kind}`)}.csv`;

/** Gating-ML of the group template, then the effective gates of every sample with overrides. */
export function gatingMlFiles(ws: Workspace, group: Group, appVersion: string) {
  const files = [
    {
      name: `${safeName(group.name)}_template.gating-ml.xml`,
      xml: exportGatingML(ws, group, { appVersion }),
    },
  ];
  for (const sid of new Set(group.overrides.map((o) => o.sampleId)))
    files.push({
      name: `${safeName(`${group.name}_${ws.samples[sid]?.fileName ?? sid}`)}_effective.gating-ml.xml`,
      xml: exportGatingML(ws, group, { appVersion, sampleId: sid }),
    });
  return files;
}

/** The events export of one population of a sample. */
export const eventsFileName = (fileName: string, popName: string | undefined, format: 'fcs' | 'csv') =>
  `${safeName(`${stripDataExt(fileName)}_${popName ?? 'population'}`)}.${format}`;

/** The distinct values of variable `variableId` in `rows`, numbers ascending, then text in natural order. */
export function distinctValues(rows: Row[], variableId: string): Cell[] {
  const seen = new Map<string, Cell>();
  for (const r of rows) {
    const v = r.values[`var:${variableId}`];
    if (v !== undefined && v !== '') seen.set(JSON.stringify(v), v);
  }
  return [...seen.values()].sort((a, b) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
}

/** The "CSV (table)" column checklist: runs of columns by section (sample, variables, a population…). */
export function exportColumnSections(table: Table, group: Group): { title: string; cols: ColumnDef[] }[] {
  const sections: { title: string; cols: ColumnDef[] }[] = [];
  for (const c of table.columns) {
    const title =
      c.kind === 'sample'
        ? 'Sample'
        : c.kind === 'variable'
          ? 'Variables'
          : c.kind === 'derived'
            ? 'Derived'
            : (group.template.populations[c.pop ?? '']?.name ?? 'Statistics');
    const last = sections[sections.length - 1];
    if (last?.title === title) last.cols.push(c);
    else sections.push({ title, cols: [c] });
  }
  return sections;
}

/** The export columns after turning `keys` on or off; undefined when that is every column. */
export function toggleExportColumns(
  table: Table,
  selected: string[] | undefined,
  keys: string[],
  value: boolean,
): string[] | undefined {
  const next = new Set(selected ?? table.columns.map((c) => c.key));
  for (const k of keys) value ? next.add(k) : next.delete(k);
  const list = table.columns.map((c) => c.key).filter((k) => next.has(k));
  return list.length === table.columns.length ? undefined : list;
}
