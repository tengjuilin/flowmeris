import type { Gate, Geometry } from '@flowmeris/model';
import { removeGateCascade } from '@flowmeris/model';
import { addGate } from '../../lib/gates.ts';
import { useStore } from '../store.ts';

/** Create a gate (and its population(s)) in the group template. Returns the first population id. */
export function createGate(groupId: string, gate: Omit<Gate, 'id'>, baseName?: string): string {
  let firstPop = '';
  useStore.getState().mutate('Add gate', (ws) => {
    firstPop = addGate(ws, groupId, gate, baseName);
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
  /** Consecutive edits sharing this key coalesce into one undo step. */
  merge?: string,
) {
  useStore.getState().mutate(
    scope === 'template' ? 'Edit gate' : 'Override gate for sample',
    (ws) => {
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
    },
    merge,
  );
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

/** Move a population's label on its gate's plots; undefined puts it back in its default place. */
export function setLabelOffset(groupId: string, popId: string, offset: [number, number] | undefined) {
  useStore.getState().mutate(offset ? 'Move gate label' : 'Reset gate label', (ws) => {
    const p = ws.groups.find((x) => x.id === groupId)?.template.populations[popId];
    if (!p) return;
    p.labelOffset = offset;
  });
}
