import { type Gate, type Group, type Population, type Region, type Workspace, newId } from '@flowmeris/model';
import { nextColor } from './palette.ts';

/** Gate creation on a workspace draft. The store command is state/commands/gates.ts `createGate`. */

const QUAD_LABEL: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', [boolean, boolean]> = {
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

/**
 * Add a gate and its population(s) to group `groupId`'s template, in place (call inside `mutate`).
 * Quadrant and spider gates get four populations named after the markers (Q1 … Q4), a split gate gets
 * `marker−` and `marker+`, and any other gate one population named `baseName` or `Gate <n>`.
 * Returns the first population's id.
 */
export function addGate(ws: Workspace, groupId: string, gate: Omit<Gate, 'id'>, baseName?: string): string {
  let firstPop = '';
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
  } else if (gate.geometry.kind === 'split') {
    // FlowJo's bisector naming: the marker followed by − or +.
    const xn = shortName(ws, g, gate.dims[0]!.channel);
    firstPop = mk('lo', `${xn}−`).id;
    mk('hi', `${xn}+`);
  } else {
    firstPop = mk('in', baseName ?? `Gate ${existing + 1}`).id;
  }
  return firstPop;
}
