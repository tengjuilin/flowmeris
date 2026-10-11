import type { ChartStyle } from '@flowmeris/model';

/** The marks of the statistics charts (Charts view): mean marker shapes and the horizontal-line marker. */

export type MarkerShape = ChartStyle['markerShape'];

export const MARKER_SHAPES: { id: MarkerShape; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'hline', label: 'Horizontal line' },
];

const f = (v: number) => Number(v.toFixed(2));

/**
 * SVG path of a square, triangle or diamond marker centred on (cx, cy), with the area of a circle of
 * radius `r` so the shapes look the same size. Circles are drawn as `<circle>` and 'hline' as a line.
 */
export function markerPath(shape: 'square' | 'triangle' | 'diamond', cx: number, cy: number, r: number) {
  if (shape === 'square') {
    const h = (r * Math.sqrt(Math.PI)) / 2;
    return `M${f(cx - h)},${f(cy - h)}H${f(cx + h)}V${f(cy + h)}H${f(cx - h)}Z`;
  }
  if (shape === 'diamond') {
    const h = r * Math.sqrt(Math.PI / 2);
    return `M${f(cx)},${f(cy - h)}L${f(cx + h)},${f(cy)}L${f(cx)},${f(cy + h)}L${f(cx - h)},${f(cy)}Z`;
  }
  // Equilateral, pointing up, centred on its centroid.
  const side = r * Math.sqrt((4 * Math.PI) / Math.sqrt(3));
  const height = (side * Math.sqrt(3)) / 2;
  return `M${f(cx)},${f(cy - (2 * height) / 3)}L${f(cx + side / 2)},${f(cy + height / 3)}L${f(cx - side / 2)},${f(cy + height / 3)}Z`;
}

/** Length in px of the 'hline' marker: as set, else the series' slot in a band (at least 12 px), else 16 px. */
export const meanLineLength = (st: ChartStyle, band: boolean, slot: number) =>
  st.meanLineLength ?? (band ? Math.max(12, slot) : 16);
