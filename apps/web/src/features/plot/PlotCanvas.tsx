import type { Group, PlotFigure, PlotSpec, Workspace } from '@flowmeris/model';
import {
  type RefObject,
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PlotHandle } from '../../lib/export/plot.ts';
import { DEFAULT_FIGURE, figureText } from '../../lib/figure.ts';
import { plotKey } from '../../lib/keys.ts';
import { plotFrame } from '../../lib/plotFrame.ts';
import { plotAriaLabel, plotBox } from '../../lib/plotLayout.ts';
import { contextFor, useStore } from '../../state/store.ts';
import { DraftShapes } from './DraftShapes.tsx';
import { GateShapes } from './GateShapes.tsx';
import { type AxisMenu, AxisPickerMenu, type HistNorm, PlotAxes } from './PlotAxes.tsx';
import { EventPaths, usePlotPaths } from './PlotPaths.tsx';
import { useGateEditing } from './useGateEditing.ts';
import { useBackgate, useGateCounts, useOverlaySamples, usePlotEvents } from './usePlotData.ts';

const UNIT: [number, number] = [0, 1];
const NO_OVERLAYS: { color: string; heights: Float64Array }[] = [];

export interface PlotCanvasProps {
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  /** Space available; a fixed box aspect ratio (figure `boxAspect`) may use less of it. */
  width: number;
  height: number;
  interactive?: boolean;
  compact?: boolean;
  /** Hide the off-scale / non-positive event note below the plot. */
  hideOffScaleNote?: boolean;
  /** Called when a population is double-clicked (drill-down). */
  onDrill?: (popId: string) => void;
  /** Emphasise the gate producing this population and dim the plot's other gates. */
  focusPopId?: string;
  /** Overlay a descendant population's events in its colour (backgating). */
  backgate?: { popId: string; color: string };
  /**
   * Overlay other samples' events, each in its colour; `sampleId` is then drawn as dots (2D) or an
   * outline (histogram) in `color`. Gates and their percentages stay those of `sampleId`.
   */
  overlay?: { color: string; samples: { sampleId: string; color: string }[] };
  /** Makes the axis titles clickable, to pick another channel for that axis. */
  onPickChannel?: (axis: 'x' | 'y', channel: string) => void;
  /** Makes a histogram's y-axis title clickable, to pick what the y axis shows. */
  onPickHistNorm?: (norm: HistNorm) => void;
}

/**
 * One plot (2D raster or histogram) with its axes and the gates on it. `interactive` plots draw and
 * edit gates (useGateEditing); others only show them. Data comes from the worker pool (usePlotData).
 */
export const PlotCanvas = forwardRef<PlotHandle, PlotCanvasProps>(function PlotCanvas(
  {
    ws,
    group,
    sampleId,
    plot,
    width: availWidth,
    height: availHeight,
    interactive = false,
    compact = false,
    hideOffScaleNote = false,
    onDrill,
    focusPopId,
    backgate,
    overlay,
    onPickChannel,
    onPickHistNorm,
  },
  ref,
) {
  // Narrow subscriptions: a plot (e.g. each of many tiles) re-renders only when what it shows changes.
  const missingMap = useStore((s) => s.status.missing);
  const tool = useStore((s) => (interactive ? s.ui.tool : 'select'));
  const selectedGateId = useStore((s) => (interactive ? s.ui.selectedGateId : null));
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  const { margin, pw, ph, width, height, tickY, xTitleY, yTitleX, title } = plotBox(
    plot,
    availWidth,
    availHeight,
    compact,
  );
  const is1d = plot.kind === 'histogram' || !plot.y;
  const xr = plot.x.range;
  const yr = plot.y?.range ?? UNIT;
  const frame = useMemo(() => plotFrame(xr, yr, pw, ph), [xr, yr, pw, ph]);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = `clip${useId().replace(/:/g, '')}`;

  const ctx = useMemo(() => contextFor(ws, group), [ws, group]);
  const key = useMemo(() => plotKey(ws, group, sampleId, plot), [ws, group, sampleId, plot]);
  const dpr = compact ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const missing = !!missingMap[sampleId];
  const ovSamples = useMemo(
    () => (overlay?.samples ?? []).filter((o) => o.sampleId !== sampleId && !missingMap[o.sampleId]),
    [overlay, sampleId, missingMap],
  );
  const ovColor = ovSamples.length ? overlay?.color : undefined;
  const bgPop = backgate && backgate.popId !== plot.population ? backgate : null;

  const data = { ws, group, ctx, sampleId, plot, plotKey: key, is1d, pw, ph, dpr, missing };
  const { canvasRef, raster, hist, error, loading } = usePlotEvents(data, ovColor);
  const { bgCanvasRef, bgHist } = useBackgate(data, bgPop);
  const { ovCanvasRef, ovHists } = useOverlaySamples(data, ovSamples);
  const { gates, counts } = useGateCounts(data);
  const edit = useGateEditing({
    ws,
    group,
    ctx,
    sampleId,
    plot,
    is1d,
    frame,
    margin,
    svgRef,
    gates,
    interactive,
    compact,
    missing,
    tool,
    selectedGateId,
    onDrill,
  });

  useImperativeHandle(ref, () => ({ svg: svgRef.current, raster, size: { width, height, margin } }), [
    raster,
    width,
    height,
    margin,
  ]);

  const { histPath, contourPaths, bgHistPath } = usePlotPaths({
    hist,
    raster,
    bgHist,
    ovHists: ovSamples.length ? ovHists : NO_OVERLAYS,
    is1d,
    frame,
  });

  const [axisMenu, setAxisMenu] = useState<AxisMenu | null>(null);
  const closeAxisMenu = useCallback(() => setAxisMenu(null), []);
  const { maps } = edit;

  const nonIdentityWarning =
    interactive && gates.some((g) => !maps(g).every((m) => m.identity))
      ? 'Some gates were drawn on a different axis scale; they are shown mapped onto this scale and can be edited after switching the axis back.'
      : null;

  return (
    <div className="plot" style={{ width, height }}>
      {!is1d && (
        <PlotRasters
          box={{ left: margin.l, top: margin.t, width: pw, height: ph }}
          canvasRef={canvasRef}
          ovCanvasRef={ovColor ? ovCanvasRef : null}
          bgCanvasRef={bgPop ? bgCanvasRef : null}
        />
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`plot-overlay tool-${tool}`}
        {...edit.handlers}
        role="img"
        aria-label={plotAriaLabel(ws, sampleId, plot)}
      >
        <g transform={`translate(${margin.l},${margin.t})`}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={pw} height={ph} />
            </clipPath>
          </defs>
          <rect
            x={0}
            y={0}
            width={pw}
            height={ph}
            className="plot-frame"
            style={compact ? undefined : spineCss(fig)}
          />
          <g clipPath={`url(#${clipId})`}>
            <EventPaths
              histPath={histPath}
              bgHistPath={bgHistPath}
              contourPaths={contourPaths}
              bgColor={bgPop?.color}
              ovColor={ovColor}
            />
            <GateShapes
              group={group}
              sampleId={sampleId}
              frame={frame}
              is1d={is1d}
              fig={fig}
              compact={compact}
              gates={gates}
              geomOf={edit.geomOf}
              maps={maps}
              interactive={interactive}
              selectedGateId={selectedGateId}
              focusPopId={focusPopId}
              labelsMovable={edit.labelsMovable}
              drag={edit.drag}
              preview={edit.preview}
              counts={counts}
            />
            <DraftShapes
              frame={frame}
              drag={edit.drag}
              poly={edit.poly}
              hover={edit.hover}
              hoverGeom={edit.hoverGeom}
              hoverCounts={edit.hoverCounts}
            />
          </g>
          {!compact && (
            <>
              <PlotTitle title={title} fig={fig} pw={pw} />
              <PlotAxes
                ws={ws}
                sampleId={sampleId}
                plot={plot}
                fig={fig}
                frame={frame}
                is1d={is1d}
                tickY={tickY}
                xTitleY={xTitleY}
                yTitleX={yTitleX}
                histTop={histPath?.top ?? 1}
                canPickChannel={!!onPickChannel}
                canPickHistNorm={!!onPickHistNorm}
                onOpenMenu={setAxisMenu}
              />
            </>
          )}
        </g>
      </svg>
      <PlotStatus
        box={{ left: margin.l, top: margin.t, width: pw, height: ph }}
        missing={missing}
        error={error}
        loading={loading}
        offScale={!compact && !hideOffScaleNote && fig.showOffScaleNote ? (is1d ? hist : raster) : null}
        warning={compact ? null : nonIdentityWarning}
      />
      {axisMenu && (
        <AxisPickerMenu
          menu={axisMenu}
          ws={ws}
          group={group}
          sampleId={sampleId}
          plot={plot}
          is1d={is1d}
          onPickChannel={onPickChannel}
          onPickHistNorm={onPickHistNorm}
          onClose={closeAxisMenu}
        />
      )}
    </div>
  );
});

/** The plot's frame line, as the figure styles it. */
function spineCss(fig: PlotFigure) {
  return { strokeWidth: fig.spineWidth, ...(fig.spineColor ? { stroke: fig.spineColor } : {}) };
}

function PlotTitle({ title, fig, pw }: { title: string | undefined; fig: PlotFigure; pw: number }) {
  if (!title) return null;
  return (
    <text
      className="plot-title"
      x={pw / 2}
      y={-10 - fig.titleFontSize * 0.4}
      textAnchor="middle"
      style={figureText(fig, fig.titleText, fig.titleFontSize)}
    >
      {title}
    </text>
  );
}

type Box = { left: number; top: number; width: number; height: number };

/**
 * A 2D plot's events, under the SVG: other samples' (when overlaid), the plot's own (faded under a
 * backgate), then the backgated population's.
 */
function PlotRasters({
  box,
  canvasRef,
  ovCanvasRef,
  bgCanvasRef,
}: {
  box: Box;
  canvasRef: RefObject<HTMLCanvasElement>;
  ovCanvasRef: RefObject<HTMLCanvasElement> | null;
  bgCanvasRef: RefObject<HTMLCanvasElement> | null;
}) {
  return (
    <>
      {ovCanvasRef && <canvas ref={ovCanvasRef} className="plot-raster" style={box} />}
      <canvas ref={canvasRef} className={`plot-raster${bgCanvasRef ? ' faded' : ''}`} style={box} />
      {bgCanvasRef && <canvas ref={bgCanvasRef} className="plot-raster" style={box} />}
    </>
  );
}

/** Messages over and under the plot area: missing data or an error, Computing…, off-scale events, a warning. */
function PlotStatus({
  box,
  missing,
  error,
  loading,
  offScale,
  warning,
}: {
  box: Box;
  missing: boolean;
  error: string | null;
  loading: boolean;
  /** Event counts for the off-scale note, or null for no note. */
  offScale: { offScale: number; nan: number } | null;
  warning: string | null;
}) {
  return (
    <>
      {(missing || error) && (
        <div className="plot-message" style={box}>
          {missing ? 'Data not loaded — re-add this FCS file to view it.' : error}
        </div>
      )}
      <OffScaleNote stats={offScale} marginLeft={box.left} />
      {loading && !missing && (
        <div className="plot-loading" style={{ left: box.left + box.width - 90, top: box.top + 4 }}>
          Computing…
        </div>
      )}
      {warning && <div className="plot-warning">{warning}</div>}
    </>
  );
}

/** How many events a log axis cannot show (non-positive) and how many fall off the axis ranges. */
function OffScaleNote({
  stats: st,
  marginLeft,
}: {
  stats: { offScale: number; nan: number } | null;
  marginLeft: number;
}) {
  if (!st || (st.offScale === 0 && st.nan === 0)) return null;
  return (
    <div className="plot-note" style={{ marginLeft }}>
      {st.nan > 0 && `${st.nan.toLocaleString()} non-positive on log axis, `}
      {st.offScale > 0 && `${st.offScale.toLocaleString()} off-scale`} (piled on edges)
    </div>
  );
}
