import {
  type Group,
  type PlotSpec,
  type Workspace,
  effectiveGeometry,
  populationLineage,
} from '@flowmeris/model';

/** What a plot reads of the workspace: scales, compensation matrices and the samples' channels. */
export type PlotWorkspace = Pick<Workspace, 'transforms' | 'compMatrices' | 'samples'>;

/**
 * Dependency keys of plots and statistics, used as worker-pool cache keys (engine-client/pool.ts):
 * a key must change whenever anything the result depends on changes.
 */

/** A dependency key covering everything a plot/statistic of `popId` on `sampleId` depends on. */
export function lineageKey(ws: PlotWorkspace, g: Group, sampleId: string | null, popId: string): string {
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

/**
 * The plot as the workers read it: without its id, the settings kept for other channel pairs, and the
 * appearance only the UI draws (figure, contour lines), so editing those keeps the cached events.
 */
export function plotDataSpec(plot: PlotSpec) {
  const { id: _id, styleFollow: _f, stylesByAxes: _s, styleBase: _b, style, ...rest } = plot;
  const { figure: _fig, contourWidth: _cw, contourColor: _cc, ...dataStyle } = style;
  return { ...rest, style: dataStyle };
}

/** A key of what a plot's events depend on apart from its population's lineage: its settings and scales. */
export function plotSpecKey(ws: PlotWorkspace, plot: PlotSpec): string {
  return JSON.stringify(plotSpecParts(ws, plot));
}

function plotSpecParts(ws: PlotWorkspace, plot: PlotSpec) {
  return [
    plotDataSpec(plot),
    ws.transforms[plot.x.transform],
    plot.y ? ws.transforms[plot.y.transform] : null,
    plot.kind === 'pseudocolor-channel' && plot.color ? ws.transforms[plot.color.transform] : null,
  ];
}

export function plotKey(ws: PlotWorkspace, g: Group, sampleId: string, plot: PlotSpec): string {
  return JSON.stringify([lineageKey(ws, g, sampleId, plot.population), ...plotSpecParts(ws, plot)]);
}
