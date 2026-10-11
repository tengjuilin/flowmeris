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
    // E.g. undo of "Color by" while the pointer rests on a point.
    rerender(chart(series('c', 'd')));
    expect(container.querySelector('.chart-tip')).toBeNull();
    expect(container.querySelector('svg.stat-chart')).not.toBeNull();
  });

  it('draws each kind of text in its own style, in the theme color until one is chosen', () => {
    const style = {
      ...plot.style,
      fontFamily: 'times',
      tickText: { bold: true, italic: false, underline: false },
      legendText: { bold: false, italic: true, underline: false, color: '#ff0000' },
    };
    const { container } = render(chart(series('a', 'b'), { ...plot, style }));
    const svg = container.querySelector<SVGSVGElement>('svg.stat-chart')!;
    expect(svg.style.fontFamily).toContain('Liberation Serif');
    const tick = container.querySelector<SVGTextElement>('.chart-axis text')!;
    expect(tick.style.fontWeight).toBe('700');
    expect(tick.style.fill).toBe('');
    const legend = container.querySelector<SVGTextElement>('.chart-legend text')!;
    expect(legend.style.fontStyle).toBe('italic');
    expect(legend.style.fill).toBe('#ff0000');
  });

  it('draws the mean markers in the chosen shape, with their edge color', () => {
    const style = { ...plot.style, markerShape: 'triangle' as const, markerEdgeColor: '#123456' };
    const { container } = render(chart(series('a'), { ...plot, kind: 'scatter', style }));
    const marks = container.querySelectorAll('svg.stat-chart path[stroke="#123456"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.getAttribute('d')).toMatch(/^M.*Z$/);
  });

  it('draws a horizontal-line marker in the series color, or in one color once picked', () => {
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

  it('draws error bars, ticks and spines in their colors and widths', () => {
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

  it.each([
    ['top', 0.2],
    ['right', 0.2],
    ['right', 8],
  ] as const)('a %s legend stays inside the chart with aspect ratio %s', (legend, boxAspect) => {
    const names = ['a long condition name', 'another long condition', 'third', 'fourth', 'fifth', 'sixth'];
    const style = { ...plot.style, boxAspect, legend };
    const { container } = render(chart(series(...names), { ...plot, style }));
    const svg = container.querySelector('svg.stat-chart')!;
    const [W, H] = [Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))];
    const g = container.querySelector('.chart-legend')!;
    const [, gx, gy] = g
      .getAttribute('transform')!
      .match(/translate\(([-\d.]+), ([-\d.]+)\)/)!
      .map(Number);
    for (const e of g.querySelectorAll(':scope > g')) {
      const [, ex, ey] = e
        .getAttribute('transform')!
        .match(/translate\(([-\d.]+), ([-\d.]+)\)/)!
        .map(Number);
      const text = e.querySelector('text')!;
      const right = gx! + ex! + Number(text.getAttribute('x')) + text.textContent!.length * 12 * 0.6;
      expect(right).toBeLessThanOrEqual(W);
      expect(gy! + ey! + 6).toBeLessThanOrEqual(H);
    }
  });

  it('draws replicate points in their own shape, size, color and edge', () => {
    const pts = [{ ...pt(1, 2), values: [1, 3] }];
    const style = {
      ...plot.style,
      pointShape: 'diamond' as const,
      pointSize: 4,
      pointColor: '#aa00aa',
      pointEdgeColor: '#00aaaa',
      pointEdgeWidth: 2.5,
    };
    const { container } = render(chart([{ key: 'a', points: pts }], { ...plot, kind: 'scatter', style }));
    const reps = [...container.querySelectorAll('.chart-rep')];
    expect(reps).toHaveLength(2);
    for (const r of reps) {
      expect(r.tagName).toBe('path');
      expect([r.getAttribute('fill'), r.getAttribute('stroke'), r.getAttribute('stroke-width')]).toEqual([
        '#aa00aa',
        '#00aaaa',
        '2.5',
      ]);
    }
  });

  it('draws the line, bar outlines, mean markers and gridlines in their own styles', () => {
    const style = {
      ...plot.style,
      lineColor: '#101010',
      lineDash: 'dashed' as const,
      lineWidth: 2,
      markerColor: '#202020',
      markerEdgeWidth: 0.5,
      gridColor: '#303030',
      gridWidth: 2,
    };
    const { container, rerender } = render(chart(series('a'), { ...plot, style }));
    const line = container.querySelector('polyline')!;
    expect([line.getAttribute('stroke'), line.getAttribute('stroke-dasharray')]).toEqual(['#101010', '8 5']);
    const marker = container.querySelector('svg.stat-chart circle:not(.chart-rep)')!;
    expect([marker.getAttribute('fill'), marker.getAttribute('stroke-width')]).toEqual(['#202020', '0.5']);
    const grid = container.querySelector<SVGLineElement>('.chart-grid')!;
    expect([grid.style.stroke, grid.style.strokeWidth]).toEqual(['#303030', '2']);

    const bars = { ...plot.style, barEdgeWidth: 1.5 };
    rerender(chart(series('a'), { ...plot, kind: 'bar', style: bars }));
    const bar = container.querySelector('svg.stat-chart path[fill]')!;
    expect(bar.getAttribute('stroke')).toBe(bar.getAttribute('fill'));
    expect(bar.getAttribute('stroke-width')).toBe('1.5');
    rerender(chart(series('a'), { ...plot, kind: 'bar', style: { ...bars, barEdgeColor: '#404040' } }));
    expect(container.querySelector('svg.stat-chart path[fill]')!.getAttribute('stroke')).toBe('#404040');
  });

  /** Each legend entry's position in the chart, from the transforms of the legend and the entry. */
  const entries = (container: HTMLElement) => {
    const xy = (e: Element) => e.getAttribute('transform')!.match(/translate\(([-\d.]+), ([-\d.]+)\)/)!;
    const g = container.querySelector('.chart-legend')!;
    const [, gx, gy] = xy(g).map(Number);
    return [...g.querySelectorAll(':scope > g')].map((e) => {
      const [, x, y] = xy(e).map(Number);
      return { x: gx! + x!, y: gy! + y! };
    });
  };
  const names = ['condition one', 'condition two', 'condition three', 'condition four'];

  it('a top legend wraps to more rows as the plot area narrows, instead of widening the chart', () => {
    const style = { ...plot.style, boxAspect: 0.5 };
    const { container } = render(chart(series(...names), { ...plot, style }));
    const ys = new Set(entries(container).map((e) => e.y));
    expect(ys.size).toBeGreaterThan(1);
    const svg = container.querySelector('svg.stat-chart')!;
    expect(Number(svg.getAttribute('width'))).toBeLessThan(400);
  });

  it('a set number of columns, a bottom legend below the x title, and alignment along the plot', () => {
    const style = { ...plot.style, legend: 'bottom' as const, legendColumns: 2, legendAlign: 'end' as const };
    const { container } = render(chart(series(...names), { ...plot, style }));
    const e = entries(container);
    expect(new Set(e.map((p) => p.x)).size).toBe(2);
    expect(new Set(e.map((p) => p.y)).size).toBe(2);
    const title = [...container.querySelectorAll('.chart-axis text')].find((t) => t.textContent === 'Dose')!;
    expect(Math.min(...e.map((p) => p.y))).toBeGreaterThan(Number(title.getAttribute('y')));
    const spine = [...container.querySelectorAll('.chart-spine')].find(
      (l) => l.getAttribute('y1') === l.getAttribute('y2'),
    )!;
    // Aligned to the end: the legend's right edge is near the plot area's.
    const right = Math.max(...e.map((p) => p.x));
    expect(right).toBeGreaterThan(Number(spine.getAttribute('x2')) / 2);
  });

  it('an inside legend is framed in its corner of the plot area', () => {
    const style = { ...plot.style, legend: 'inside-bottom-right' as const };
    const { container } = render(chart(series('a', 'b'), { ...plot, style }));
    const frame = container.querySelector('.chart-legend-frame');
    expect(frame).not.toBeNull();
    const spines = [...container.querySelectorAll('.chart-spine')];
    const xAxis = spines.find((l) => l.getAttribute('y1') === l.getAttribute('y2'))!;
    const e = entries(container);
    for (const p of e) {
      expect(p.y).toBeLessThan(Number(xAxis.getAttribute('y1')));
      expect(p.x).toBeLessThan(Number(xAxis.getAttribute('x2')));
    }
  });
});
