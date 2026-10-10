import type { HistogramResponse, RasterResponse } from '@flowmeris/engine';
import { useMemo } from 'react';
import type { PlotFrame } from '../../lib/plotFrame.ts';
import { backgateHeights, contourPath, histAreaPath, histTop } from '../../lib/plotPaths.ts';

/**
 * SVG paths of what the plot draws as vectors: the histogram with overlaid samples' histograms (all on
 * one y scale) and the backgated population's, or a 2D plot's contours.
 */
export function usePlotPaths({
  hist,
  raster,
  bgHist,
  ovHists,
  is1d,
  frame,
}: {
  hist: HistogramResponse | null;
  raster: RasterResponse | null;
  bgHist: { sub: Float64Array; base: Float64Array } | null;
  /** Overlaid samples' histograms shown. */
  ovHists: { color: string; heights: Float64Array }[];
  is1d: boolean;
  frame: PlotFrame;
}) {
  const { X, Y, ph } = frame;
  const histPath = useMemo(() => {
    if (!hist || !is1d) return null;
    const top = histTop([hist.heights, ...ovHists.map((o) => o.heights)]);
    const c = hist.centers;
    return {
      d: histAreaPath(c, hist.heights, top, X, ph),
      top,
      overlays: ovHists
        .filter((o) => o.heights.length === c.length)
        .map((o) => ({ color: o.color, d: histAreaPath(c, o.heights, top, X, ph) })),
    };
  }, [hist, is1d, X, ph, ovHists]);

  const contourPaths = useMemo(
    () => (is1d ? null : raster?.contours.map((c) => contourPath(c.rings, X, Y))),
    [raster, is1d, X, Y],
  );

  const bgHistPath = useMemo(() => {
    if (!hist || !histPath || !bgHist || !is1d || bgHist.sub.length !== hist.centers.length) return null;
    const heights = backgateHeights(hist.heights, bgHist.base, bgHist.sub);
    return histAreaPath(hist.centers, heights, histPath.top, X, ph);
  }, [hist, histPath, bgHist, is1d, X, ph]);

  return { histPath, contourPaths, bgHistPath };
}

/**
 * The histogram (faded under a backgate; an outline in `ovColor` when other samples are overlaid), the
 * overlaid samples' and backgated population's histograms, and contours.
 */
export function EventPaths({
  histPath,
  bgHistPath,
  contourPaths,
  bgColor,
  ovColor,
}: ReturnType<typeof usePlotPaths> & { bgColor: string | undefined; ovColor: string | undefined }) {
  return (
    <>
      {histPath?.overlays.map((o, i) => (
        <path key={i} d={o.d} className="hist-overlay" style={{ stroke: o.color }} />
      ))}
      {histPath && (
        <path
          d={histPath.d}
          className={`hist${bgColor ? ' faded' : ''}${ovColor ? ' hist-overlay' : ''}`}
          style={ovColor ? { stroke: ovColor } : undefined}
        />
      )}
      {bgHistPath && bgColor && (
        <path d={bgHistPath} className="hist-backgate" style={{ fill: bgColor, stroke: bgColor }} />
      )}
      {contourPaths?.map((d, i) => (
        <path key={i} className="contour" d={d} />
      ))}
    </>
  );
}
