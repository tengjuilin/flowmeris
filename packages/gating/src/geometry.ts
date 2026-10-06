/**
 * Point-membership predicates (methods M-GATE-*; docs/methods/gating.md).
 * All coordinates are in the gate's own dimension space (compensated, then
 * transformed per GateDim). NaN coordinates are outside every gate.
 *
 * Boundary rules are those of Gating-ML 2.0 as implemented by FlowKit/FlowUtils,
 * so membership agrees event-for-event with the Gating-ML compliance suite.
 */

/** M-GATE-RECT: inside iff min ≤ x < max on every bounded side (null = unbounded). */
export function inRange(x: number, min: number | null, max: number | null): boolean {
  if (Number.isNaN(x)) return false;
  if (min !== null && !(x >= min)) return false;
  if (max !== null && !(x < max)) return false;
  return true;
}

export interface PreparedPolygon {
  xs: Float64Array;
  ys: Float64Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function preparePolygon(vertices: readonly (readonly [number, number])[]): PreparedPolygon {
  const n = vertices.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (vertices[i] as readonly [number, number])[0];
    ys[i] = (vertices[i] as readonly [number, number])[1];
  }
  let minX = xs[0] as number;
  let maxX = minX;
  let minY = ys[0] as number;
  let maxY = minY;
  for (let i = 1; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    if (x < minX) minX = x;
    else if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    else if (y > maxY) maxY = y;
  }
  return { xs, ys, minX, maxX, minY, maxY };
}

/**
 * M-GATE-POLY: crossing-number parity of the winding count (Sunday 2012),
 * after a bounding-box prefilter — identical to FlowUtils `points_in_polygon`
 * (wind_count % 2 ≠ 0). Self-intersecting polygons therefore follow the
 * even–odd rule.
 */
export function inPolygon(p: PreparedPolygon, x: number, y: number): boolean {
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) return false;
  const { xs, ys } = p;
  const n = xs.length;
  let wind = 0;
  for (let i = 0; i < n; i++) {
    const ax = xs[i] as number;
    const ay = ys[i] as number;
    const j = i >= n - 1 ? 0 : i + 1;
    const bx = xs[j] as number;
    const by = ys[j] as number;
    if (ay <= y) {
      if (y < by) {
        const isLeft = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
        if (isLeft > 0) wind += 1;
      }
    } else if (by <= y) {
      const isLeft = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (isLeft < 0) wind -= 1;
    }
  }
  return wind % 2 !== 0;
}

/**
 * M-GATE-ELLIPSE: inside iff (x − μ)ᵀ Σ⁻¹ (x − μ) ≤ d² (boundary inclusive).
 * `inv` is Σ⁻¹ (row-major); the quadratic form is accumulated as
 * Σ_j (Σ_i v_i·inv[i][j])·v_j, the same order as FlowUtils.
 */
export function inEllipsoid(
  v: ArrayLike<number>,
  mean: ArrayLike<number>,
  inv: number[][],
  d2: number,
): boolean {
  const n = mean.length;
  let s = 0;
  for (let j = 0; j < n; j++) {
    let r = 0;
    for (let i = 0; i < n; i++) r += ((v[i] as number) - (mean[i] as number)) * (inv[i]![j] as number);
    s += r * ((v[j] as number) - (mean[j] as number));
  }
  return s <= d2;
}

/** Ellipse (2D) from centre, semi-axes and rotation (radians) → Gating-ML covariance with d² = 1. */
export function ellipseFromAxes(
  cx: number,
  cy: number,
  a: number,
  b: number,
  theta: number,
): { mean: [number, number]; cov: [[number, number], [number, number]]; d2: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const a2 = a * a;
  const b2 = b * b;
  return {
    mean: [cx, cy],
    cov: [
      [c * c * a2 + s * s * b2, c * s * (a2 - b2)],
      [c * s * (a2 - b2), s * s * a2 + c * c * b2],
    ],
    d2: 1,
  };
}

/** Inverse of ellipseFromAxes: centre, semi-axes (a ≥ b) and rotation of a 2D Gating-ML ellipse. */
export function ellipseAxes(
  mean: readonly [number, number],
  cov: readonly [readonly [number, number], readonly [number, number]],
  d2: number,
): { cx: number; cy: number; a: number; b: number; theta: number } {
  const [[sxx, sxy], [, syy]] = cov;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  const theta = sxy === 0 && sxx >= syy ? 0 : sxy === 0 ? Math.PI / 2 : Math.atan2(l1 - sxx, sxy);
  return { cx: mean[0], cy: mean[1], a: Math.sqrt(l1 * d2), b: Math.sqrt(Math.max(l2, 0) * d2), theta };
}

/**
 * M-GATE-SPIDER: four regions bounded by rays from the centre through the
 * arm points [up, right, down, left].
 *
 * The left and right rays form a "horizontal" divider polyline y = h(x); the
 * up and down rays a "vertical" divider x = v(y). An event is on the + side of
 * each divider with the same inclusive rule as a Gating-ML quadrant gate
 * (y ≥ h(x), x ≥ v(y)); Q1 = (−,+), Q2 = (+,+), Q3 = (+,−), Q4 = (−,−). With
 * axis-aligned arms this is exactly a quadrant gate, and every non-NaN event
 * falls in exactly one region. Sides are decided by cross products, so no
 * division (and no slope rounding) is involved.
 *
 * Returns 1–4 (Q1–Q4) or 0 for NaN input.
 */
export function spiderRegion(
  cx: number,
  cy: number,
  arms: readonly (readonly [number, number])[],
  x: number,
  y: number,
): 0 | 1 | 2 | 3 | 4 {
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  const [up, right, down, left] = arms as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  const px = x - cx;
  const py = y - cy;
  let yPlus: boolean;
  if (px >= 0) {
    const dx = right[0] - cx;
    const dy = right[1] - cy;
    yPlus = dx * py - dy * px >= 0;
  } else {
    const dx = left[0] - cx;
    const dy = left[1] - cy;
    yPlus = dx * py - dy * px <= 0;
  }
  let xPlus: boolean;
  if (py >= 0) {
    const dx = up[0] - cx;
    const dy = up[1] - cy;
    xPlus = dx * py - dy * px <= 0;
  } else {
    const dx = down[0] - cx;
    const dy = down[1] - cy;
    xPlus = dx * py - dy * px >= 0;
  }
  if (yPlus) return xPlus ? 2 : 1;
  return xPlus ? 3 : 4;
}

/**
 * Validate spider arms: up arm above the centre, right arm to its right, down
 * arm below, left arm to its left. Under these constraints the four regions
 * are connected angular sectors and partition the plane.
 */
export function validateSpider(
  center: readonly [number, number],
  arms: readonly (readonly [number, number])[],
): string | null {
  const [cx, cy] = center;
  const [up, right, down, left] = arms as readonly (readonly [number, number])[];
  if (!up || !right || !down || !left) return 'Spider gate needs four arms';
  if (!(up[1] > cy)) return 'Up arm must be above the centre';
  if (!(right[0] > cx)) return 'Right arm must be right of the centre';
  if (!(down[1] < cy)) return 'Down arm must be below the centre';
  if (!(left[0] < cx)) return 'Left arm must be left of the centre';
  // Arms must be in counter-clockwise order right → up → left → down.
  const cross = (a: readonly [number, number], b: readonly [number, number]) =>
    (a[0] - cx) * (b[1] - cy) - (a[1] - cy) * (b[0] - cx);
  if (!(cross(right, up) > 0 && cross(up, left) > 0 && cross(left, down) > 0 && cross(down, right) > 0)) {
    return 'Spider arms must keep their angular order (up, right, down, left clockwise)';
  }
  return null;
}
