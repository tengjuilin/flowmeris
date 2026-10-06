import { invert } from '@flowmeris/compensation';
import type { Geometry, Region } from '@flowmeris/model';
import { type Bitset, emptyBitset, forEachSet, fullBitset } from './bitset.ts';
import { inEllipsoid, inPolygon, inRange, preparePolygon, spiderRegion } from './geometry.ts';

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
 */
export function evaluateGate(
  geometry: Geometry,
  dims: ArrayLike<number>[],
  n: number,
  parent: Bitset | null,
): GateResult {
  const par = parent ?? fullBitset(n);
  const x = dims[0] as ArrayLike<number>;
  const y = dims[1];
  switch (geometry.kind) {
    case 'rect': {
      const out = emptyBitset(n);
      const d = dims.length;
      const min = geometry.min;
      const max = geometry.max;
      forEachSet(par, (i) => {
        for (let k = 0; k < d; k++) {
          if (!inRange((dims[k] as ArrayLike<number>)[i] as number, min[k] ?? null, max[k] ?? null)) return;
        }
        out[i >>> 5] = (out[i >>> 5] as number) | (1 << (i & 31));
      });
      return { regions: { in: out } };
    }
    case 'polygon': {
      if (!y) throw new Error('Polygon gate needs two dimensions');
      const poly = preparePolygon(geometry.vertices);
      const out = emptyBitset(n);
      forEachSet(par, (i) => {
        if (inPolygon(poly, x[i] as number, y[i] as number))
          out[i >>> 5] = (out[i >>> 5] as number) | (1 << (i & 31));
      });
      return { regions: { in: out } };
    }
    case 'ellipse': {
      if (!y) throw new Error('Ellipse gate needs two dimensions');
      const inv = invert([
        [geometry.cov[0][0], geometry.cov[0][1]],
        [geometry.cov[1][0], geometry.cov[1][1]],
      ]);
      const out = emptyBitset(n);
      const v = new Float64Array(2);
      forEachSet(par, (i) => {
        v[0] = x[i] as number;
        v[1] = y[i] as number;
        if (inEllipsoid(v, geometry.mean, inv, geometry.d2))
          out[i >>> 5] = (out[i >>> 5] as number) | (1 << (i & 31));
      });
      return { regions: { in: out } };
    }
    case 'quadrant': {
      if (!y) throw new Error('Quadrant gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const q = [emptyBitset(n), emptyBitset(n), emptyBitset(n), emptyBitset(n)];
      forEachSet(par, (i) => {
        const xv = x[i] as number;
        const yv = y[i] as number;
        if (Number.isNaN(xv) || Number.isNaN(yv)) return;
        // Gating-ML quadrant: [−∞, c) and [c, +∞) on each divider.
        const xp = xv >= cx;
        const yp = yv >= cy;
        const k = yp ? (xp ? 1 : 0) : xp ? 2 : 3;
        const b = q[k] as Bitset;
        b[i >>> 5] = (b[i >>> 5] as number) | (1 << (i & 31));
      });
      return { regions: { Q1: q[0], Q2: q[1], Q3: q[2], Q4: q[3] } };
    }
    case 'spider': {
      if (!y) throw new Error('Spider gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const q = [emptyBitset(n), emptyBitset(n), emptyBitset(n), emptyBitset(n)];
      forEachSet(par, (i) => {
        const r = spiderRegion(cx, cy, geometry.arms, x[i] as number, y[i] as number);
        if (r === 0) return;
        const b = q[r - 1] as Bitset;
        b[i >>> 5] = (b[i >>> 5] as number) | (1 << (i & 31));
      });
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
