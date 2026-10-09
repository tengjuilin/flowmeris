import {
  type Group,
  type StatSpec,
  type Workspace,
  isOverridden,
  populationLineage,
  populationPath,
  populationsDepthFirst,
} from '@flowmeris/model';

/**
 * Statistics export (method M-EXPORT-STATS). One row per
 * (sample, population, statistic, channel), with the provenance needed to
 * reproduce the number: file hash, population path, whether any gate on the
 * population's path was overridden for that sample, compensation source and
 * the transforms involved.
 */

export interface StatCell {
  sampleId: string;
  population: string;
  statistic: string;
  channel?: string;
  space: 'linear' | 'transformed' | 'n/a';
  transform?: string;
  p?: number;
  value: number;
  n: number;
  nExcluded: number;
}

export const TIDY_COLUMNS = [
  'workspace',
  'group',
  'sample_file',
  'sample_path',
  'sample_sha256',
  'dataset',
  'population_path',
  'population_id',
  'statistic',
  'percentile',
  'channel',
  'marker',
  'space',
  'transform',
  'value',
  'n_events',
  'n_excluded',
  'gate_overridden_on_path',
  'overridden_gate_ids',
  'compensation',
  'app_version',
] as const;

/** RFC 4180 field quoting. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s =
    typeof v === 'number'
      ? Number.isFinite(v)
        ? String(v)
        : Number.isNaN(v)
          ? 'NaN'
          : v > 0
            ? 'Inf'
            : '-Inf'
      : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return `${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

function compensationLabel(ws: Workspace, g: Group): string {
  const c = g.compensation;
  if (c.mode === 'none') return 'none';
  if (c.mode === 'per-sample-keyword') return 'FCS $SPILLOVER (per sample)';
  return `matrix:${ws.compMatrices[c.matrixId]?.name ?? c.matrixId}`;
}

/**
 * Headers of the sample-variable columns: the variable names (with unit),
 * suffixed " (2)", " (3)"… where they would collide with another column.
 */
function variableHeaders(ws: Workspace, fixed: readonly string[]): string[] {
  const taken = new Set<string>(fixed);
  return ws.variables.map((v) => {
    const base = v.unit ? `${v.name} (${v.unit})` : v.name;
    let h = base;
    for (let k = 2; taken.has(h); k++) h = `${base} (${k})`;
    taken.add(h);
    return h;
  });
}

const variableValues = (ws: Workspace, sampleId: string): unknown[] =>
  ws.variables.map((v) => ws.samples[sampleId]?.meta[v.id] ?? '');

/** Tidy rows; the workspace's sample variables follow the sample identity columns (after `dataset`). */
export function tidyRows(ws: Workspace, g: Group, cells: StatCell[], appVersion: string): unknown[][] {
  const at = TIDY_COLUMNS.indexOf('dataset') + 1;
  const vars = variableHeaders(ws, TIDY_COLUMNS);
  const rows: unknown[][] = [[...TIDY_COLUMNS.slice(0, at), ...vars, ...TIDY_COLUMNS.slice(at)]];
  for (const c of cells) {
    const s = ws.samples[c.sampleId];
    if (!s) continue;
    const lineage = populationLineage(g.template, c.population);
    const overridden = lineage
      .filter((p) => p.gate && isOverridden(g, p.gate, c.sampleId))
      .map((p) => p.gate as string);
    const marker = c.channel ? (s.channels.find((ch) => ch.pnn === c.channel)?.pns ?? '') : '';
    const t = c.transform ? ws.transforms[c.transform] : undefined;
    rows.push([
      ws.name,
      g.name,
      s.fileName,
      s.relativePath,
      s.sha256,
      s.datasetIndex,
      ...variableValues(ws, c.sampleId),
      populationPath(g.template, c.population),
      c.population,
      c.statistic,
      c.p ?? '',
      c.channel ?? '',
      marker,
      c.space,
      t ? JSON.stringify(t) : '',
      c.value,
      c.n,
      c.nExcluded,
      overridden.length > 0,
      overridden.join(';'),
      compensationLabel(ws, g),
      appVersion,
    ]);
  }
  return rows;
}

export function statLabel(spec: Pick<StatSpec, 'stat' | 'p' | 'channel' | 'space'>, marker?: string): string {
  const name =
    spec.stat === 'percentile'
      ? `P${spec.p}`
      : ((
          {
            count: 'Count',
            pctParent: '% Parent',
            pctGrandparent: '% Grandparent',
            pctTotal: '% Total',
            mean: 'Mean',
            median: 'Median',
            geomMean: 'Geo. mean',
            sd: 'SD',
            cv: 'CV',
            rsd: 'rSD',
            rcv: 'rCV',
            min: 'Min',
            max: 'Max',
          } as Record<string, string>
        )[spec.stat] ?? spec.stat);
  const ch = spec.channel ? ` ${marker ? `${marker} (${spec.channel})` : spec.channel}` : '';
  return `${name}${ch}${spec.space === 'transformed' ? ' [transformed]' : ''}`;
}

/** Wide table: one row per sample (file, hash, sample variables), one column per (population, statistic). */
export function wideRows(ws: Workspace, g: Group, cells: StatCell[]): unknown[][] {
  const colKey = (c: StatCell) =>
    JSON.stringify([c.population, c.statistic, c.channel ?? '', c.space, c.p ?? '']);
  const cols = new Map<string, StatCell>();
  const pops = populationsDepthFirst(g.template).map((p) => p.id);
  for (const c of cells) if (!cols.has(colKey(c))) cols.set(colKey(c), c);
  const ordered = [...cols.entries()].sort(
    (a, b) => pops.indexOf(a[1].population) - pops.indexOf(b[1].population),
  );
  const header = [
    'sample_file',
    'sample_sha256',
    ...variableHeaders(ws, ['sample_file', 'sample_sha256']),
    ...ordered.map(([, c]) => {
      const marker = c.channel
        ? ws.samples[c.sampleId]?.channels.find((ch) => ch.pnn === c.channel)?.pns
        : undefined;
      return `${populationPath(g.template, c.population)} | ${statLabel({ stat: c.statistic as StatSpec['stat'], ...(c.p !== undefined ? { p: c.p } : {}), ...(c.channel ? { channel: c.channel } : {}), space: c.space === 'transformed' ? 'transformed' : 'linear' }, marker)}`;
    }),
  ];
  const rows: unknown[][] = [header];
  for (const sid of g.sampleIds) {
    const s = ws.samples[sid];
    if (!s) continue;
    const mine = new Map(cells.filter((c) => c.sampleId === sid).map((c) => [colKey(c), c.value]));
    rows.push([s.fileName, s.sha256, ...variableValues(ws, sid), ...ordered.map(([k]) => mine.get(k) ?? '')]);
  }
  return rows;
}

export * from './events.ts';
export * from './gatingml.ts';
