import { type PlotSpec, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../lib/figure.ts';
import { DEFAULT_HOTKEYS, EMPTY_SETTINGS, FACTORY_DEFAULTS, setHotkey } from '../lib/settings/index.ts';
import { useSettings } from './settings.ts';
import { APP_INFO, useStore } from './store.ts';

const S = useSettings.getState;
const plot = () => useStore.getState().ws.groups[0]!.plots[0]!;

beforeEach(() => {
  S().replace(EMPTY_SETTINGS);
  const ws = newWorkspace('t', APP_INFO);
  const g = newGroup('G', ['s'], ['A']);
  g.plots.push({ id: 'p', population: 'root', style: structuredClone(FACTORY_DEFAULTS.plot) } as PlotSpec);
  ws.groups.push(g);
  useStore.getState().setWorkspace(ws);
});

describe('the settings store', () => {
  it('uses a changed default from now on and restyles the open workspace, as one undo step', () => {
    S().setDefault('plot', 'pointPx', 5);
    expect(DEFAULT_STYLE.pointPx).toBe(5);
    expect(plot().style.pointPx).toBe(5);
    expect(S().settings.defaults).toEqual({ plot: { pointPx: 5 } });
    expect(useStore.getState().past.at(-1)?.label).toBe('Restyle with the new defaults');
    useStore.getState().undo();
    expect(plot().style.pointPx).toBe(FACTORY_DEFAULTS.plot.pointPx);
  });

  it('leaves a setting the user changed on a figure', () => {
    useStore.getState().mutate('Set', (ws) => void (ws.groups[0]!.plots[0]!.style.pointPx = 7));
    S().setDefault('plot', 'pointPx', 5);
    expect(plot().style.pointPx).toBe(7);
  });

  it('resets fields, and everything, to the factory defaults', () => {
    S().setDefault('plot', 'pointPx', 5);
    S().setDefault('plot', 'outlierPx', 4);
    S().resetDefaults([['plot', ['pointPx']]]);
    expect(S().settings.defaults).toEqual({ plot: { outlierPx: 4 } });
    expect(plot().style.pointPx).toBe(FACTORY_DEFAULTS.plot.pointPx);
    S().resetDefaults();
    expect(S().settings.defaults).toEqual({});
    expect(DEFAULT_STYLE).toEqual(FACTORY_DEFAULTS.plot);
  });

  it('keeps hotkeys as overrides of the defaults', () => {
    S().setHotkeys(setHotkey(DEFAULT_HOTKEYS, 'tool.rect', 'V'));
    expect(S().settings.hotkeys).toEqual({ 'tool.rect': ['V'], 'tool.select': [] });
    expect(S().hotkeys['tool.rect']).toEqual(['V']);
    // Hotkeys are no workspace edit.
    expect(useStore.getState().past).toHaveLength(0);
  });

  it('redraws the open view once after defaults changed', () => {
    S().redrawViews(); // earlier tests' changes
    const rev = S().rev;
    S().redrawViews();
    expect(S().rev).toBe(rev);
    S().setDefault('chart', 'markerSize', 8);
    S().setDefault('chart', 'markerSize', 9);
    S().redrawViews();
    expect(S().rev).toBe(rev + 1);
    S().redrawViews();
    expect(S().rev).toBe(rev + 1);
  });
});
