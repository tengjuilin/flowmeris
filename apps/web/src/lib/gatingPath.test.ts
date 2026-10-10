import { type Gate, type Group, type PlotSpec, newGroup, populationLineage } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from './figure.ts';
import { pathSteps, pctOfParent, plotForGate, plotsForChildren, treeLayout } from './gatingPath.ts';

const dim = (channel: string) => ({ channel, comp: 'group' as const, transform: 'tr' });
const axis = (channel: string) => ({
  channel,
  comp: 'group' as const,
  transform: 'tr',
  range: [0, 1] as [number, number],
});

/** A group: root → A (gate gA on FSC/SSC) → C (gate gC on FL1, 1D); root → B (gate gB on FSC/SSC). */
function group(): Group {
  const g = newGroup('G', ['s1'], ['FSC', 'SSC', 'FL1']);
  const gate = (id: string, parentPop: string, chans: string[]): Gate => ({
    id,
    parentPop,
    dims: chans.map(dim),
    geometry: { kind: 'rect', min: [0, 0], max: [1, 1] },
  });
  g.template.gates = {
    gA: gate('gA', 'root', ['FSC', 'SSC']),
    gB: gate('gB', 'root', ['FSC', 'SSC']),
    gC: gate('gC', 'A', ['FL1']),
  };
  const pop = (id: string, parent: string, gateId: string) => ({
    id,
    parent,
    gate: gateId,
    region: 'in' as const,
    name: id,
    color: '#000',
  });
  g.template.populations.B = pop('B', 'root', 'gB');
  g.template.populations.A = pop('A', 'root', 'gA');
  g.template.populations.C = pop('C', 'A', 'gC');
  return g;
}

const saved = (id: string, population: string, x: string, y?: string): PlotSpec => ({
  id,
  population,
  kind: y ? 'dot' : 'histogram',
  x: axis(x),
  ...(y ? { y: axis(y) } : {}),
  style: DEFAULT_STYLE,
});

describe('the plot showing a gate', () => {
  it('is the population’s own plot on the gate’s axes', () => {
    const g = group();
    g.plots = [saved('p1', 'root', 'SSC', 'FSC'), saved('p2', 'root', 'FSC', 'SSC')];
    expect(plotForGate(g, 'root', g.template.gates.gA!)).toEqual({ plot: g.plots[1], real: true });
  });

  it('is otherwise built from the gate’s channels, in the kind and style of the population’s plot', () => {
    const g = group();
    g.axisDefaults.FSC = { ...axis('FSC'), range: [0.1, 0.9] };
    const style = { ...DEFAULT_STYLE, pointPx: 7 };
    g.plots = [{ ...saved('p1', 'root', 'SSC', 'FL1'), kind: 'contour', stylesByAxes: { 'FSC|SSC': style } }];
    const r = plotForGate(g, 'root', g.template.gates.gA!);
    expect(r?.real).toBe(false);
    expect(r?.plot).toMatchObject({
      id: 'path_root_gA',
      population: 'root',
      kind: 'contour',
      x: { channel: 'FSC', range: [0.1, 0.9] },
      y: { channel: 'SSC', range: [0, 1] },
      style,
    });
  });

  it('is a histogram for a 1D gate, and the population’s first plot when a channel has no transform', () => {
    const g = group();
    expect(plotForGate(g, 'A', g.template.gates.gC!)?.plot.kind).toBe('histogram');
    g.template.gates.gC!.dims = [{ channel: 'FL1', comp: 'group', transform: null }];
    expect(plotForGate(g, 'A', g.template.gates.gC!)).toBeNull();
    g.plots = [saved('p1', 'A', 'SSC', 'FSC')];
    expect(plotForGate(g, 'A', g.template.gates.gC!)).toEqual({ plot: g.plots[0], real: true });
  });
});

describe('the gating tree', () => {
  it('draws child gates in their saved plot together, and builds one plot per gate otherwise', () => {
    const g = group();
    const kids = [g.template.populations.A!, g.template.populations.B!];
    const ids = () => plotsForChildren(g, 'root', kids).map((p) => [p.plot.id, p.gateIds]);
    expect(ids()).toEqual([
      ['path_root_gA', ['gA']],
      ['path_root_gB', ['gB']],
    ]);
    g.plots = [saved('p1', 'root', 'FSC', 'SSC')];
    expect(ids()).toEqual([['p1', ['gA', 'gB']]]);
  });

  it('lists each population’s children by name and the plots under it', () => {
    const { kids, plots } = treeLayout(group());
    expect(kids.get('root')!.map((p) => p.id)).toEqual(['A', 'B']);
    expect(kids.get('A')!.map((p) => p.id)).toEqual(['C']);
    expect([...plots.keys()]).toEqual(['root', 'A']);
    expect(plots.get('A')![0]!.gateIds).toEqual(['gC']);
  });

  it('has one path step per ancestor, with the plot of the gate leading on', () => {
    const g = group();
    const steps = pathSteps(g, populationLineage(g.template, 'C'));
    expect(steps.map((s) => [s.pop.id, s.next.id, s.r?.plot.id])).toEqual([
      ['root', 'A', 'path_root_gA'],
      ['A', 'C', 'path_A_gC'],
    ]);
  });
});

describe('percent of parent', () => {
  it('has two decimals, and … until known', () => {
    expect(pctOfParent({ count: 1, parent: 3 })).toBe('33.33%');
    expect(pctOfParent({ count: 0, parent: 0 })).toBe('…');
    expect(pctOfParent(undefined)).toBe('…');
  });
});
