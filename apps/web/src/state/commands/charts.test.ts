import { type StatPlot, type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CHART_STYLE } from '../../lib/chartStyle.ts';
import { APP_INFO, useStore } from '../store.ts';
import { addChart, editChart, removeChart } from './charts.ts';

const S = useStore.getState;
const ids = () => S().ws.groups[0]!.statPlots.map((p) => p.id);

const chart = (id: string): StatPlot => ({
  id,
  name: id,
  kind: 'bar',
  x: 'var:dose',
  y: 'root|count',
  xScale: 'linear',
  yScale: 'linear',
  error: 'sem',
  showPoints: true,
  hiddenPoints: [],
  excludeRows: [],
  style: structuredClone(DEFAULT_CHART_STYLE),
});

beforeEach(() => {
  const ws: Workspace = newWorkspace('t', APP_INFO);
  const grp = newGroup('G', [], ['FSC-A']);
  grp.id = 'g';
  ws.groups.push(grp);
  S().setWorkspace(ws);
  S().setUi({ groupId: 'g', view: 'charts' });
});

describe('chart commands', () => {
  it('a new chart is added and shown', () => {
    addChart('g', chart('sp_a'));
    addChart('g', chart('sp_b'));
    expect(ids()).toEqual(['sp_a', 'sp_b']);
    expect(S().ui.chartId).toBe('sp_b');
    S().undo();
    expect(ids()).toEqual(['sp_a']);
  });

  it('edits one chart', () => {
    addChart('g', chart('sp_a'));
    editChart('g', 'sp_a', 'Rename chart', (p) => void (p.name = 'Dose response'));
    expect(S().ws.groups[0]!.statPlots[0]!.name).toBe('Dose response');
  });

  it('deleting the shown chart shows the one after it, or before it when it was last', () => {
    for (const id of ['sp_a', 'sp_b', 'sp_c']) addChart('g', chart(id));
    S().setUi({ chartId: 'sp_b' });
    removeChart('g', 'sp_b');
    expect(ids()).toEqual(['sp_a', 'sp_c']);
    expect(S().ui.chartId).toBe('sp_c');
    removeChart('g', 'sp_c');
    expect(S().ui.chartId).toBe('sp_a');
    removeChart('g', 'sp_a');
    expect(ids()).toEqual([]);
    expect(S().ui.chartId).toBeNull();
  });

  it('deleting another chart keeps the shown one', () => {
    for (const id of ['sp_a', 'sp_b']) addChart('g', chart(id));
    removeChart('g', 'sp_a');
    expect(S().ui.chartId).toBe('sp_b');
  });
});
