import type { PlotFigure, PlotSpec, Workspace } from '@flowmeris/model';
import { colormapCss } from '@flowmeris/render';
import { axisTicks } from '@flowmeris/transforms';
import { useId, useMemo } from 'react';
import { type Anchor, pickerTrigger } from '../../components/ui/PickerMenu.tsx';
import { SupLabel } from '../../components/ui/SupLabel.tsx';
import { figureText } from '../../lib/figure.ts';
import { scaleFor } from '../../lib/geometry.ts';
import { axisLabel, colorBarLayout, colorBarSpan } from '../../lib/plotLayout.ts';
import { customTicks } from '../../lib/ticks.ts';

/** Color stops sampled along the color map, enough for its gradient to match the points' colors. */
const STOPS = 16;

/**
 * A Pseudocolor channel plot's color bar, right of the plot area (`pw` × `ph`): the color map over the color
 * axis's range, lowest at the bottom, with the axis's ticks and title, styled as the y axis. With
 * `onOpenMenu` its title opens a picker of the color channel.
 */
export function ColorBar({
  ws,
  sampleId,
  plot,
  fig,
  pw,
  ph,
  onOpenMenu,
}: {
  ws: Workspace;
  sampleId: string;
  plot: PlotSpec;
  fig: PlotFigure;
  pw: number;
  ph: number;
  onOpenMenu?: (anchor: Anchor) => void;
}) {
  const gradId = `cbar${useId().replace(/:/g, '')}`;
  const layout = colorBarLayout(plot);
  const color = plot.color;
  const ticks = useMemo(() => {
    if (!color) return [];
    try {
      const s = scaleFor(ws, color.transform);
      return fig.colorTicks
        ? customTicks(fig.colorTicks, s.apply, color.range)
        : axisTicks(s.def, s.apply, s.inverse, color.range[0], color.range[1]);
    } catch {
      return [];
    }
  }, [ws, color?.transform, color?.range[0], color?.range[1], fig.colorTicks]);
  if (!layout || !color) return null;
  const [lo, hi] = color.range;
  const { top, height } = colorBarSpan(fig, ph);
  const Y = (v: number) => top + height - ((v - lo) / (hi - lo)) * height;
  const x0 = pw + layout.barX;
  const x1 = x0 + layout.barWidth;
  const tickCss = figureText(fig, fig.tickText, fig.tickFontSize);
  const lineCss = { strokeWidth: fig.tickWidth, ...(fig.axisColor ? { stroke: fig.axisColor } : {}) };
  const spineCss = { strokeWidth: fig.spineWidth, ...(fig.spineColor ? { stroke: fig.spineColor } : {}) };
  const title = axisLabel(ws, sampleId, plot, 'color');
  return (
    <g className="axis color-bar">
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
          {Array.from({ length: STOPS + 1 }, (_, i) => (
            <stop key={i} offset={i / STOPS} stopColor={colormapCss(plot.style.colormap, i / STOPS)} />
          ))}
        </linearGradient>
      </defs>
      <rect x={x0} y={top} width={layout.barWidth} height={height} fill={`url(#${gradId})`} />
      <rect x={x0} y={top} width={layout.barWidth} height={height} className="plot-frame" style={spineCss} />
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(${x1},${Y(t.pos)})`}>
          <line x2={t.major ? 4 : 2} style={lineCss} />
          {fig.showTickLabels && t.label && (
            <text x={pw + layout.labelX - x1} dy="0.32em" style={tickCss}>
              <SupLabel label={t.label} fontSize={fig.tickFontSize} />
            </text>
          )}
        </g>
      ))}
      <text
        className={`axis-title${onOpenMenu ? ' pickable' : ''}`}
        {...(onOpenMenu ? pickerTrigger(`Color axis: ${title}. Change channel`, onOpenMenu) : {})}
        transform={`translate(${pw + layout.titleX},${ph / 2}) rotate(-90)`}
        textAnchor="middle"
        style={figureText(fig, fig.axisTitleText, fig.axisTitleFontSize)}
      >
        {title}
      </text>
    </g>
  );
}
