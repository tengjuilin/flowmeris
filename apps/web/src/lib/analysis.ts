import {
  type Gate,
  type Geometry,
  type Group,
  type PlotSpec,
  type Population,
  type Region,
  type Workspace,
  effectiveGeometry,
  newId,
  populationLineage,
  removeGateCascade,
} from '@flowmeris/model';
import { useStore } from '../state/store.ts';
import { nextColor } from './defaults.ts';

/** A dependency key covering everything a plot/statistic of `popId` on `sampleId` depends on. */
export function lineageKey(ws: Workspace, g: Group, sampleId: string | null, popId: string): string {
  const lineage = populationLineage(g.template, popId);
  const gates = lineage
    .filter((p) => p.gate)
    .map((p) => {
      const gate = g.template.gates[p.gate!]!;
      return [gate.dims, sampleId ? effectiveGeometry(g, gate.id, sampleId) : gate.geometry, p.region];
    });
  const transforms = Object.fromEntries(
    lineage.flatMap((p) =>
      p.gate
        ? g.template.gates[p.gate]!.dims.map((d) => [
            d.transform,
            d.transform ? ws.transforms[d.transform] : null,
          ])
        : [],
    ),
  );
  const comp = g.compensation.mode === 'matrix' ? ws.compMatrices[g.compensation.matrixId] : g.compensation;
  return JSON.stringify([gates, transforms, comp]);
}

export function plotKey(ws: Workspace, g: Group, sampleId: string, plot: PlotSpec): string {
  return JSON.stringify([
    lineageKey(ws, g, sampleId, plot.population),
    plot,
    ws.transforms[plot.x.transform],
    plot.y ? ws.transforms[plot.y.transform] : null,
  ]);
}

const QUAD_LABEL: Record<Exclude<Region, 'in'>, [boolean, boolean]> = {
  Q1: [false, true],
  Q2: [true, true],
  Q3: [true, false],
  Q4: [false, false],
};

function shortName(ws: Workspace, g: Group, channel: string): string {
  const s = ws.samples[g.sampleIds[0] ?? ''];
  const ch = s?.channels.find((c) => c.pnn === channel);
  return ch?.pns || channel;
}

/** Create a gate (and its population(s)) in the group template. Returns the first population id. */
export function createGate(groupId: string, gate: Omit<Gate, 'id'>, baseName?: string): string {
  let firstPop = '';
  useStore.getState().mutate('Add gate', (ws) => {
    const g = ws.groups.find((x) => x.id === groupId)!;
    const id = newId('gate_');
    g.template.gates[id] = { ...gate, id };
    const existing = Object.values(g.template.gates).length - 1;
    const mk = (region: Region, name: string): Population => {
      const p: Population = {
        id: newId('pop_'),
        parent: gate.parentPop,
        gate: id,
        region,
        name,
        color: nextColor(g),
      };
      g.template.populations[p.id] = p;
      return p;
    };
    if (gate.geometry.kind === 'quadrant' || gate.geometry.kind === 'spider') {
      const xn = shortName(ws, g, gate.dims[0]!.channel);
      const yn = shortName(ws, g, gate.dims[1]!.channel);
      for (const r of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
        const [xp, yp] = QUAD_LABEL[r];
        const p = mk(r, `${r}: ${xn}${xp ? '+' : '−'} ${yn}${yp ? '+' : '−'}`);
        if (r === 'Q1') firstPop = p.id;
      }
    } else {
      firstPop = mk('in', baseName ?? `Gate ${existing + 1}`).id;
    }
  });
  return firstPop;
}

/** Change a gate's geometry: in the template, or as a per-sample override. */
export function setGateGeometry(
  groupId: string,
  gateId: string,
  geometry: Geometry,
  scope: 'template' | 'sample',
  sampleId: string | null,
) {
  useStore.getState().mutate(scope === 'template' ? 'Edit gate' : 'Override gate for sample', (ws) => {
    const g = ws.groups.find((x) => x.id === groupId)!;
    const gate = g.template.gates[gateId];
    if (!gate) return;
    if (scope === 'template' || !sampleId) {
      gate.geometry = geometry;
    } else {
      const ov = g.overrides.find((o) => o.gateId === gateId && o.sampleId === sampleId);
      if (ov) {
        ov.geometry = geometry;
        ov.at = new Date().toISOString();
      } else g.overrides.push({ gateId, sampleId, geometry, at: new Date().toISOString() });
    }
  });
}

export function revertOverride(groupId: string, gateId: string, sampleId: string) {
  useStore.getState().mutate('Revert override', (ws) => {
    const g = ws.groups.find((x) => x.id === groupId)!;
    g.overrides = g.overrides.filter((o) => !(o.gateId === gateId && o.sampleId === sampleId));
  });
}

export function promoteOverride(groupId: string, gateId: string, sampleId: string) {
  useStore.getState().mutate('Promote override to template', (ws) => {
    const g = ws.groups.find((x) => x.id === groupId)!;
    const ov = g.overrides.find((o) => o.gateId === gateId && o.sampleId === sampleId);
    if (!ov) return;
    g.template.gates[gateId]!.geometry = ov.geometry;
    g.overrides = g.overrides.filter((o) => !(o.gateId === gateId && o.sampleId === sampleId));
  });
}

export function deleteGate(groupId: string, gateId: string) {
  useStore.getState().mutate('Delete gate', (ws) => {
    const g = ws.groups.find((x) => x.id === groupId)!;
    removeGateCascade(g, gateId);
  });
}

export function renamePopulation(groupId: string, popId: string, name: string) {
  useStore.getState().mutate('Rename population', (ws) => {
    const p = ws.groups.find((x) => x.id === groupId)?.template.populations[popId];
    if (p) p.name = name;
  });
}
