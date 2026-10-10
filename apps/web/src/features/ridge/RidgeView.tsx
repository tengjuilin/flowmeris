// Ridge plot: one mode-normalised histogram per sample, or per set of combined replicates, on a shared
// x axis (M-PLOT-RIDGE-COMBINE for combined replicates).
import { axisTicks } from '@flowmeris/transforms';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExportMenu } from '../../components/controls/ExportMenu.tsx';
import { useSize } from '../../components/hooks/useSize.ts';
import { type Anchor, PickerMenu, channelOptions, pickerTrigger } from '../../components/ui/PickerMenu.tsx';
import { SupLabel } from '../../components/ui/SupLabel.tsx';
import { factoryAxis } from '../../lib/axisDefaults.ts';
import { fontStack, textCss } from '../../lib/figure.ts';
import { scaleFor } from '../../lib/geometry.ts';
import { ridgeFrame, ridgeLabels, ridgePaths } from '../../lib/ridgeLayout.ts';
import { ridgeColor, withRidgeChannel } from '../../lib/ridgeStyle.ts';
import { textMeasure } from '../../lib/text.ts';
import { customTicks } from '../../lib/ticks.ts';
import { exportSvgFigure } from '../../state/export.ts';
import { useStore } from '../../state/store.ts';
import { useRidge } from './useRidge.ts';
import { useRidgeCurves } from './useRidgeCurves.ts';

/** Card above the population tree: export the ridge plot figure. */
export function RidgeExportCard() {
  const popId = useStore((s) => s.ui.popId);
  const { group, ch } = useRidge();
  if (!group) return null;
  const pop = group.template.populations[popId];
  return (
    <ExportMenu
      className="side-export"
      onExport={(format, dpi) => {
        const svg = document.querySelector<SVGSVGElement>('.ridge-view svg.ridge');
        return svg ? exportSvgFigure(svg, format, `${group.name}_${pop?.name}_${ch}_ridge`, dpi) : undefined;
      }}
    />
  );
}

export function RidgeView() {
  const ws = useStore((s) => s.ws);
  const popId = useStore((s) => s.ui.popId);
  const noData = useStore((s) => s.status.missing);
  const r = useRidge();
  const { group, style, combine, overlap, ch, axis, rows, update } = r;
  const sampleIds = useMemo(() => rows.flatMap((x) => x.sampleIds), [rows]);
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const [chMenu, setChMenu] = useState<Anchor | null>(null);
  const closeChMenu = useCallback(() => setChMenu(null), []);

  useEffect(() => {
    // Give the ridge plot its own axis, seeded from the channel's built-in default.
    if (group && !axis && ch) update('Default ridge axis', () => {});
  }, [group, axis, ch, update]);
  const curves = useRidgeCurves(r, sampleIds);

  if (!group || !axis) return <div className="empty">Select a group.</div>;
  const measure = textMeasure(
    style.labelFontSize,
    fontStack(style.labelText.fontFamily ?? style.fontFamily),
    style.labelText,
  );
  const labels = ridgeLabels(rows, curves, noData, style, combine.enabled);
  const pop = group.template.populations[popId];
  const sample0 = ws.samples[group.sampleIds[0] ?? ''];
  const marker = sample0?.channels.find((c) => c.pnn === ch)?.pns;
  const title = (style.axisTitle ?? (marker ? `${marker} :: ${ch}` : ch)).trim();
  const f = ridgeFrame(style, overlap, labels, measure, width, title);
  const { labelW, labelLines, lineH, W, H, pw } = f;
  const X = (v: number) => labelW + ((v - axis.range[0]) / (axis.range[1] - axis.range[0])) * pw;
  let ticks: { pos: number; label: string; major: boolean }[] = [];
  try {
    const s = scaleFor(ws, axis.transform);
    const [lo, hi] = axis.range;
    ticks = style.ticks
      ? customTicks(style.ticks, s.apply, axis.range)
      : axisTicks(s.def, s.apply, s.inverse, lo, hi);
  } catch {
    /* ignore */
  }
  const setChannel = (c: string) =>
    update('Ridge channel', (l, w, g) => {
      withRidgeChannel(l, () => {
        l.axis = factoryAxis(w, g, c);
      });
    });
  const text = (t: typeof style.labelText, fontSize: number) => ({
    fontSize,
    ...textCss(t, style.fontFamily, style.fontColor),
  });
  const lx = style.labelAlign === 'start' ? 8 : style.labelAlign === 'middle' ? labelW / 2 : labelW - 8;

  return (
    <div className="ridge-view" ref={box}>
      <svg
        width={W}
        height={H}
        className="ridge"
        role="img"
        aria-label={`Ridge plot of ${ch} for ${pop?.name}`}
        style={{ fontFamily: fontStack(style.fontFamily) }}
      >
        <rect width={W} height={H} fill="var(--surface)" />
        {rows.map((row, i) => {
          const h = curves[row.id];
          const base = f.top + f.rowH * i;
          const { curve, band } = h ? ridgePaths(h, X, base, f.amp) : { curve: '', band: '' };
          const lines = labelLines[i] ?? [];
          const color = ridgeColor(style, row.id, i);
          return (
            <g key={row.id}>
              {style.showLabels && (
                <text
                  x={lx}
                  y={base - 3 - (lines.length - 1) * lineH}
                  textAnchor={style.labelAlign}
                  className="ridge-label"
                  style={text(style.labelText, style.labelFontSize)}
                >
                  <title>{row.sampleIds.map((id) => ws.samples[id]?.relativePath).join('\n')}</title>
                  {lines.map((line, k) => (
                    <tspan key={k} x={lx} dy={k === 0 ? 0 : lineH}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              {band && <path d={band} fill={color} fillOpacity={style.fillOpacity * 0.45} stroke="none" />}
              {h && (
                <path
                  d={curve}
                  fill={color}
                  fillOpacity={style.fillOpacity}
                  stroke={style.strokeColor ?? 'var(--surface)'}
                  strokeWidth={style.strokeWidth}
                />
              )}
              <line
                x1={labelW}
                x2={labelW + pw}
                y1={base}
                y2={base}
                className="ridge-base"
                style={style.baselineColor ? { stroke: style.baselineColor } : undefined}
              />
            </g>
          );
        })}
        <g className="axis" transform={`translate(0,${f.axisY})`}>
          {ticks.map((t, i) => (
            <g key={i} transform={`translate(${X(t.pos)},0)`}>
              <line y2={t.major ? 6 : 3} style={style.axisColor ? { stroke: style.axisColor } : undefined} />
              {style.showTickLabels && t.label && (
                <text y={f.tickLabelY} textAnchor="middle" style={text(style.tickText, style.tickFontSize)}>
                  <SupLabel label={t.label} fontSize={style.tickFontSize} />
                </text>
              )}
            </g>
          ))}
          {title && (
            <text
              x={labelW + pw / 2}
              y={f.titleY}
              textAnchor="middle"
              className="axis-title pickable"
              style={text(style.titleText, style.titleFontSize)}
              {...pickerTrigger(`X axis: ${title}. Change channel`, setChMenu)}
            >
              {title}
            </text>
          )}
        </g>
      </svg>
      <p className="muted small">
        Population: {pop?.name}
        {sampleIds.length < group.sampleIds.length &&
          ` · ${sampleIds.length} of ${group.sampleIds.length} samples (sidebar selection)`}
        {combine.enabled &&
          ` · replicates combined (${combine.method === 'mean' ? 'average of curves' : 'pooled events'})`}
      </p>
      {chMenu && (
        <PickerMenu
          anchor={chMenu}
          title="Channel"
          options={channelOptions(group, sample0)}
          value={ch}
          onPick={setChannel}
          onClose={closeChMenu}
        />
      )}
      <p className="muted small">
        Each curve is a histogram normalised to its own mode (smoothed, σ = {style.smoothing} bins); n is the
        number of events in the population.{' '}
        {combine.enabled &&
          `Combined ridges ${
            combine.method === 'mean'
              ? 'average the replicates’ unit-area histograms'
              : 'pool the replicates’ events'
          }; n sums the replicates${
            combine.method === 'mean' && combine.band !== 'none'
              ? `; the band is ±${combine.band.toUpperCase()} per bin`
              : ''
          }. `}
        Combine replicates in the panel below the populations; customise colours, labels, order and axes in
        the panel on the right.
      </p>
    </div>
  );
}
