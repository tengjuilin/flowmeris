import type { ColumnDef, PlotPoint, PlotSeries } from '@flowmeris/table';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { defaultPlot } from '../../lib/chartStyle.ts';
import { Chart } from './Chart.tsx';

const xCol: ColumnDef = { key: 'var:dose', label: 'Dose', kind: 'variable', type: 'numeric' };
const yCol: ColumnDef = { key: 'st_1', label: 'Median', kind: 'stat', type: 'numeric' };
const plot = { ...defaultPlot([xCol, yCol], 0), kind: 'line' as const };
const pt = (x: number, mean: number): PlotPoint => ({ x, mean, err: 1, n: 2, values: [], rowIds: [] });
const series = (...keys: string[]): PlotSeries[] =>
  keys.map((key) => ({ key, points: [pt(1, 2), pt(10, 5)] }));

function chart(s: PlotSeries[]) {
  return (
    <Chart
      plot={plot}
      series={s}
      colorIndex={new Map()}
      xCol={xCol}
      yCol={yCol}
      seriesLabel="Condition"
      levels={() => undefined}
      width={400}
      height={300}
      svgRef={createRef()}
      onPickAxis={() => {}}
    />
  );
}

describe('Chart', () => {
  it('shows a tooltip for the point under the pointer', () => {
    const { container } = render(chart(series('a', 'b')));
    fireEvent.pointerOver(container.querySelectorAll('.chart-hit')[3]!);
    expect(container.querySelector('.chart-tip')?.textContent).toContain('Condition: b');
  });

  it('drops the tooltip when its series is no longer plotted', () => {
    const { container, rerender } = render(chart(series('a', 'b')));
    fireEvent.pointerOver(container.querySelectorAll('.chart-hit')[3]!);
    // E.g. undo of "Colour by" while the pointer rests on a point.
    rerender(chart(series('c', 'd')));
    expect(container.querySelector('.chart-tip')).toBeNull();
    expect(container.querySelector('svg.stat-chart')).not.toBeNull();
  });
});
