import { newId } from './ids.ts';
import {
  type GatingTemplate,
  type Geometry,
  type Group,
  type Population,
  ROOT_POPULATION_ID,
  RidgeCombineSchema,
  SCHEMA_VERSION,
  type Workspace,
  WorkspaceSchema,
} from './schema.ts';

export interface AppInfo {
  version: string;
  commit: string;
  kernels: string;
}

export function emptyTemplate(): GatingTemplate {
  return {
    populations: {
      [ROOT_POPULATION_ID]: {
        id: ROOT_POPULATION_ID,
        parent: null,
        gate: null,
        region: 'in',
        name: 'All events',
        color: '#555555',
      },
    },
    gates: {},
  };
}

export function newWorkspace(name: string, app: AppInfo): Workspace {
  const now = new Date().toISOString();
  return {
    schema: 'flowmeris.workspace',
    schemaVersion: SCHEMA_VERSION,
    app,
    id: newId('ws_'),
    name,
    createdAt: now,
    modifiedAt: now,
    transforms: {},
    compMatrices: {},
    samples: {},
    variables: [],
    groups: [],
  };
}

export function newGroup(name: string, sampleIds: string[], channels: string[]): Group {
  return {
    id: newId('grp_'),
    name,
    sampleIds,
    channels,
    compensation: { mode: 'per-sample-keyword' },
    template: emptyTemplate(),
    overrides: [],
    axisDefaults: {},
    plots: [],
    tilePlots: [],
    refPlots: [],
    grid: { columns: 3, cells: [] },
    layouts: [],
    ridgeCombine: RidgeCombineSchema.parse({}),
    ridgeFollow: true,
    ridgeStyleFollow: true,
    plotStyleFollow: true,
    tilePlotStyleFollow: true,
    stats: [],
    analysis: { derived: [], aggregate: { enabled: false, by: [], funcs: ['mean', 'sd', 'n'] } },
    statPlots: [],
  };
}

/**
 * Geometry of `gateId` as applied to `sampleId`: the sample's override if one
 * exists, otherwise the group template's geometry.
 */
export function effectiveGeometry(group: Group, gateId: string, sampleId: string): Geometry {
  const ov = group.overrides.find((o) => o.gateId === gateId && o.sampleId === sampleId);
  if (ov) return ov.geometry;
  const g = group.template.gates[gateId];
  if (!g) throw new Error(`Unknown gate ${gateId}`);
  return g.geometry;
}

export function isOverridden(group: Group, gateId: string, sampleId: string): boolean {
  return group.overrides.some((o) => o.gateId === gateId && o.sampleId === sampleId);
}

/** Ancestors of a population from root to the population itself (inclusive). */
export function populationLineage(template: GatingTemplate, popId: string): Population[] {
  const out: Population[] = [];
  let cur: Population | undefined = template.populations[popId];
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) throw new Error(`Cycle in population tree at ${cur.id}`);
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent ? template.populations[cur.parent] : undefined;
  }
  return out;
}

/** "All events/Lymphocytes/Singlets" style path (root name omitted after the first segment? no — kept). */
export function populationPath(template: GatingTemplate, popId: string): string {
  return populationLineage(template, popId)
    .map((p) => p.name)
    .join('/');
}

export function childPopulations(template: GatingTemplate, popId: string): Population[] {
  return Object.values(template.populations).filter((p) => p.parent === popId);
}

/** Depth-first ordered population list starting at root. */
export function populationsDepthFirst(template: GatingTemplate): Population[] {
  const out: Population[] = [];
  const visit = (id: string) => {
    const p = template.populations[id];
    if (!p) return;
    out.push(p);
    for (const c of childPopulations(template, id).sort((a, b) => a.name.localeCompare(b.name))) visit(c.id);
  };
  visit(ROOT_POPULATION_ID);
  return out;
}

/** Populations produced by a gate (one for simple gates, four for quadrant/spider). */
export function populationsOfGate(template: GatingTemplate, gateId: string): Population[] {
  return Object.values(template.populations).filter((p) => p.gate === gateId);
}

/** Remove a gate, every population it produces, and all descendants (gates + populations + overrides). */
export function removeGateCascade(group: Group, gateId: string): void {
  const t = group.template;
  const doomedPops = new Set<string>();
  const doomedGates = new Set<string>([gateId]);
  const parentPop = t.gates[gateId]?.parentPop ?? ROOT_POPULATION_ID;
  let frontier = populationsOfGate(t, gateId).map((p) => p.id);
  while (frontier.length) {
    const next: string[] = [];
    for (const pid of frontier) {
      doomedPops.add(pid);
      for (const g of Object.values(t.gates)) {
        if (g.parentPop === pid && !doomedGates.has(g.id)) {
          doomedGates.add(g.id);
          next.push(...populationsOfGate(t, g.id).map((p) => p.id));
        }
      }
    }
    frontier = next;
  }
  for (const pid of doomedPops) delete t.populations[pid];
  for (const gid of doomedGates) delete t.gates[gid];
  group.overrides = group.overrides.filter((o) => !doomedGates.has(o.gateId));
  group.plots = group.plots.filter((p) => !doomedPops.has(p.population));
  group.tilePlots = group.tilePlots.filter((p) => !doomedPops.has(p.population));
  // Reference plots pinned to a removed population fall back to following the gated one.
  for (const r of group.refPlots) if (r.population && doomedPops.has(r.population)) r.population = undefined;
  // Grid cells showing a removed population go back to the removed gate's parent population.
  for (const c of group.grid.cells) if (c && doomedPops.has(c.population)) c.population = parentPop;
  const doomedStats = group.stats.filter((s) => doomedPops.has(s.population)).map((s) => s.id);
  group.stats = group.stats.filter((s) => !doomedPops.has(s.population));
  dropColumns(
    group,
    new Set([...doomedStats, ...[...doomedPops].flatMap((p) => [`${p}|count`, `${p}|pctParent`])]),
  );
  group.layouts = group.layouts.filter((l) => l.kind !== 'ridge' || !doomedPops.has(l.population));
}

/**
 * Remove references to deleted statistics-table columns: normalisations and
 * charts built on them go, export lists forget them. Formulas keep their text
 * (they refer to columns by label) and evaluate to NaN until fixed.
 */
export function dropColumns(group: Group, keys: Set<string>): void {
  if (keys.size === 0) return;
  const a = group.analysis;
  const gone = new Set(keys);
  // A normalisation of a removed column is removed too, and so on down the chain.
  for (const d of a.derived) if (d.kind === 'normalize' && gone.has(d.source)) gone.add(`derived:${d.id}`);
  a.derived = a.derived.filter((d) => !gone.has(`derived:${d.id}`));
  if (a.exportColumns) a.exportColumns = a.exportColumns.filter((k) => !gone.has(k));
  group.statPlots = group.statPlots.filter((p) => !gone.has(p.x) && !gone.has(p.y));
}

/** Delete a sample variable, its values and everything in the groups that uses it. */
export function removeVariable(ws: Workspace, variableId: string): void {
  ws.variables = ws.variables.filter((v) => v.id !== variableId);
  for (const s of Object.values(ws.samples)) delete s.meta[variableId];
  for (const g of ws.groups) {
    const a = g.analysis;
    const doomed = new Set(
      a.derived
        .filter((d) => d.kind === 'normalize' && d.refVariable === variableId)
        .map((d) => `derived:${d.id}`),
    );
    doomed.add(`var:${variableId}`);
    for (const d of a.derived)
      if (d.kind === 'normalize') d.within = d.within.filter((v) => v !== variableId);
    a.aggregate.by = a.aggregate.by.filter((v) => v !== variableId);
    for (const p of g.statPlots)
      if (p.series === variableId) {
        p.series = undefined;
        // Hidden points are keyed by the series value.
        p.hiddenPoints = [];
      }
    dropColumns(g, doomed);
  }
}

export class WorkspaceVersionError extends Error {}

/**
 * Parse and validate a workspace JSON value, applying schema migrations.
 * Refuses documents from a newer schema version than this build understands.
 */
export function loadWorkspace(json: unknown): Workspace {
  if (typeof json !== 'object' || json === null) throw new WorkspaceVersionError('Not a workspace object');
  const doc = json as { schema?: unknown; schemaVersion?: unknown };
  if (doc.schema !== 'flowmeris.workspace') throw new WorkspaceVersionError('Not a Flowmeris workspace file');
  if (typeof doc.schemaVersion !== 'number') throw new WorkspaceVersionError('Missing schemaVersion');
  if (doc.schemaVersion > SCHEMA_VERSION) {
    throw new WorkspaceVersionError(
      `This workspace uses schema v${doc.schemaVersion}; this build of Flowmeris understands up to v${SCHEMA_VERSION}. Please update Flowmeris.`,
    );
  }
  // Migrations v(n) → v(n+1) are chained here as the schema evolves.
  return WorkspaceSchema.parse(unshareRidgeStyle(json));
}

/**
 * Files saved while ridge settings were shared live across populations (group `ridgeStyle` and
 * `ridgeOverlap`): write the shared settings into each population's ridge plot, which keeps its own
 * ticks and axis title.
 */
function unshareRidgeStyle(json: object): object {
  const doc = json as { groups?: unknown };
  if (!Array.isArray(doc.groups)) return json;
  const groups = doc.groups.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('ridgeStyle' in raw || 'ridgeOverlap' in raw)) return raw;
    const { ridgeStyle, ridgeOverlap, ...g } = raw as Record<string, unknown> & {
      ridgeStyle?: Record<string, unknown>;
      ridgeOverlap?: number;
      ridgeStyleFollow?: boolean;
      layouts?: unknown[];
    };
    if (g.ridgeStyleFollow && Array.isArray(g.layouts)) {
      const { ticks: _t, axisTitle: _a, ...shared } = ridgeStyle ?? {};
      g.layouts = g.layouts.map((l) => {
        const lay = l as { kind?: string; style?: Record<string, unknown>; overlap?: number };
        if (lay?.kind !== 'ridge') return l;
        const own = lay.style ?? {};
        const style: Record<string, unknown> = { ...shared };
        for (const k of ['ticks', 'axisTitle']) if (own[k] !== undefined) style[k] = own[k];
        return { ...lay, style, overlap: ridgeOverlap ?? lay.overlap };
      });
    }
    return g;
  });
  return { ...doc, groups };
}
