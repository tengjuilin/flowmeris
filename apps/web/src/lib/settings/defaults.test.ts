import {
  type AxisSpec,
  type PlotSpec,
  type RidgeLayout,
  type StatPlot,
  newGroup,
  newWorkspace,
} from '@flowmeris/model';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CHART_STYLE, FACTORY_CHART_STYLE } from '../chartStyle.ts';
import { DEFAULT_FIGURE, DEFAULT_STYLE, TILE_FIGURE, TILE_STYLE } from '../figure.ts';
import { DEFAULT_OVERLAP, DEFAULT_RIDGE_STYLE } from '../ridgeStyle.ts';
import {
  FACTORY_DEFAULTS,
  applyDefaults,
  readDefaultsOverrides,
  resolveDefaults,
  restyleWorkspace,
  setDefault,
} from './defaults.ts';
import { DEFAULTS_TABS, SECTION_FIELDS, validField } from './defaultsSpec.ts';

afterEach(() => applyDefaults(FACTORY_DEFAULTS));

describe('the defaults spec', () => {
  it('lists fields the factory defaults have, each valid at its factory value', () => {
    for (const [s, fields] of Object.entries(SECTION_FIELDS)) {
      const factory = FACTORY_DEFAULTS[s as keyof typeof FACTORY_DEFAULTS] as Record<string, unknown>;
      for (const f of fields) {
        const v = factory[f.key];
        expect(validField(f, v), `${s}.${f.key} = ${JSON.stringify(v)}`).toBe(true);
        if (!(f.kind === 'color' && f.optional)) expect(v, `${s}.${f.key}`).not.toBeUndefined();
      }
    }
  });

  it('gives each card a unique id', () => {
    const ids = DEFAULTS_TABS.flatMap((t) => t.cards.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('overrides', () => {
  it('keeps only the fields that differ from the factory', () => {
    let o = setDefault({}, 'plot', 'pointPx', 4);
    expect(o).toEqual({ plot: { pointPx: 4 } });
    o = setDefault(o, 'plot', 'pointPx', FACTORY_DEFAULTS.plot.pointPx);
    expect(o).toEqual({});
  });

  it('stores an optional color left to the theme as null, and a set one as its value', () => {
    const o = setDefault({}, 'chart', 'gridColor', '#cccccc');
    expect(resolveDefaults(o).chart.gridColor).toBe('#cccccc');
    expect(setDefault(o, 'chart', 'gridColor', undefined)).toEqual({});
    // A color that is set by default (the outline of ridges is not) can be left to the theme.
    const r = setDefault({}, 'figure', 'axisColor', '#ff0000');
    expect(resolveDefaults(r).figure.axisColor).toBe('#ff0000');
  });

  it('reads only known, valid fields from untrusted JSON', () => {
    const { overrides, dropped } = readDefaultsOverrides({
      plot: { pointPx: 5, colormap: 'nope', unknown: 1 },
      figure: { fontSize: 100, fontColor: '#00ff00' },
      chart: { gridColor: null },
      bogus: {},
    });
    expect(overrides).toEqual({
      plot: { pointPx: 5 },
      figure: { fontColor: '#00ff00' },
      chart: { gridColor: null },
    });
    expect(dropped).toBe(4);
  });
});

describe('applying defaults', () => {
  it('makes them the defaults every module reads', () => {
    const d = resolveDefaults({
      plot: { pointPx: 5 },
      figure: { fontSize: 20, fontColor: '#123456' },
      tile: { fontSize: 9 },
      ridge: { fillOpacity: 0.3 },
      ridgeLayout: { overlap: 0.2 },
      chart: { markerSize: 8 },
    });
    applyDefaults(d);
    expect(DEFAULT_STYLE.pointPx).toBe(5);
    expect(TILE_STYLE.pointPx).toBe(5);
    expect(DEFAULT_FIGURE.fontSize).toBe(20);
    // The Tiles figure is the Gate view's with its own text sizes.
    expect(TILE_FIGURE).toMatchObject({ fontSize: 9, fontColor: '#123456', titleFontSize: 14 });
    expect(TILE_STYLE.figure).toBe(TILE_FIGURE);
    expect(DEFAULT_RIDGE_STYLE.fillOpacity).toBe(0.3);
    expect(DEFAULT_OVERLAP).toBe(0.2);
    expect(DEFAULT_CHART_STYLE.markerSize).toBe(8);
    applyDefaults(FACTORY_DEFAULTS);
    expect(DEFAULT_CHART_STYLE).toBe(FACTORY_CHART_STYLE);
  });
});

/** A workspace with a Gate-view plot, a Tiles plot, a grid cell, a ridge plot and a chart, all at the factory defaults. */
function workspace() {
  const ws = newWorkspace('t', { version: '0', commit: '', kernels: '' });
  const g = newGroup('G', ['s'], ['A', 'B']);
  const axis: AxisSpec = { channel: 'A', comp: 'uncompensated', transform: 't', range: [0, 1] };
  const plot = (id: string, style: PlotSpec['style']) =>
    ({ id, population: 'root', kind: 'dot', x: axis, y: axis, style: structuredClone(style) }) as PlotSpec;
  g.plots.push(plot('p', { ...FACTORY_DEFAULTS.plot, figure: FACTORY_DEFAULTS.figure }));
  g.tilePlots.push(
    plot('t', { ...FACTORY_DEFAULTS.plot, figure: { ...FACTORY_DEFAULTS.figure, ...FACTORY_DEFAULTS.tile } }),
  );
  g.grid.cells.push({ ...plot('c', FACTORY_DEFAULTS.plot), overlay: [] }, null);
  g.layouts.push({
    kind: 'ridge',
    id: 'r',
    population: 'root',
    axis,
    overlap: FACTORY_DEFAULTS.ridgeLayout.overlap,
    norm: 'mode',
    style: structuredClone(FACTORY_DEFAULTS.ridge),
  } as unknown as RidgeLayout);
  g.statPlots.push({ id: 'k', style: structuredClone(FACTORY_DEFAULTS.chart) } as StatPlot);
  ws.groups.push(g);
  return { ws, g };
}

describe('restyleWorkspace', () => {
  it('moves fields still at the old default to the new one, and leaves the others', () => {
    const { ws, g } = workspace();
    g.plots[0]!.style.contourWidth = 3; // set by the user
    const to = resolveDefaults({
      plot: { pointPx: 5, contourWidth: 2 },
      figure: { fontColor: '#123456', tickWidth: 2 },
      tile: { fontSize: 9 },
      ridge: { fillOpacity: 0.3 },
      ridgeLayout: { overlap: 0.2 },
      chart: { markerSize: 8, gridColor: '#eeeeee' },
    });
    expect(restyleWorkspace(ws, FACTORY_DEFAULTS, to)).toBe(true);
    const [p, t, c] = [g.plots[0]!, g.tilePlots[0]!, g.grid.cells[0]!];
    expect(p.style.pointPx).toBe(5);
    expect(p.style.contourWidth).toBe(3);
    expect(p.style.figure).toMatchObject({ fontColor: '#123456', tickWidth: 2, fontSize: 14 });
    expect(t.style.figure).toMatchObject({ fontColor: '#123456', fontSize: 9, titleFontSize: 14 });
    // A grid cell without figure options draws with the defaults: only its display settings are stored.
    expect(c.style.pointPx).toBe(5);
    expect(c.style.figure).toBeUndefined();
    const r = g.layouts[0] as RidgeLayout;
    expect(r.style.fillOpacity).toBe(0.3);
    expect(r.overlap).toBe(0.2);
    expect(g.statPlots[0]!.style).toMatchObject({ markerSize: 8, gridColor: '#eeeeee' });
  });

  it('unsets a color that goes back to the theme', () => {
    const { ws, g } = workspace();
    const from = resolveDefaults({ chart: { gridColor: '#eeeeee' } });
    g.statPlots[0]!.style.gridColor = '#eeeeee';
    restyleWorkspace(ws, from, FACTORY_DEFAULTS);
    expect('gridColor' in g.statPlots[0]!.style).toBe(false);
  });

  it('changes nothing when no default changed', () => {
    const { ws } = workspace();
    const before = JSON.stringify(ws);
    expect(restyleWorkspace(ws, FACTORY_DEFAULTS, resolveDefaults({}))).toBe(false);
    expect(JSON.stringify(ws)).toBe(before);
  });
});
