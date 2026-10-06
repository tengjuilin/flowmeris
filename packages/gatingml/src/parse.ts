import type { Transform } from '@flowmeris/model';
import { XMLParser } from 'fast-xml-parser';

/**
 * Gating-ML 2.0 reader (Spidlen J. et al. (2015) Cytometry A 87:683–687).
 * Produces a faithful, n-dimensional representation of the document, which
 * `evaluate.ts` can apply to data, and `toTemplate.ts` can map onto flowmeris'
 * (≤ 2-D) gating model where possible.
 */

export type GmlTransform =
  | Transform
  | { kind: 'fratio'; A: number; B: number; C: number; dims: [string, string] };

export interface GmlMatrix {
  id: string;
  fluorochromes: string[];
  detectors: string[];
  /** Row i = fluorochrome i's spectrum across detectors. */
  spill: number[][];
}

export interface GmlDimension {
  /** "uncompensated", "FCS", or a spectrumMatrix id. */
  comp: string;
  /** transformation-ref applied to this dimension, if any. */
  transform?: string;
  /** fcs-dimension name, or undefined for a new-dimension. */
  name?: string;
  /** new-dimension transformation-ref (e.g. an fratio). */
  newDimension?: string;
  min?: number;
  max?: number;
}

interface GmlGateBase {
  id: string;
  parent?: string;
}

export type GmlGate =
  | (GmlGateBase & { kind: 'rect'; dims: GmlDimension[] })
  | (GmlGateBase & { kind: 'polygon'; dims: GmlDimension[]; vertices: [number, number][] })
  | (GmlGateBase & { kind: 'ellipsoid'; dims: GmlDimension[]; mean: number[]; cov: number[][]; d2: number })
  | (GmlGateBase & {
      kind: 'quadrant';
      dividers: { id: string; dim: GmlDimension; values: number[] }[];
      quadrants: { id: string; positions: { divider: string; location: number }[] }[];
    })
  | (GmlGateBase & {
      kind: 'boolean';
      op: 'and' | 'or' | 'not';
      refs: { ref: string; complement: boolean }[];
    });

export interface GmlDocument {
  transforms: Map<string, GmlTransform>;
  matrices: Map<string, GmlMatrix>;
  gates: Map<string, GmlGate>;
  /** Gate ids in document order. */
  order: string[];
}

export class GatingMLError extends Error {}

const ARRAYS = new Set([
  'transformation',
  'spectrumMatrix',
  'RectangleGate',
  'PolygonGate',
  'EllipsoidGate',
  'QuadrantGate',
  'BooleanGate',
  'dimension',
  'vertex',
  'coordinate',
  'row',
  'entry',
  'divider',
  'value',
  'Quadrant',
  'position',
  'gateReference',
  'fcs-dimension',
  'spectrum',
  'coefficient',
]);

type Node = Record<string, unknown>;

function num(v: unknown, what: string): number {
  const x = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(x)) throw new GatingMLError(`Invalid number for ${what}: ${String(v)}`);
  return x;
}

function optNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return num(v, 'attribute');
}

function arr(n: Node | undefined, key: string): Node[] {
  const v = n?.[key];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]) as Node[];
}

function attr(n: Node | undefined, key: string): string | undefined {
  const v = n?.[`@_${key}`];
  return v === undefined ? undefined : String(v);
}

function parseDimension(d: Node): GmlDimension {
  const fcsDim = arr(d, 'fcs-dimension')[0];
  const newDim = (d['new-dimension'] as Node | undefined) ?? undefined;
  const dim: GmlDimension = { comp: attr(d, 'compensation-ref') ?? 'uncompensated' };
  const t = attr(d, 'transformation-ref');
  if (t) dim.transform = t;
  if (fcsDim) dim.name = attr(fcsDim, 'name');
  else if (newDim) dim.newDimension = attr(newDim, 'transformation-ref');
  else throw new GatingMLError('Dimension without fcs-dimension or new-dimension');
  const min = optNum(attr(d, 'min'));
  const max = optNum(attr(d, 'max'));
  if (min !== undefined) dim.min = min;
  if (max !== undefined) dim.max = max;
  return dim;
}

function parseTransform(t: Node): GmlTransform {
  const p = (n: Node, k: string) => num(attr(n, k), k);
  if (t.flin) {
    const n = t.flin as Node;
    return { kind: 'flin', T: p(n, 'T'), A: p(n, 'A') };
  }
  if (t.flog) {
    const n = t.flog as Node;
    return { kind: 'flog', T: p(n, 'T'), M: p(n, 'M') };
  }
  if (t.fasinh) {
    const n = t.fasinh as Node;
    return { kind: 'fasinh', T: p(n, 'T'), M: p(n, 'M'), A: p(n, 'A') };
  }
  if (t.logicle) {
    const n = t.logicle as Node;
    return { kind: 'logicle', T: p(n, 'T'), W: p(n, 'W'), M: p(n, 'M'), A: p(n, 'A') };
  }
  if (t.hyperlog) {
    const n = t.hyperlog as Node;
    return { kind: 'hyperlog', T: p(n, 'T'), W: p(n, 'W'), M: p(n, 'M'), A: p(n, 'A') };
  }
  if (t.fratio) {
    const n = t.fratio as Node;
    const dims = arr(n, 'fcs-dimension').map((d) => attr(d, 'name') ?? '');
    if (dims.length !== 2) throw new GatingMLError('fratio requires two fcs-dimensions');
    return { kind: 'fratio', A: p(n, 'A'), B: p(n, 'B'), C: p(n, 'C'), dims: [dims[0]!, dims[1]!] };
  }
  throw new GatingMLError(
    `Unsupported transformation: ${Object.keys(t)
      .filter((k) => !k.startsWith('@_'))
      .join(', ')}`,
  );
}

export function parseGatingML(xml: string): GmlDocument {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => ARRAYS.has(name),
  });
  const doc = parser.parse(xml) as Node;
  const root = doc['Gating-ML'] as Node | undefined;
  if (!root) throw new GatingMLError('Not a Gating-ML document (missing Gating-ML root element)');

  const transforms = new Map<string, GmlTransform>();
  for (const t of arr(root, 'transformation')) {
    const id = attr(t, 'id');
    if (!id) throw new GatingMLError('transformation without id');
    transforms.set(id, parseTransform(t));
  }

  const matrices = new Map<string, GmlMatrix>();
  for (const m of arr(root, 'spectrumMatrix')) {
    const id = attr(m, 'id');
    if (!id) throw new GatingMLError('spectrumMatrix without id');
    const names = (k: string) => arr(m[k] as Node, 'fcs-dimension').map((d) => attr(d, 'name') ?? '');
    const spill = arr(m, 'spectrum').map((s) =>
      arr(s, 'coefficient').map((c) => num(attr(c, 'value'), 'coefficient')),
    );
    matrices.set(id, { id, fluorochromes: names('fluorochromes'), detectors: names('detectors'), spill });
  }

  const gates = new Map<string, GmlGate>();
  const order: string[] = [];
  const add = (g: GmlGate) => {
    if (gates.has(g.id)) throw new GatingMLError(`Duplicate gate id ${g.id}`);
    gates.set(g.id, g);
    order.push(g.id);
  };
  const base = (n: Node) => {
    const id = attr(n, 'id');
    if (!id) throw new GatingMLError('Gate without id');
    const parent = attr(n, 'parent_id');
    return parent ? { id, parent } : { id };
  };

  for (const g of arr(root, 'RectangleGate'))
    add({ ...base(g), kind: 'rect', dims: arr(g, 'dimension').map(parseDimension) });
  for (const g of arr(root, 'PolygonGate')) {
    const vertices = arr(g, 'vertex').map((v) => {
      const c = arr(v, 'coordinate').map((x) => num(attr(x, 'value'), 'vertex coordinate'));
      if (c.length !== 2) throw new GatingMLError('Polygon vertex must have two coordinates');
      return [c[0]!, c[1]!] as [number, number];
    });
    add({ ...base(g), kind: 'polygon', dims: arr(g, 'dimension').map(parseDimension), vertices });
  }
  for (const g of arr(root, 'EllipsoidGate')) {
    const mean = arr(g.mean as Node, 'coordinate').map((x) => num(attr(x, 'value'), 'mean'));
    const cov = arr(g.covarianceMatrix as Node, 'row').map((r) =>
      arr(r, 'entry').map((e) => num(attr(e, 'value'), 'covariance')),
    );
    const d2 = num(attr(g.distanceSquare as Node, 'value'), 'distanceSquare');
    add({ ...base(g), kind: 'ellipsoid', dims: arr(g, 'dimension').map(parseDimension), mean, cov, d2 });
  }
  for (const g of arr(root, 'QuadrantGate')) {
    const dividers = arr(g, 'divider').map((d) => ({
      id: attr(d, 'id') ?? '',
      dim: parseDimension(d),
      values: arr(d, 'value')
        .map((v) => num(typeof v === 'object' ? (v as Node)['#text'] : v, 'divider value'))
        .sort((a, b) => a - b),
    }));
    const quadrants = arr(g, 'Quadrant').map((q) => ({
      id: attr(q, 'id') ?? '',
      positions: arr(q, 'position').map((p) => ({
        divider: attr(p, 'divider_ref') ?? '',
        location: num(attr(p, 'location'), 'location'),
      })),
    }));
    add({ ...base(g), kind: 'quadrant', dividers, quadrants });
  }
  for (const g of arr(root, 'BooleanGate')) {
    const op = (['and', 'or', 'not'] as const).find((k) => g[k] !== undefined);
    if (!op) throw new GatingMLError(`Boolean gate ${attr(g, 'id')} has no and/or/not`);
    const refs = arr(g[op] as Node, 'gateReference').map((r) => ({
      ref: attr(r, 'ref') ?? '',
      complement: attr(r, 'use-as-complement') === 'true',
    }));
    add({ ...base(g), kind: 'boolean', op, refs });
  }
  return { transforms, matrices, gates, order };
}
