import { describe, expect, it } from 'vitest';
import {
  ChartStyleSchema,
  RidgeStyleSchema,
  loadWorkspace,
  newGroup,
  newWorkspace,
  removeGateCascade,
  removeVariable,
} from './index.ts';

describe('ridge layout style', () => {
  it('fills every default from an empty object', () => {
    const s = RidgeStyleSchema.parse({});
    expect(s.colorMode).toBe('single');
    expect(s.order).toEqual([]);
    expect(s.ticks).toBeUndefined();
  });

  it('loads ridge layouts saved without a style', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const g = newGroup('g', [], ['FSC-A']);
    g.layouts.push({
      kind: 'ridge',
      id: 'lay_1',
      population: 'root',
      axis: { channel: 'FSC-A', comp: 'group', transform: 't_1', range: [0, 1] },
      overlap: 0.6,
      norm: 'mode',
    } as never);
    ws.groups.push(g);
    const loaded = loadWorkspace(JSON.parse(JSON.stringify(ws)));
    const l = loaded.groups[0]!.layouts[0]!;
    expect(l.kind === 'ridge' && l.style.fillOpacity).toBe(0.55);
    expect(l.kind === 'ridge' && l.combine).toEqual({
      enabled: false,
      by: [],
      method: 'mean',
      band: 'none',
      hidden: [],
      exclude: [],
    });
  });

  it('rejects malformed colours', () => {
    expect(() => RidgeStyleSchema.parse({ color: 'blue' })).toThrow();
  });
});

describe('chart style', () => {
  it('loads charts saved without a style', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const g = newGroup('g', [], ['FSC-A']);
    g.statPlots.push({
      id: 'sp_1',
      name: 'c',
      kind: 'bar',
      x: 'sample:name',
      y: 'root|count',
      xScale: 'linear',
      yScale: 'linear',
      error: 'sem',
      showPoints: true,
    } as never);
    ws.groups.push(g);
    const p = loadWorkspace(JSON.parse(JSON.stringify(ws))).groups[0]!.statPlots[0]!;
    expect(p.style).toEqual(ChartStyleSchema.parse({}));
    expect(p.style.legend).toBe('top');
    expect(p.style.yMin).toBeUndefined();
    expect([p.hiddenPoints, p.excludeRows]).toEqual([[], []]);
  });
});

describe('reference plots', () => {
  const axis = {
    channel: 'FSC-A',
    comp: 'group' as const,
    transform: 't_1',
    range: [0, 1] as [number, number],
  };

  it('loads groups saved before reference plots existed', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const { refPlots: _, ...old } = newGroup('g', [], ['FSC-A']);
    ws.groups.push(old as never);
    expect(loadWorkspace(JSON.parse(JSON.stringify(ws))).groups[0]!.refPlots).toEqual([]);
  });

  it('unpins reference plots whose population is removed', () => {
    const g = newGroup('g', [], ['FSC-A']);
    g.template.gates.gt_1 = { id: 'gt_1', parentPop: 'root' } as never;
    g.template.populations.pop_1 = { id: 'pop_1', parent: 'root', gate: 'gt_1' } as never;
    g.refPlots.push(
      { id: 'ref_1', population: 'pop_1', kind: 'histogram', x: axis, style: {} as never, backgate: false },
      { id: 'ref_2', population: 'root', kind: 'histogram', x: axis, style: {} as never, backgate: false },
    );
    removeGateCascade(g, 'gt_1');
    expect(g.refPlots.map((r) => r.population)).toEqual([undefined, 'root']);
  });
});

describe('plot grid', () => {
  const axis = {
    channel: 'FSC-A',
    comp: 'group' as const,
    transform: 't_1',
    range: [0, 1] as [number, number],
  };

  it('loads groups saved before the plot grid existed', () => {
    const ws = newWorkspace('t', { version: '0', commit: 'x', kernels: 'ts-1' });
    const { grid: _, ...old } = newGroup('g', [], ['FSC-A']);
    ws.groups.push(old as never);
    expect(loadWorkspace(JSON.parse(JSON.stringify(ws))).groups[0]!.grid).toEqual({ columns: 3, cells: [] });
  });

  it('moves cells of a removed population to the removed gate’s parent', () => {
    const g = newGroup('g', [], ['FSC-A']);
    g.template.gates.gt_1 = { id: 'gt_1', parentPop: 'root' } as never;
    g.template.populations.pop_1 = { id: 'pop_1', parent: 'root', gate: 'gt_1' } as never;
    g.template.gates.gt_2 = { id: 'gt_2', parentPop: 'pop_1' } as never;
    g.template.populations.pop_2 = { id: 'pop_2', parent: 'pop_1', gate: 'gt_2' } as never;
    const cell = (id: string, population: string) => ({
      id,
      population,
      overlay: [],
      kind: 'histogram' as const,
      x: axis,
      style: {} as never,
    });
    g.grid.cells.push(cell('c_1', 'pop_2'), null, cell('c_2', 'pop_1'));
    removeGateCascade(g, 'gt_2');
    expect(g.grid.cells.map((c) => c?.population)).toEqual(['pop_1', undefined, 'pop_1']);
  });
});

describe('sample variables and statistics table', () => {
  const app = { version: '0', commit: 'x', kernels: 'ts-1' };

  it('loads workspaces saved before variables existed', () => {
    const ws = newWorkspace('t', app);
    const g = newGroup('g', [], ['FSC-A']);
    ws.groups.push(g);
    const json = JSON.parse(JSON.stringify(ws));
    Reflect.deleteProperty(json, 'variables');
    Reflect.deleteProperty(json.groups[0], 'analysis');
    Reflect.deleteProperty(json.groups[0], 'statPlots');
    const loaded = loadWorkspace(json);
    expect(loaded.variables).toEqual([]);
    expect(loaded.groups[0]!.analysis).toEqual({
      derived: [],
      aggregate: { enabled: false, by: [], funcs: ['mean', 'sd', 'n'] },
    });
    expect(loaded.groups[0]!.statPlots).toEqual([]);
  });

  it('removing a variable cleans up values, grouping, normalisations and charts', () => {
    const ws = newWorkspace('t', app);
    ws.variables.push({ id: 'v1', name: 'Dose', type: 'numeric', levels: [] });
    ws.variables.push({ id: 'v2', name: 'Group', type: 'categorical', levels: [] });
    const g = newGroup('g', [], ['FSC-A']);
    g.analysis.aggregate.by = ['v1', 'v2'];
    g.analysis.derived.push(
      {
        id: 'n',
        name: 'Fold',
        kind: 'normalize',
        source: 'root|count',
        refVariable: 'v1',
        refValue: 0,
        within: [],
        mode: 'ratio',
      },
      {
        id: 'm',
        name: 'Fold2',
        kind: 'normalize',
        source: 'derived:n',
        refVariable: 'v2',
        refValue: 'a',
        within: ['v1'],
        mode: 'ratio',
      },
    );
    g.analysis.exportColumns = ['var:v1', 'var:v2', 'root|count', 'derived:n'];
    g.statPlots.push(
      {
        id: 'p1',
        name: 'a',
        kind: 'scatter',
        x: 'var:v1',
        y: 'root|count',
        xScale: 'linear',
        yScale: 'linear',
        error: 'sem',
        showPoints: true,
        hiddenPoints: [],
        excludeRows: [],
        style: ChartStyleSchema.parse({}),
      },
      {
        id: 'p2',
        name: 'b',
        kind: 'bar',
        x: 'var:v2',
        y: 'root|count',
        series: 'v1',
        xScale: 'linear',
        yScale: 'linear',
        error: 'sem',
        showPoints: true,
        hiddenPoints: [],
        excludeRows: [],
        style: ChartStyleSchema.parse({}),
      },
    );
    ws.groups.push(g);
    removeVariable(ws, 'v1');
    expect(ws.variables.map((v) => v.id)).toEqual(['v2']);
    expect(g.analysis.aggregate.by).toEqual(['v2']);
    expect(g.analysis.derived).toEqual([]);
    expect(g.analysis.exportColumns).toEqual(['var:v2', 'root|count']);
    expect(g.statPlots.map((p) => [p.id, p.series])).toEqual([['p2', undefined]]);
  });
});
