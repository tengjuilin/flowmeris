import type { PlotFigure, PlotSpec, Workspace } from '@flowmeris/model';
import { colormapCss } from '@flowmeris/render';
import { axisTicks } from '@flowmeris/transforms';
import { useId, useMemo } from 'react';
import { SupLabel } from '../../components/ui/SupLabel.tsx';
import { figureText } from '../../lib/figure.ts';
import { scaleFor } from '../../lib/geometry.ts';
import { COLOR_BAR, axisLabel, colorBarLayout } from '../../lib/plotLayout.ts';

/** Color stops sampled along the color map, enough for its gradient to match the points' colors. */
const STOPS = 16;

/**
 * A Pseudocolor channel plot's color bar, right of the plot area (`pw` × `ph`): the color map over the color
 * axis's range, lowest at the bottom, with the axis's ticks and title, styled as the y axis.
 */
export function ColorBar({
  ws,
  sampleId,
  plot,
  fig,
  pw,
  ph,
}: { ws: Workspace; sampleId: string; plot: PlotSpec; fig: PlotFigure; pw: number; ph: number }) {
  const gradId = `cbar${useId().replace(/:/g, '')}`;
  const layout = colorBarLayout(plot);
  const color = plot.color;
  const ticks = useMemo(() => {
    if (!color) return [];
    try {
      const s = scaleFor(ws, color.transform);
      return axisTicks(s.def, s.apply, s.inverse, color.range[0], color.range[1]);
    } catch {
      return [];
    }
  }, [ws, color?.transform, color?.range[0], color?.range[1]]);
  if (!layout || !color) return null;
  const [lo, hi] = color.range;
  const Y = (v: number) => ph - ((v - lo) / (hi - lo)) * ph;
  const x0 = pw + COLOR_BAR.gap;
  const tickCss = figureText(fig, fig.tickText, fig.tickFontSize);
  const lineCss = { strokeWidth: fig.tickWidth, ...(fig.axisColor ? { stroke: fig.axisColor } : {}) };
  const spineCss = { strokeWidth: fig.spineWidth, ...(fig.spineColor ? { stroke: fig.spineColor } : {}) };
  return (
    <g className="axis color-bar">
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
          {Array.from({ length: STOPS + 1 }, (_, i) => (
            <stop key={i} offset={i / STOPS} stopColor={colormapCss(plot.style.colormap, i / STOPS)} />
          ))}
        </linearGradient>
      </defs>
      <rect x={x0} y={0} width={COLOR_BAR.width} height={ph} fill={`url(#${gradId})`} />
      <rect x={x0} y={0} width={COLOR_BAR.width} height={ph} className="plot-frame" style={spineCss} />
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(${x0 + COLOR_BAR.width},${Y(t.pos)})`}>
          <line x2={t.major ? 4 : 2} style={lineCss} />
          {fig.showTickLabels && t.label && (
            <text x={layout.labelX - COLOR_BAR.gap - COLOR_BAR.width} dy="0.32em" style={tickCss}>
              <SupLabel label={t.label} fontSize={fig.tickFontSize} />
            </text>
          )}
        </g>
      ))}
      <text
        className="axis-title"
        transform={`translate(${pw + layout.titleX},${ph / 2}) rotate(-90)`}
        textAnchor="middle"
        style={figureText(fig, fig.axisTitleText, fig.axisTitleFontSize)}
      >
        {axisLabel(ws, sampleId, plot, 'color')}
      </text>
    </g>
  );
}
