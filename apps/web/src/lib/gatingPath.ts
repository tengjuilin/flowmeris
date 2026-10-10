import type { Gate, Group, PlotSpec, Population } from '@flowmeris/model';
import { DEFAULT_STYLE } from './figure.ts';
import { gateMatchesAxes } from './geometry.ts';

/** The Gating path view: which plot shows each gate along a population's lineage, or in the whole tree. */

/** Events in a population and in its parent. */
export type Count = { count: number; parent: number };
export type Counts = Record<string, Count>;
/** A plot to draw under a population, with the child gates it shows; `real` if it is a saved plot. */
export type PlotChoice = { plot: PlotSpec; real: boolean; gateIds: string[] };

const byName = (a: Population, b: Population) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * The plot of `popId` on which `gate` (a child gate) is drawn: the population's own plot when its axes
 * match the gate, otherwise a read-only plot built from the gate's channels and the group's axis defaults.
 * Returns `real: false` for the latter so clicking it does not pretend to open a saved plot.
 */
export function plotForGate(g: Group, popId: string, gate: Gate): { plot: PlotSpec; real: boolean } | null {
  const own = g.plots.filter((p) => p.population === popId);
  const match = own.find((p) => gateMatchesAxes(gate, p.x, p.kind === 'histogram' ? undefined : p.y));
  if (match) return { plot: match, real: true };
  const axes = gate.dims.map((d) => {
    const def = g.axisDefaults[d.channel];
    const tr = def?.transform ?? d.transform;
    return tr ? { channel: d.channel, comp: d.comp, transform: tr, range: def?.range ?? [0, 1] } : null;
  });
  if (axes.some((a) => !a)) return own[0] ? { plot: own[0], real: true } : null;
  const is1d = axes.length === 1;
  const base = own.find((p) => (p.kind === 'histogram') === is1d);
  // The settings this channel pair would have if never opened: its saved ones, not those in use.
  const key = `${axes[0]!.channel}|${is1d ? '' : axes[1]!.channel}`;
  const plot: PlotSpec = {
    id: `path_${popId}_${gate.id}`,
    population: popId,
    kind: is1d ? 'histogram' : base?.kind && base.kind !== 'histogram' ? base.kind : 'pseudocolor',
    x: axes[0]!,
    style:
      base?.stylesByAxes?.[key] ??
      (base?.styleFollow === false ? base.styleBase : undefined) ??
      DEFAULT_STYLE,
  };
  if (!is1d) plot.y = axes[1]!;
  return { plot, real: false };
}

/** The distinct plots needed to show every child gate of `popId` (children `kids`), each with the gates it shows. */
export function plotsForChildren(g: Group, popId: string, kids: Population[]): PlotChoice[] {
  const gateIds = [...new Set(kids.flatMap((p) => (p.gate ? [p.gate] : [])))];
  const out: PlotChoice[] = [];
  for (const id of gateIds) {
    const gate = g.template.gates[id];
    const r = gate && plotForGate(g, popId, gate);
    if (!r) continue;
    const same = out.find((o) => o.plot.id === r.plot.id);
    if (same) same.gateIds.push(id);
    else out.push({ ...r, gateIds: [id] });
  }
  return out;
}

/**
 * Children (sorted) and child-gate plots of every population, built in one pass over the template.
 * Memoise it per group so re-renders (counts arriving, slider moves) reuse the same plot objects.
 */
export function treeLayout(g: Group): { kids: Map<string, Population[]>; plots: Map<string, PlotChoice[]> } {
  const kids = new Map<string, Population[]>();
  for (const p of Object.values(g.template.populations)) {
    if (!p.parent) continue;
    const list = kids.get(p.parent);
    if (list) list.push(p);
    else kids.set(p.parent, [p]);
  }
  const plots = new Map<string, PlotChoice[]>();
  for (const [id, list] of kids) {
    list.sort(byName);
    plots.set(id, plotsForChildren(g, id, list));
  }
  return { kids, plots };
}

/** The steps of the path to the last population of `lineage`: each ancestor, its child on the path, and the plot showing that child's gate. */
export function pathSteps(g: Group, lineage: Population[]) {
  return lineage.slice(0, -1).map((pop, i) => {
    const next = lineage[i + 1]!;
    const gate = g.template.gates[next.gate!]!;
    return { pop, next, r: plotForGate(g, pop.id, gate) };
  });
}

/** Percentage of the parent, to two decimals; '…' until the count is known. */
export function pctOfParent(x: Count | undefined): string {
  return x && x.parent > 0 ? `${((100 * x.count) / x.parent).toFixed(2)}%` : '…';
}
