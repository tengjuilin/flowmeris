import type { Group, PlotFigure, PlotSpec, Workspace } from '@flowmeris/model';
import { axisTicks } from '@flowmeris/transforms';
import { useMemo } from 'react';
import { type Anchor, PickerMenu, channelOptions, pickerTrigger } from '../../components/ui/PickerMenu.tsx';
import { figureText } from '../../lib/figure.ts';
import { scaleFor } from '../../lib/geometry.ts';
import type { PlotFrame } from '../../lib/plotFrame.ts';
import { axisLabel } from '../../lib/plotLayout.ts';
import { customTicks, formatHistTick, histYTicks } from '../../lib/ticks.ts';

export type HistNorm = PlotSpec['style']['histNorm'];

/** What a histogram's y axis can show: FlowJo's Count, Normalized to Mode and Unit Area. */
const HIST_NORMS: { value: HistNorm; label: string; detail: string }[] = [
  { value: 'count', label: 'Count', detail: 'events per bin' },
  { value: 'mode', label: '% of max', detail: 'normalised to mode' },
  { value: 'area', label: 'Fraction', detail: 'unit area' },
];

/** The y axis title of a histogram: what it shows. */
export function histNormTitle(norm: HistNorm): string {
  return HIST_NORMS.find((o) => o.value === norm)?.label ?? 'Count';
}

/** An open axis-title menu: which axis, and where its title is. */
export type AxisMenu = { axis: 'x' | 'y'; anchor: Anchor };

export interface PlotAxesProps {
  ws: Workspace;
  sampleId: string;
  plot: PlotSpec;
  fig: PlotFigure;
  frame: PlotFrame;
  is1d: boolean;
  /** Text positions from `plotBox`. */
  tickY: number;
  xTitleY: number;
  yTitleX: number;
  /** A histogram's y-axis top, in its normalisation's units. */
  histTop: number;
  /** Axis titles open a picker when the caller can change the channel (or what a histogram's y shows). */
  canPickChannel: boolean;
  canPickHistNorm: boolean;
  onOpenMenu: (menu: AxisMenu) => void;
}

/** The x and y axes: ticks, tick labels and titles, under and left of the plot area. */
export function PlotAxes(props: PlotAxesProps) {
  const { ws, sampleId, plot, fig, frame, is1d, tickY, xTitleY, yTitleX, histTop } = props;
  const { canPickChannel, canPickHistNorm, onOpenMenu } = props;
  const { xr, yr, pw, ph, X, Y } = frame;
  const xTicks = useMemo(() => {
    try {
      const s = scaleFor(ws, plot.x.transform);
      return fig.xTicks
        ? customTicks(fig.xTicks, s.apply, xr)
        : axisTicks(s.def, s.apply, s.inverse, xr[0], xr[1]);
    } catch {
      return [];
    }
  }, [ws, plot.x.transform, xr, fig.xTicks]);
  const yTicks = useMemo(() => {
    if (is1d || !plot.y) return [];
    try {
      const s = scaleFor(ws, plot.y.transform);
      return fig.yTicks
        ? customTicks(fig.yTicks, s.apply, yr)
        : axisTicks(s.def, s.apply, s.inverse, yr[0], yr[1]);
    } catch {
      return [];
    }
  }, [ws, plot.y, yr, is1d, fig.yTicks]);

  const label = (axis: 'x' | 'y') => axisLabel(ws, sampleId, plot, axis);
  const tickCss = figureText(fig, fig.tickText, fig.tickFontSize);
  const axisTitleCss = figureText(fig, fig.axisTitleText, fig.axisTitleFontSize);
  const lineCss = { strokeWidth: fig.tickWidth, ...(fig.axisColor ? { stroke: fig.axisColor } : {}) };
  const normTitle = histNormTitle(plot.style.histNorm);
  const axisTitle = (axis: 'x' | 'y') =>
    is1d && axis === 'y'
      ? canPickHistNorm
        ? {
            className: 'axis-title pickable',
            ...pickerTrigger(`Y axis: ${normTitle}. Change what the y axis shows`, (anchor) =>
              onOpenMenu({ axis, anchor }),
            ),
          }
        : { className: 'axis-title' }
      : canPickChannel
        ? {
            className: 'axis-title pickable',
            ...pickerTrigger(`${axis.toUpperCase()} axis: ${label(axis)}. Change channel`, (anchor) =>
              onOpenMenu({ axis, anchor }),
            ),
          }
        : { className: 'axis-title' };

  return (
    <>
      <g className="axis" transform={`translate(0,${ph})`} style={{ fontFamily: tickCss.fontFamily }}>
        {xTicks.map((t, i) => (
          <g key={i} transform={`translate(${X(t.pos)},0)`}>
            <line y2={t.major ? 6 : 3} style={lineCss} />
            {fig.showTickLabels && t.label && (
              <text y={tickY} textAnchor="middle" style={tickCss}>
                {t.label}
              </text>
            )}
          </g>
        ))}
        <text {...axisTitle('x')} x={pw / 2} y={xTitleY} textAnchor="middle" style={axisTitleCss}>
          {label('x')}
        </text>
      </g>
      <g className="axis">
        {is1d
          ? histYTicks(histTop, plot.style.histNorm).map((v) => (
              <g key={v} transform={`translate(0,${ph - (v / histTop) * ph})`}>
                <line x2={-6} style={lineCss} />
                {fig.showTickLabels && (
                  <text x={-9} dy="0.32em" textAnchor="end" style={tickCss}>
                    {formatHistTick(v, plot.style.histNorm)}
                  </text>
                )}
              </g>
            ))
          : yTicks.map((t, i) => (
              <g key={i} transform={`translate(0,${Y(t.pos)})`}>
                <line x2={t.major ? -6 : -3} style={lineCss} />
                {fig.showTickLabels && t.label && (
                  <text x={-9} dy="0.32em" textAnchor="end" style={tickCss}>
                    {t.label}
                  </text>
                )}
              </g>
            ))}
        <text
          {...axisTitle('y')}
          transform={`translate(${yTitleX},${ph / 2}) rotate(-90)`}
          textAnchor="middle"
          style={axisTitleCss}
        >
          {is1d ? normTitle : label('y')}
        </text>
      </g>
    </>
  );
}

/** The menu an axis title opens: another channel, or what a histogram's y axis shows. */
export function AxisPickerMenu({
  menu,
  ws,
  group,
  sampleId,
  plot,
  is1d,
  onPickChannel,
  onPickHistNorm,
  onClose,
}: {
  menu: AxisMenu;
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  is1d: boolean;
  onPickChannel?: (axis: 'x' | 'y', channel: string) => void;
  onPickHistNorm?: (norm: HistNorm) => void;
  onClose: () => void;
}) {
  if (is1d && menu.axis === 'y')
    return onPickHistNorm ? (
      <PickerMenu
        anchor={menu.anchor}
        title="Y axis shows"
        options={HIST_NORMS}
        value={plot.style.histNorm}
        onPick={(v) => onPickHistNorm(v as HistNorm)}
        onClose={onClose}
      />
    ) : null;
  return onPickChannel ? (
    <PickerMenu
      anchor={menu.anchor}
      title={`${menu.axis.toUpperCase()} axis channel`}
      options={channelOptions(group, ws.samples[sampleId])}
      value={plot[menu.axis]?.channel}
      onPick={(ch) => onPickChannel(menu.axis, ch)}
      onClose={onClose}
    />
  ) : null;
}
