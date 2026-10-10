import type { Region } from '@flowmeris/model';
import type { PlotFrame } from '../../lib/plotFrame.ts';
import { QUAD_CORNERS } from './GateShapes.tsx';
import type { Drag, HoverGeometry } from './useGateEditing.ts';
import type { RegionCounts } from './useGatePreview.ts';

/** The rectangle, range or ellipse being dragged out. */
function CreatingShape({ drag, f }: { drag: Extract<Drag, { kind: 'create' }>; f: PlotFrame }) {
  const { X, Y } = f;
  const [x0, y0] = drag.start;
  const [x1, y1] = drag.cur;
  if (drag.tool === 'range')
    return (
      <rect
        x={Math.min(X(x0), X(x1))}
        y={0}
        width={Math.abs(X(x1) - X(x0))}
        height={f.ph}
        className="draft"
      />
    );
  if (drag.tool === 'rect')
    return (
      <rect
        x={Math.min(X(x0), X(x1))}
        y={Math.min(Y(y0), Y(y1))}
        width={Math.abs(X(x1) - X(x0))}
        height={Math.abs(Y(y1) - Y(y0))}
        className="draft"
      />
    );
  return (
    <ellipse
      cx={(X(x0) + X(x1)) / 2}
      cy={(Y(y0) + Y(y1)) / 2}
      rx={Math.abs(X(x1) - X(x0)) / 2}
      ry={Math.abs(Y(y1) - Y(y0)) / 2}
      className="draft"
    />
  );
}

/** Quadrant, spider or split: the gate and its region percentages under the cursor before it is placed. */
function HoverShape({ geom, f, counts }: { geom: HoverGeometry; f: PlotFrame; counts: RegionCounts | null }) {
  const { X, Y, pw, ph } = f;
  const hoverPct = (r: Region) =>
    counts && counts.parent > 0 ? `${((100 * (counts.regions[r] ?? 0)) / counts.parent).toFixed(2)}%` : '…';
  if (geom.kind === 'split') {
    const a = X(geom.at);
    const barY = ph * 0.12;
    return (
      <g className="hover-draft" pointerEvents="none">
        <line x1={a} y1={0} x2={a} y2={ph} className="draft" />
        <line x1={0} y1={barY} x2={pw} y2={barY} className="draft" />
        <text x={6} y={barY - 6} textAnchor="start" className="gate-label draft-label">
          {hoverPct('lo')}
        </text>
        <text x={pw - 6} y={barY - 6} textAnchor="end" className="gate-label draft-label">
          {hoverPct('hi')}
        </text>
      </g>
    );
  }
  const cx = X(geom.center[0]);
  const cy = Y(geom.center[1]);
  const far = 4 * (pw + ph);
  const ends: [number, number][] =
    geom.kind === 'quadrant'
      ? [
          [cx, -far],
          [cx + far, cy],
          [cx, far],
          [cx - far, cy],
        ]
      : geom.arms.map((a) => {
          const dx = X(a[0]) - cx;
          const dy = Y(a[1]) - cy;
          const n = Math.hypot(dx, dy) || 1;
          return [cx + (dx / n) * far, cy + (dy / n) * far];
        });
  return (
    <g className="hover-draft" pointerEvents="none">
      {ends.map(([ex, ey], i) => (
        <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} className="draft" />
      ))}
      <circle cx={cx} cy={cy} r={3} className="draft-vertex" />
      {(Object.keys(QUAD_CORNERS) as Region[]).map((r) => {
        const [x, y, anchor] = QUAD_CORNERS[r]!(pw, ph);
        return (
          <text key={r} x={x} y={y} textAnchor={anchor} className="gate-label draft-label">
            {hoverPct(r)}
          </text>
        );
      })}
    </g>
  );
}

/** Gates being drawn: a dragged shape, the polygon so far (to the cursor) and the click-to-place preview. */
export function DraftShapes({
  frame: f,
  drag,
  poly,
  hover,
  hoverGeom,
  hoverCounts,
}: {
  frame: PlotFrame;
  drag: Drag | null;
  poly: [number, number][] | null;
  hover: [number, number] | null;
  hoverGeom: HoverGeometry | null;
  hoverCounts: RegionCounts | null;
}) {
  return (
    <>
      {drag?.kind === 'create' && <CreatingShape drag={drag} f={f} />}
      {poly && (
        <g>
          <polyline
            points={[...poly, ...(hover ? [hover] : [])].map((p) => `${f.X(p[0])},${f.Y(p[1])}`).join(' ')}
            className="draft"
            fill="none"
          />
          {poly.map((p, i) => (
            <circle key={i} cx={f.X(p[0])} cy={f.Y(p[1])} r={i === 0 ? 5 : 3} className="draft-vertex" />
          ))}
        </g>
      )}
      {hoverGeom && <HoverShape geom={hoverGeom} f={f} counts={hoverCounts} />}
    </>
  );
}
