import type { ReactNode } from 'react';
import { ChartsView } from '../features/charts/index.ts';
import { CompensationView } from '../features/compensation/index.ts';
import { GateExportCard, GateToolbar, Inspector, PlotPanel, RefPlots } from '../features/gate/index.ts';
import { PlotGridView } from '../features/grid/index.ts';
import { MetadataInspector, MetadataView } from '../features/metadata/index.ts';
import { GatingPathView } from '../features/path/index.ts';
import { RidgeCombinePanel, RidgeExportCard, RidgeInspector, RidgeView } from '../features/ridge/index.ts';
import { SamplesView } from '../features/samples/index.ts';
import { StatsInspector, StatsView } from '../features/stats/index.ts';
import { TilesView } from '../features/tiles/index.ts';
import { PopulationTree } from '../features/tree/index.ts';
import { drill } from '../state/commands/plots.ts';
import type { View, ViewPrefs } from '../state/store.ts';

/** One tab of the app. */
export interface ViewDef {
  label: string;
  /** The view's content. */
  Main: () => ReactNode;
  /**
   * The view's settings panel. Shown beside the view on wide windows and in a drawer opened by the
   * Settings button on narrow ones, unless `panelFlag` is set: then the view's own toolbar shows and
   * hides it through that preference.
   */
  Panel?: () => ReactNode;
  panelFlag?: keyof Pick<ViewPrefs, 'tilesSettings' | 'gridSettings' | 'metaSettings'>;
  /** Whether the gate tool shortcuts (V, R, E, …) work in this view. */
  toolKeys?: boolean;
  /** Run when the view's tab is clicked, with the population being gated (while a group is open). */
  onOpen?: (popId: string) => void;
}

/** Every view, by id. The tabs follow VIEW_ORDER. */
export const VIEW_DEFS: Record<View, ViewDef> = {
  metadata: {
    label: 'Metadata',
    Main: () => <MetadataView />,
    Panel: () => <MetadataInspector />,
    panelFlag: 'metaSettings',
  },
  gate: {
    label: 'Gate',
    Main: () => (
      <div className="gate-view">
        <GateToolbar />
        <div className="plot-layout">
          <PlotPanel />
          <div className="plot-side">
            <GateExportCard />
            <PopulationTree />
            <RefPlots />
          </div>
        </div>
      </div>
    ),
    Panel: () => <Inspector />,
    toolKeys: true,
    // The Gate tab opens the gated population's plot, making it first if there is none.
    onOpen: drill,
  },
  plot: {
    label: 'Plot',
    Main: () => <PlotGridView />,
    Panel: () => <Inspector key="grid" target="grid" />,
    panelFlag: 'gridSettings',
    toolKeys: true,
  },
  tiles: {
    label: 'Tiles',
    Main: () => <TilesView />,
    Panel: () => <Inspector key="tiles" target="tiles" />,
    panelFlag: 'tilesSettings',
  },
  path: { label: 'Gating path', Main: () => <GatingPathView /> },
  stats: { label: 'Statistics', Main: () => <StatsView />, Panel: () => <StatsInspector /> },
  ridge: {
    label: 'Ridge',
    Main: () => (
      <div className="plot-layout">
        <RidgeView />
        <div className="plot-side">
          <RidgeExportCard />
          <PopulationTree />
          <RidgeCombinePanel />
        </div>
      </div>
    ),
    Panel: () => <RidgeInspector />,
  },
  charts: { label: 'Charts', Main: () => <ChartsView /> },
  compensation: { label: 'Compensation', Main: () => <CompensationView /> },
  samples: { label: 'Samples', Main: () => <SamplesView /> },
};

/** The tabs, left to right. */
export const VIEW_ORDER: View[] = [
  'metadata',
  'gate',
  'plot',
  'tiles',
  'path',
  'stats',
  'ridge',
  'charts',
  'compensation',
  'samples',
];
