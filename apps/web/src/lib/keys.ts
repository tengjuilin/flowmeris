import {
  type Group,
  type PlotSpec,
  type Workspace,
  effectiveGeometry,
  populationLineage,
} from '@flowmeris/model';

/**
 * Dependency keys of plots and statistics, used as worker-pool cache keys (engine-client/pool.ts):
 * a key must change whenever anything the result depends on changes.
 */

/** A dependency key covering everything a plot/statistic of `popId` on `sampleId` depends on. */
export function lineageKey(ws: Workspace, g: Group, sampleId: string | null, popId: string): string {
  const lineage = populationLineage(g.template, popId);
  const gates = lineage
    .filter((p) => p.gate)
    .map((p) => {
      const gate = g.template.gates[p.gate!]!;
      return [gate.dims, sampleId ? effectiveGeometry(g, gate.id, sampleId) : gate.geometry, p.region];
    });
  const transforms = Object.fromEntries(
    lineage.flatMap((p) =>
      p.gate
        ? g.template.gates[p.gate]!.dims.map((d) => [
            d.transform,
            d.transform ? ws.transforms[d.transform] : null,
          ])
        : [],
    ),
  );
  const comp = g.compensation.mode === 'matrix' ? ws.compMatrices[g.compensation.matrixId] : g.compensation;
  return JSON.stringify([sampleId, gates, transforms, comp]);
}

export function plotKey(ws: Workspace, g: Group, sampleId: string, plot: PlotSpec): string {
  return JSON.stringify([
    lineageKey(ws, g, sampleId, plot.population),
    plot,
    ws.transforms[plot.x.transform],
    plot.y ? ws.transforms[plot.y.transform] : null,
  ]);
}
