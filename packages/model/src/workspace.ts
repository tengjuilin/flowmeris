import { newId } from './ids.ts';
import {
  type GatingTemplate,
  type Geometry,
  type Group,
  type Population,
  ROOT_POPULATION_ID,
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
    refPlots: [],
    layouts: [],
    stats: [],
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
  // Reference plots pinned to a removed population fall back to following the gated one.
  for (const r of group.refPlots) if (r.population && doomedPops.has(r.population)) r.population = undefined;
  group.stats = group.stats.filter((s) => !doomedPops.has(s.population));
  group.layouts = group.layouts.filter((l) => l.kind !== 'ridge' || !doomedPops.has(l.population));
}

export class WorkspaceVersionError extends Error {}

/**
 * Parse and validate a workspace JSON value, applying schema migrations.
 * Refuses documents from a newer schema version than this build understands.
 */
export function loadWorkspace(json: unknown): Workspace {
  if (typeof json !== 'object' || json === null) throw new WorkspaceVersionError('Not a workspace object');
  const doc = json as { schema?: unknown; schemaVersion?: unknown };
  if (doc.schema !== 'flowmeris.workspace') throw new WorkspaceVersionError('Not a flowmeris workspace file');
  if (typeof doc.schemaVersion !== 'number') throw new WorkspaceVersionError('Missing schemaVersion');
  if (doc.schemaVersion > SCHEMA_VERSION) {
    throw new WorkspaceVersionError(
      `This workspace uses schema v${doc.schemaVersion}; this build of flowmeris understands up to v${SCHEMA_VERSION}. Please update flowmeris.`,
    );
  }
  // Migrations v(n) → v(n+1) are chained here as the schema evolves.
  return WorkspaceSchema.parse(json);
}
