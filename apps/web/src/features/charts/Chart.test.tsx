import type { StatPlot } from '@flowmeris/model';
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

function chart(s: PlotSeries[], p: StatPlot = plot) {
  return (
    <Chart
      plot={p}
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

  it('draws each kind of text in its own style, in the theme colour until one is chosen', () => {
    const style = {
      ...plot.style,
      fontFamily: 'times',
      tickText: { bold: true, italic: false, underline: false },
      legendText: { bold: false, italic: true, underline: false, color: '#ff0000' },
    };
    const { container } = render(chart(series('a', 'b'), { ...plot, style }));
    const svg = container.querySelector<SVGSVGElement>('svg.stat-chart')!;
    expect(svg.style.fontFamily).toContain('Times New Roman');
    const tick = container.querySelector<SVGTextElement>('.chart-axis text')!;
    expect(tick.style.fontWeight).toBe('700');
    expect(tick.style.fill).toBe('');
    const legend = container.querySelector<SVGTextElement>('.chart-legend text')!;
    expect(legend.style.fontStyle).toBe('italic');
    expect(legend.style.fill).toBe('#ff0000');
  });

  it('draws the mean markers in the chosen shape, with their edge colour', () => {
    const style = { ...plot.style, markerShape: 'triangle' as const, markerEdgeColor: '#123456' };
    const { container } = render(chart(series('a'), { ...plot, kind: 'scatter', style }));
    const marks = container.querySelectorAll('svg.stat-chart path[stroke="#123456"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.getAttribute('d')).toMatch(/^M.*Z$/);
  });

  it('draws a horizontal-line marker in the series colour, or in one colour once picked', () => {
    const style = { ...plot.style, markerShape: 'hline' as const, meanLineWidth: 3, meanLineLength: 20 };
    const p = { ...plot, kind: 'dot' as const, style };
    const { container, rerender } = render(chart(series('a', 'b'), p));
    const lines = () => [...container.querySelectorAll<SVGLineElement>('.chart-mean-line')];
    expect(lines()).toHaveLength(4);
    const [l] = lines();
    expect(Number(l!.getAttribute('x2')) - Number(l!.getAttribute('x1'))).toBe(20);
    expect(l!.getAttribute('stroke-width')).toBe('3');
    expect(new Set(lines().map((x) => x.getAttribute('stroke'))).size).toBe(2);
    rerender(chart(series('a', 'b'), { ...p, style: { ...style, meanLineColor: '#000000' } }));
    expect(new Set(lines().map((x) => x.getAttribute('stroke')))).toEqual(new Set(['#000000']));
    expect(container.querySelector('svg.stat-chart circle')).toBeNull();
  });

  it('draws error bars, ticks and spines in their colours and widths', () => {
    const style = {
      ...plot.style,
      errorColor: '#aa0000',
      tickColor: '#00aa00',
      tickWidth: 2,
      spineColor: '#0000aa',
      spineWidth: 3,
    };
    const { container } = render(chart(series('a'), { ...plot, style }));
    const err = container.querySelector<SVGLineElement>('.chart-err line')!;
    expect(err.style.stroke).toBe('#aa0000');
    const lines = [...container.querySelectorAll<SVGLineElement>('.chart-axis line:not(.chart-grid)')];
    const spines = [...container.querySelectorAll<SVGLineElement>('.chart-spine')];
    expect(spines.map((l) => [l.style.stroke, l.style.strokeWidth])).toEqual([
      ['#0000aa', '3'],
      ['#0000aa', '3'],
    ]);
    expect(lines.filter((l) => l.style.stroke === '#00aa00').length).toBeGreaterThan(2);
  });

  it('with a box aspect ratio, the plot area takes that shape and the chart shrinks around it', () => {
    const { container } = render(chart(series('a'), { ...plot, style: { ...plot.style, boxAspect: 1 } }));
    const svg = container.querySelector('svg.stat-chart')!;
    expect(Number(svg.getAttribute('width'))).toBeLessThan(400);
    expect(svg.getAttribute('height')).toBe('300');
    const spines = [...container.querySelectorAll<SVGLineElement>('.chart-spine')];
    const y = spines.find((l) => l.getAttribute('x1') === l.getAttribute('x2'))!;
    const x = spines.find((l) => l.getAttribute('y1') === l.getAttribute('y2'))!;
    const h = Number(y.getAttribute('y2')) - Number(y.getAttribute('y1'));
    const w = Number(x.getAttribute('x2')) - Number(x.getAttribute('x1'));
    expect(w).toBeCloseTo(h, 6);
  });
});
