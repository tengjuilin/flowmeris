import { invert } from '@flowmeris/compensation';
import type { Geometry, Region } from '@flowmeris/model';
import { type Bitset, emptyBitset, fullBitset } from './bitset.ts';
import { inPolygon, preparePolygon, spiderRegion } from './geometry.ts';

export interface GateResult {
  /** Region → membership bitset. Simple gates produce only 'in'. */
  regions: Partial<Record<Region, Bitset>>;
}

const QUADRANT_REGIONS: Region[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export function regionsOf(g: Geometry): Region[] {
  return g.kind === 'quadrant' || g.kind === 'spider' ? QUADRANT_REGIONS : ['in'];
}

/**
 * Evaluate a gate over the events in `parent` (all events if null).
 * `dims` are the gate's dimension columns (already compensated and
 * transformed into the gate's space), one per GateDim.
 *
 * The kernels walk the parent bitset word by word and build each output word
 * in a register (event i keeps its own bit), so the cost scales with the
 * parent's size and no per-event callback is involved. Membership tests are
 * the M-GATE-* predicates of geometry.ts, inlined with identical arithmetic.
 */
export function evaluateGate(
  geometry: Geometry,
  dims: ArrayLike<number>[],
  n: number,
  parent: Bitset | null,
): GateResult {
  const par = parent ?? fullBitset(n);
  const words = par.length;
  const x = dims[0] as ArrayLike<number>;
  const y = dims[1];
  switch (geometry.kind) {
    case 'rect': {
      const out = emptyBitset(n);
      const d = dims.length;
      // M-GATE-RECT (inRange): min ≤ v < max on each bounded side. An unbounded
      // min becomes −∞, which still rejects NaN (NaN ≥ −∞ is false).
      const lo = new Float64Array(d);
      const hi = new Float64Array(d);
      const hasHi = new Uint8Array(d);
      for (let k = 0; k < d; k++) {
        const mn = geometry.min[k] ?? null;
        const mx = geometry.max[k] ?? null;
        lo[k] = mn === null ? Number.NEGATIVE_INFINITY : mn;
        hi[k] = mx === null ? 0 : mx;
        hasHi[k] = mx === null ? 0 : 1;
      }
      if (d === 2 && y) {
        const lx = lo[0] as number;
        const ly = lo[1] as number;
        const hx = hi[0] as number;
        const hy = hi[1] as number;
        const bx = hasHi[0] === 1;
        const by = hasHi[1] === 1;
        for (let w = 0; w < words; w++) {
          let v = par[w] as number;
          if (v === 0) continue;
          let o = 0;
          const base = w << 5;
          while (v !== 0) {
            const t = v & -v;
            v ^= t;
            const i = base + (31 - Math.clz32(t));
            const xv = x[i] as number;
            const yv = y[i] as number;
            if (!(xv >= lx) || !(yv >= ly)) continue;
            if ((bx && !(xv < hx)) || (by && !(yv < hy))) continue;
            o |= t;
          }
          out[w] = o;
        }
      } else {
        for (let w = 0; w < words; w++) {
          let v = par[w] as number;
          if (v === 0) continue;
          let o = 0;
          const base = w << 5;
          outer: while (v !== 0) {
            const t = v & -v;
            v ^= t;
            const i = base + (31 - Math.clz32(t));
            for (let k = 0; k < d; k++) {
              const val = (dims[k] as ArrayLike<number>)[i] as number;
              if (!(val >= (lo[k] as number))) continue outer;
              if (hasHi[k] === 1 && !(val < (hi[k] as number))) continue outer;
            }
            o |= t;
          }
          out[w] = o;
        }
      }
      return { regions: { in: out } };
    }
    case 'polygon': {
      if (!y) throw new Error('Polygon gate needs two dimensions');
      const poly = preparePolygon(geometry.vertices);
      const { minX, maxX, minY, maxY } = poly;
      const out = emptyBitset(n);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        if (v === 0) continue;
        let o = 0;
        const base = w << 5;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = base + (31 - Math.clz32(t));
          const xv = x[i] as number;
          const yv = y[i] as number;
          // Bounding-box prefilter (also rejects NaN) before the winding test.
          if (!(xv >= minX && xv <= maxX && yv >= minY && yv <= maxY)) continue;
          if (inPolygon(poly, xv, yv)) o |= t;
        }
        out[w] = o;
      }
      return { regions: { in: out } };
    }
    case 'ellipse': {
      if (!y) throw new Error('Ellipse gate needs two dimensions');
      const inv = invert([
        [geometry.cov[0][0], geometry.cov[0][1]],
        [geometry.cov[1][0], geometry.cov[1][1]],
      ]);
      const [mx, my] = geometry.mean;
      const i00 = inv[0]![0] as number;
      const i01 = inv[0]![1] as number;
      const i10 = inv[1]![0] as number;
      const i11 = inv[1]![1] as number;
      const d2 = geometry.d2;
      const out = emptyBitset(n);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        if (v === 0) continue;
        let o = 0;
        const base = w << 5;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = base + (31 - Math.clz32(t));
          const dx = (x[i] as number) - mx;
          const dy = (y[i] as number) - my;
          // inEllipsoid's accumulation order, Σ_j (Σ_i v_i·inv[i][j])·v_j; NaN → outside.
          const s = (dx * i00 + dy * i10) * dx + (dx * i01 + dy * i11) * dy;
          if (s <= d2) o |= t;
        }
        out[w] = o;
      }
      return { regions: { in: out } };
    }
    case 'quadrant': {
      if (!y) throw new Error('Quadrant gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const q1 = emptyBitset(n);
      const q2 = emptyBitset(n);
      const q3 = emptyBitset(n);
      const q4 = emptyBitset(n);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        if (v === 0) continue;
        let o1 = 0;
        let o2 = 0;
        let o3 = 0;
        let o4 = 0;
        const base = w << 5;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = base + (31 - Math.clz32(t));
          const xv = x[i] as number;
          const yv = y[i] as number;
          if (Number.isNaN(xv) || Number.isNaN(yv)) continue;
          // Gating-ML quadrant: [−∞, c) and [c, +∞) on each divider.
          if (yv >= cy) {
            if (xv >= cx) o2 |= t;
            else o1 |= t;
          } else if (xv >= cx) o3 |= t;
          else o4 |= t;
        }
        q1[w] = o1;
        q2[w] = o2;
        q3[w] = o3;
        q4[w] = o4;
      }
      return { regions: { Q1: q1, Q2: q2, Q3: q3, Q4: q4 } };
    }
    case 'spider': {
      if (!y) throw new Error('Spider gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const arms = geometry.arms;
      const q = [emptyBitset(n), emptyBitset(n), emptyBitset(n), emptyBitset(n)] as const;
      const o = new Int32Array(4);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        if (v === 0) continue;
        o.fill(0);
        const base = w << 5;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = base + (31 - Math.clz32(t));
          const r = spiderRegion(cx, cy, arms, x[i] as number, y[i] as number);
          if (r !== 0) o[r - 1] = (o[r - 1] as number) | t;
        }
        for (let k = 0; k < 4; k++) (q[k] as Bitset)[w] = o[k] as number;
      }
      return { regions: { Q1: q[0], Q2: q[1], Q3: q[2], Q4: q[3] } };
    }
  }
}

/** Quadrant gate centre → spider arms that reproduce it exactly (axis-aligned). */
export function spiderFromQuadrant(
  center: readonly [number, number],
  armLength: number,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [cx, cy] = center;
  return [
    [cx, cy + armLength],
    [cx + armLength, cy],
    [cx, cy - armLength],
    [cx - armLength, cy],
  ];
}
