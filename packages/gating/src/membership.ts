import { invert } from '@flowmeris/compensation';
import type { Geometry, Region } from '@flowmeris/model';
import { type Bitset, emptyBitset, fullBitset } from './bitset.ts';
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
 *
 * Each case walks the parent's set bits word by word inline (rather than through
 * forEachSet, whose callback site would be megamorphic across gate kinds) and
 * writes each output word once.
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
      const min = geometry.min;
      const max = geometry.max;
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        let acc = 0;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = (w << 5) + (31 - Math.clz32(t));
          let inside = true;
          for (let k = 0; k < d; k++) {
            if (!inRange((dims[k] as ArrayLike<number>)[i] as number, min[k] ?? null, max[k] ?? null)) {
              inside = false;
              break;
            }
          }
          if (inside) acc |= t;
        }
        out[w] = acc;
      }
      return { regions: { in: out } };
    }
    case 'polygon': {
      if (!y) throw new Error('Polygon gate needs two dimensions');
      const poly = preparePolygon(geometry.vertices);
      const out = emptyBitset(n);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        let acc = 0;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = (w << 5) + (31 - Math.clz32(t));
          if (inPolygon(poly, x[i] as number, y[i] as number)) acc |= t;
        }
        out[w] = acc;
      }
      return { regions: { in: out } };
    }
    case 'ellipse': {
      if (!y) throw new Error('Ellipse gate needs two dimensions');
      const inv = invert([
        [geometry.cov[0][0], geometry.cov[0][1]],
        [geometry.cov[1][0], geometry.cov[1][1]],
      ]);
      const out = emptyBitset(n);
      const pt = new Float64Array(2);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        let acc = 0;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = (w << 5) + (31 - Math.clz32(t));
          pt[0] = x[i] as number;
          pt[1] = y[i] as number;
          if (inEllipsoid(pt, geometry.mean, inv, geometry.d2)) acc |= t;
        }
        out[w] = acc;
      }
      return { regions: { in: out } };
    }
    case 'quadrant': {
      if (!y) throw new Error('Quadrant gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const q = [emptyBitset(n), emptyBitset(n), emptyBitset(n), emptyBitset(n)] as const;
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        let a1 = 0;
        let a2 = 0;
        let a3 = 0;
        let a4 = 0;
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = (w << 5) + (31 - Math.clz32(t));
          const xv = x[i] as number;
          const yv = y[i] as number;
          if (Number.isNaN(xv) || Number.isNaN(yv)) continue;
          // Gating-ML quadrant: [−∞, c) and [c, +∞) on each divider.
          if (yv >= cy) {
            if (xv >= cx) a2 |= t;
            else a1 |= t;
          } else if (xv >= cx) a3 |= t;
          else a4 |= t;
        }
        q[0][w] = a1;
        q[1][w] = a2;
        q[2][w] = a3;
        q[3][w] = a4;
      }
      return { regions: { Q1: q[0], Q2: q[1], Q3: q[2], Q4: q[3] } };
    }
    case 'spider': {
      if (!y) throw new Error('Spider gate needs two dimensions');
      const [cx, cy] = geometry.center;
      const q = [emptyBitset(n), emptyBitset(n), emptyBitset(n), emptyBitset(n)] as const;
      const acc = new Int32Array(4);
      for (let w = 0; w < words; w++) {
        let v = par[w] as number;
        acc.fill(0);
        while (v !== 0) {
          const t = v & -v;
          v ^= t;
          const i = (w << 5) + (31 - Math.clz32(t));
          const r = spiderRegion(cx, cy, geometry.arms, x[i] as number, y[i] as number);
          if (r !== 0) acc[r - 1] = (acc[r - 1] as number) | t;
        }
        for (let k = 0; k < 4; k++) q[k as 0][w] = acc[k] as number;
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
