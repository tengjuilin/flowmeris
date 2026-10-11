import {
  type SpilloverMatrix,
  compensateChannel,
  findSpillover,
  invert,
  makeCompensator,
} from '@flowmeris/compensation';
import { inEllipsoid, inPolygon, inRange, preparePolygon } from '@flowmeris/gating';
import { makeScale } from '@flowmeris/transforms';
import { GatingMLError, type GmlDimension, type GmlDocument, type GmlGate } from './parse.ts';

/**
 * Reference evaluator for Gating-ML 2.0 documents (n-dimensional rectangle,
 * polygon, ellipsoid, quadrant and Boolean gates; flin/flog/fasinh/logicle/
 * hyperlog/fratio transforms; FCS / uncompensated / spectrumMatrix
 * compensation). It is built from the same predicate, transform and
 * compensation kernels flowmeris uses for analysis, so passing the ISAC
 * compliance suite validates those kernels.
 */

export interface GmlSample {
  /** $PnN names. */
  channels: string[];
  /** Linearized (scaled) channel values. */
  columns: Float64Array[];
  /** FCS keywords (for compensation-ref="FCS"). */
  keywords: Record<string, string>;
  eventCount: number;
}

export type Membership = Uint8Array;

export function evaluateGatingML(doc: GmlDocument, sample: GmlSample): Map<string, Membership> {
  const n = sample.eventCount;
  const results = new Map<string, Membership>();
  const own = new Map<string, Membership>(); // before parent intersection
  const dimCache = new Map<string, Float64Array>();
  const compCache = new Map<string, Float64Array[]>();

  const channelIndex = (name: string) => {
    const i = sample.channels.indexOf(name);
    if (i < 0) throw new GatingMLError(`Channel ${name} not found in sample`);
    return i;
  };

  const compensated = (ref: string): { columns: Float64Array[]; names: string[] } => {
    if (ref === 'uncompensated') return { columns: sample.columns, names: sample.channels };
    let matrix: SpilloverMatrix | null = null;
    let names = sample.channels;
    if (ref === 'FCS') {
      matrix = findSpillover(sample.keywords)?.matrix ?? null;
      if (!matrix) return { columns: sample.columns, names: sample.channels };
    } else {
      const m = doc.matrices.get(ref);
      if (!m) throw new GatingMLError(`Unknown compensation-ref ${ref}`);
      matrix = { detectors: m.detectors, spill: m.spill };
      // Compensated columns are addressed by fluorochrome name.
      names = sample.channels.map((c) => {
        const k = m.detectors.indexOf(c);
        return k >= 0 ? (m.fluorochromes[k] ?? c) : c;
      });
    }
    let cols = compCache.get(ref);
    if (!cols) {
      const comp = makeCompensator(matrix, sample.channels);
      cols = sample.columns.map((col, i) => compensateChannel(comp, sample.columns, i) ?? col);
      compCache.set(ref, cols);
    }
    return { columns: cols, names };
  };

  const dimension = (d: GmlDimension): Float64Array => {
    const key = JSON.stringify(d);
    const hit = dimCache.get(key);
    if (hit) return hit;
    const { columns, names } = compensated(d.comp);
    let values: Float64Array;
    if (d.name !== undefined) {
      let i = names.indexOf(d.name);
      if (i < 0) i = channelIndex(d.name);
      values = columns[i] as Float64Array;
    } else if (d.newDimension !== undefined) {
      const t = doc.transforms.get(d.newDimension);
      if (!t || t.kind !== 'fratio')
        throw new GatingMLError(`new-dimension ${d.newDimension} must be an fratio`);
      const a = columns[
        names.indexOf(t.dims[0]) >= 0 ? names.indexOf(t.dims[0]) : channelIndex(t.dims[0])
      ] as Float64Array;
      const b = columns[
        names.indexOf(t.dims[1]) >= 0 ? names.indexOf(t.dims[1]) : channelIndex(t.dims[1])
      ] as Float64Array;
      values = new Float64Array(n);
      for (let e = 0; e < n; e++) values[e] = (t.A * ((a[e] as number) - t.B)) / ((b[e] as number) - t.C);
    } else throw new GatingMLError('Invalid dimension');
    if (d.transform) {
      const t = doc.transforms.get(d.transform);
      if (!t) throw new GatingMLError(`Unknown transformation-ref ${d.transform}`);
      if (t.kind === 'fratio') throw new GatingMLError('fratio cannot be used as a scale transformation');
      values = makeScale(t).applyArray(values);
    }
    dimCache.set(key, values);
    return values;
  };

  const evalOwn = (g: GmlGate): Map<string, Membership> => {
    const out = new Map<string, Membership>();
    switch (g.kind) {
      case 'rect': {
        const cols = g.dims.map(dimension);
        const m = new Uint8Array(n);
        for (let e = 0; e < n; e++) {
          let ok = 1;
          for (let k = 0; k < cols.length; k++) {
            const d = g.dims[k] as GmlDimension;
            if (!inRange((cols[k] as Float64Array)[e] as number, d.min ?? null, d.max ?? null)) {
              ok = 0;
              break;
            }
          }
          m[e] = ok;
        }
        out.set(g.id, m);
        break;
      }
      case 'polygon': {
        const [x, y] = g.dims.map(dimension) as [Float64Array, Float64Array];
        const p = preparePolygon(g.vertices);
        const m = new Uint8Array(n);
        for (let e = 0; e < n; e++) m[e] = inPolygon(p, x[e] as number, y[e] as number) ? 1 : 0;
        out.set(g.id, m);
        break;
      }
      case 'ellipsoid': {
        const cols = g.dims.map(dimension);
        const inv = invert(g.cov);
        const v = new Float64Array(cols.length);
        const m = new Uint8Array(n);
        for (let e = 0; e < n; e++) {
          let nan = false;
          for (let k = 0; k < cols.length; k++) {
            v[k] = (cols[k] as Float64Array)[e] as number;
            if (Number.isNaN(v[k])) nan = true;
          }
          m[e] = !nan && inEllipsoid(v, g.mean, inv, g.d2) ? 1 : 0;
        }
        out.set(g.id, m);
        break;
      }
      case 'quadrant': {
        const divCols = new Map(g.dividers.map((d) => [d.id, { values: d.values, col: dimension(d.dim) }]));
        for (const q of g.quadrants) {
          const m = new Uint8Array(n).fill(1);
          for (const pos of q.positions) {
            const div = divCols.get(pos.divider);
            if (!div) throw new GatingMLError(`Quadrant ${q.id} references unknown divider ${pos.divider}`);
            let lo: number | null = null;
            let hi: number | null = null;
            for (const v of div.values) {
              if (v <= pos.location) lo = v;
              else if (hi === null) hi = v;
            }
            for (let e = 0; e < n; e++) if (m[e] && !inRange(div.col[e] as number, lo, hi)) m[e] = 0;
          }
          out.set(q.id, m);
        }
        break;
      }
      case 'boolean': {
        const operands = g.refs.map((r) => {
          const res = resolve(r.ref);
          if (!r.complement) return res;
          const c = new Uint8Array(n);
          for (let e = 0; e < n; e++) c[e] = res[e] ? 0 : 1;
          return c;
        });
        const m = new Uint8Array(n);
        if (g.op === 'not') {
          if (operands.length !== 1) throw new GatingMLError('NOT gate takes exactly one operand');
          const a = operands[0] as Uint8Array;
          for (let e = 0; e < n; e++) m[e] = a[e] ? 0 : 1;
        } else if (g.op === 'and') {
          m.fill(1);
          for (const a of operands) for (let e = 0; e < n; e++) m[e] = (m[e] as number) & (a[e] as number);
        } else {
          for (const a of operands) for (let e = 0; e < n; e++) m[e] = (m[e] as number) | (a[e] as number);
        }
        out.set(g.id, m);
        break;
      }
    }
    return out;
  };

  // Map quadrant ids → owning gate id.
  const owner = new Map<string, string>();
  for (const g of doc.gates.values()) {
    if (g.kind === 'quadrant') for (const q of g.quadrants) owner.set(q.id, g.id);
    else owner.set(g.id, g.id);
  }
  const visiting = new Set<string>();

  function resolve(id: string): Membership {
    const done = results.get(id);
    if (done) return done;
    const gid = owner.get(id);
    if (!gid) throw new GatingMLError(`Reference to unknown gate ${id}`);
    if (visiting.has(gid)) throw new GatingMLError(`Cyclic gate reference at ${gid}`);
    visiting.add(gid);
    const g = doc.gates.get(gid) as GmlGate;
    const parent = g.parent ? resolve(g.parent) : null;
    for (const [rid, m] of evalOwn(g)) {
      own.set(rid, m);
      if (parent) for (let e = 0; e < n; e++) m[e] = (m[e] as number) & (parent[e] as number);
      results.set(rid, m);
    }
    visiting.delete(gid);
    const r = results.get(id);
    if (!r) throw new GatingMLError(`Gate ${id} produced no result`);
    return r;
  }

  for (const id of owner.keys()) resolve(id);
  return results;
}
