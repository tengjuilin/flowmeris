import {
  type Gate,
  type GateDim,
  type Geometry,
  type Group,
  ROOT_POPULATION_ID,
  type Transform,
  type Workspace,
  effectiveGeometry,
  populationsOfGate,
} from '@flowmeris/model';

/**
 * Gating-ML 2.0 export (method M-EXPORT-GML).
 *
 * Population ids become Gating-ML gate/quadrant ids, so parent references
 * follow the population tree. Spider gates have no Gating-ML equivalent and
 * are written as four PolygonGates (one per region; the outer vertices lie far
 * outside any plausible data range) plus a Flowmeris extension element that
 * preserves the exact definition for re-import.
 */

const NS =
  'xmlns:gating="http://www.isac-net.org/std/Gating-ML/v2.0/gating" ' +
  'xmlns:transforms="http://www.isac-net.org/std/Gating-ML/v2.0/transformations" ' +
  'xmlns:data-type="http://www.isac-net.org/std/Gating-ML/v2.0/datatypes" ' +
  'xmlns:flowmeris="https://flowmeris.org/ns/gating-ext/1"';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function num(v: number): string {
  return String(v);
}

function transformXml(id: string, t: Transform): string {
  const attrs = Object.entries(t)
    .filter(([k]) => k !== 'kind')
    .map(([k, v]) => `transforms:${k}="${num(v as number)}"`)
    .join(' ');
  return `  <transforms:transformation transforms:id="${esc(id)}">\n    <transforms:${t.kind} ${attrs} />\n  </transforms:transformation>\n`;
}

export interface GmlExportOptions {
  /** Export the effective gates for this sample (template + its overrides). */
  sampleId?: string;
  appVersion: string;
}

export function exportGatingML(ws: Workspace, g: Group, opts: GmlExportOptions): string {
  const t = g.template;
  const usedTransforms = new Set<string>();
  const compRef = (d: GateDim): string => {
    if (d.comp === 'uncompensated' || g.compensation.mode === 'none') return 'uncompensated';
    if (g.compensation.mode === 'per-sample-keyword') return 'FCS';
    return `comp_${g.compensation.matrixId}`;
  };
  const dimAttrs = (d: GateDim) => {
    if (d.transform) usedTransforms.add(d.transform);
    return `gating:compensation-ref="${esc(compRef(d))}"${d.transform ? ` gating:transformation-ref="${esc(d.transform)}"` : ''}`;
  };
  const fcsDim = (d: GateDim) => `<data-type:fcs-dimension data-type:name="${esc(d.channel)}" />`;
  const parentAttr = (gate: Gate) =>
    gate.parentPop === ROOT_POPULATION_ID ? '' : ` gating:parent_id="${esc(gate.parentPop)}"`;
  const geomOf = (gate: Gate): Geometry =>
    opts.sampleId ? effectiveGeometry(g, gate.id, opts.sampleId) : gate.geometry;

  let body = '';
  for (const gate of Object.values(t.gates)) {
    const pops = populationsOfGate(t, gate.id);
    const geom = geomOf(gate);
    const name = (id: string) => esc(t.populations[id]?.name ?? id);
    switch (geom.kind) {
      case 'rect': {
        const pop = pops[0]!;
        body += `  <gating:RectangleGate gating:id="${esc(pop.id)}"${parentAttr(gate)}>\n`;
        body += `    <data-type:custom_info><flowmeris:name>${name(pop.id)}</flowmeris:name></data-type:custom_info>\n`;
        gate.dims.forEach((d, i) => {
          const mn = geom.min[i];
          const mx = geom.max[i];
          body += `    <gating:dimension ${dimAttrs(d)}${mn !== null && mn !== undefined ? ` gating:min="${num(mn)}"` : ''}${mx !== null && mx !== undefined ? ` gating:max="${num(mx)}"` : ''}>${fcsDim(d)}</gating:dimension>\n`;
        });
        body += '  </gating:RectangleGate>\n';
        break;
      }
      case 'polygon': {
        const pop = pops[0]!;
        body += `  <gating:PolygonGate gating:id="${esc(pop.id)}"${parentAttr(gate)}>\n`;
        body += `    <data-type:custom_info><flowmeris:name>${name(pop.id)}</flowmeris:name></data-type:custom_info>\n`;
        for (const d of gate.dims)
          body += `    <gating:dimension ${dimAttrs(d)}>${fcsDim(d)}</gating:dimension>\n`;
        for (const [x, y] of geom.vertices)
          body += `    <gating:vertex><gating:coordinate data-type:value="${num(x)}" /><gating:coordinate data-type:value="${num(y)}" /></gating:vertex>\n`;
        body += '  </gating:PolygonGate>\n';
        break;
      }
      case 'ellipse': {
        const pop = pops[0]!;
        body += `  <gating:EllipsoidGate gating:id="${esc(pop.id)}"${parentAttr(gate)}>\n`;
        body += `    <data-type:custom_info><flowmeris:name>${name(pop.id)}</flowmeris:name></data-type:custom_info>\n`;
        for (const d of gate.dims)
          body += `    <gating:dimension ${dimAttrs(d)}>${fcsDim(d)}</gating:dimension>\n`;
        body += `    <gating:mean><gating:coordinate data-type:value="${num(geom.mean[0])}" /><gating:coordinate data-type:value="${num(geom.mean[1])}" /></gating:mean>\n`;
        body += '    <gating:covarianceMatrix>\n';
        for (const row of geom.cov)
          body += `      <gating:row><gating:entry data-type:value="${num(row[0])}" /><gating:entry data-type:value="${num(row[1])}" /></gating:row>\n`;
        body += '    </gating:covarianceMatrix>\n';
        body += `    <gating:distanceSquare data-type:value="${num(geom.d2)}" />\n`;
        body += '  </gating:EllipsoidGate>\n';
        break;
      }
      case 'quadrant': {
        const [dx, dy] = gate.dims as [GateDim, GateDim];
        body += `  <gating:QuadrantGate gating:id="${esc(gate.id)}"${parentAttr(gate)}>\n`;
        body += `    <gating:divider gating:id="${esc(gate.id)}_x" ${dimAttrs(dx)}>${fcsDim(dx)}<gating:value>${num(geom.center[0])}</gating:value></gating:divider>\n`;
        body += `    <gating:divider gating:id="${esc(gate.id)}_y" ${dimAttrs(dy)}>${fcsDim(dy)}<gating:value>${num(geom.center[1])}</gating:value></gating:divider>\n`;
        const loc = { lo: (c: number) => c - 1, hi: (c: number) => c + 1 };
        for (const p of pops) {
          const xp = p.region === 'Q2' || p.region === 'Q3';
          const yp = p.region === 'Q1' || p.region === 'Q2';
          body += `    <gating:Quadrant gating:id="${esc(p.id)}">\n`;
          body += `      <data-type:custom_info><flowmeris:name>${name(p.id)}</flowmeris:name></data-type:custom_info>\n`;
          body += `      <gating:position gating:divider_ref="${esc(gate.id)}_x" gating:location="${num(xp ? loc.hi(geom.center[0]) : loc.lo(geom.center[0]))}" />\n`;
          body += `      <gating:position gating:divider_ref="${esc(gate.id)}_y" gating:location="${num(yp ? loc.hi(geom.center[1]) : loc.lo(geom.center[1]))}" />\n`;
          body += '    </gating:Quadrant>\n';
        }
        body += '  </gating:QuadrantGate>\n';
        break;
      }
      case 'spider': {
        const [cx, cy] = geom.center;
        const far = 1e9;
        const ang = (p: readonly [number, number]) => Math.atan2(p[1] - cy, p[0] - cx);
        const [up, right, down, left] = geom.arms;
        // region → (start arm, end arm) walking counter-clockwise
        const sectors: Record<string, [readonly [number, number], readonly [number, number]]> = {
          Q2: [right, up],
          Q1: [up, left],
          Q4: [left, down],
          Q3: [down, right],
        };
        for (const p of pops) {
          const [a, b] = sectors[p.region]!;
          const a0 = ang(a);
          let a1 = ang(b);
          while (a1 <= a0) a1 += 2 * Math.PI;
          const verts: [number, number][] = [[cx, cy]];
          const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 8)));
          for (let k = 0; k <= steps; k++) {
            const th = a0 + ((a1 - a0) * k) / steps;
            verts.push([cx + far * Math.cos(th), cy + far * Math.sin(th)]);
          }
          body += `  <gating:PolygonGate gating:id="${esc(p.id)}"${parentAttr(gate)}>\n`;
          body += `    <data-type:custom_info><flowmeris:name>${name(p.id)}</flowmeris:name><flowmeris:spider gate="${esc(gate.id)}" region="${p.region}" center="${cx},${cy}" arms="${geom.arms.map((q) => q.join(',')).join(';')}" /></data-type:custom_info>\n`;
          for (const d of gate.dims)
            body += `    <gating:dimension ${dimAttrs(d)}>${fcsDim(d)}</gating:dimension>\n`;
          for (const [x, y] of verts)
            body += `    <gating:vertex><gating:coordinate data-type:value="${num(x)}" /><gating:coordinate data-type:value="${num(y)}" /></gating:vertex>\n`;
          body += '  </gating:PolygonGate>\n';
        }
        break;
      }
    }
  }

  let head = '';
  for (const id of usedTransforms) {
    const tr = ws.transforms[id];
    if (tr) head += transformXml(id, tr);
  }
  if (g.compensation.mode === 'matrix') {
    const m = ws.compMatrices[g.compensation.matrixId];
    if (m) {
      head += `  <transforms:spectrumMatrix transforms:id="comp_${esc(m.id)}">\n    <transforms:fluorochromes>${m.detectors.map((d) => `<data-type:fcs-dimension data-type:name="${esc(d)}" />`).join('')}</transforms:fluorochromes>\n    <transforms:detectors>${m.detectors.map((d) => `<data-type:fcs-dimension data-type:name="${esc(d)}" />`).join('')}</transforms:detectors>\n`;
      for (const row of m.spill)
        head += `    <transforms:spectrum>${row.map((v) => `<transforms:coefficient transforms:value="${num(v)}" />`).join('')}</transforms:spectrum>\n`;
      head += '  </transforms:spectrumMatrix>\n';
    }
  }
  const info = `  <data-type:custom_info>Exported by Flowmeris ${esc(opts.appVersion)}; group "${esc(g.name)}"${opts.sampleId ? `; effective gates for sample ${esc(ws.samples[opts.sampleId]?.fileName ?? opts.sampleId)} (sha256 ${ws.samples[opts.sampleId]?.sha256 ?? ''})` : '; group template'}.</data-type:custom_info>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gating:Gating-ML ${NS}>\n${info}${head}${body}</gating:Gating-ML>\n`;
}
