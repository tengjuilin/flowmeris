import { type ComponentType, type ReactNode, Suspense, lazy } from 'react';
import { GateExportCard, GateToolbar, Inspector, PlotPanel, RefPlots } from '../features/gate/index.ts';
import { PlotGridView } from '../features/grid/index.ts';
import { TilesView } from '../features/tiles/index.ts';
import { PopulationTree } from '../features/tree/index.ts';
import { drill } from '../state/commands/plots.ts';
import type { View, ViewPrefs } from '../state/store.ts';

// The plot views (Gate, Plot grid, Tiles) are in the main bundle; the other views and their settings
// panels are loaded when first shown, and in the background once the page is idle, so a tab opens at once.
const load = {
  charts: () => import('../features/charts/index.ts'),
  compensation: () => import('../features/compensation/index.ts'),
  metadata: () => import('../features/metadata/index.ts'),
  path: () => import('../features/path/index.ts'),
  ridge: () => import('../features/ridge/index.ts'),
  samples: () => import('../features/samples/index.ts'),
  stats: () => import('../features/stats/index.ts'),
};

/** Component `name` of a module loaded on demand. */
function lazyPart<M, K extends keyof M>(from: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await from())[name] as ComponentType }));
}

const ChartsView = lazyPart(load.charts, 'ChartsView');
const ChartInspector = lazyPart(load.charts, 'ChartInspector');
const CompensationView = lazyPart(load.compensation, 'CompensationView');
const MetadataView = lazyPart(load.metadata, 'MetadataView');
const MetadataInspector = lazyPart(load.metadata, 'MetadataInspector');
const GatingPathView = lazyPart(load.path, 'GatingPathView');
const RidgeView = lazyPart(load.ridge, 'RidgeView');
const RidgeExportCard = lazyPart(load.ridge, 'RidgeExportCard');
const RidgeCombinePanel = lazyPart(load.ridge, 'RidgeCombinePanel');
const RidgeInspector = lazyPart(load.ridge, 'RidgeInspector');
const SamplesView = lazyPart(load.samples, 'SamplesView');
const StatsView = lazyPart(load.stats, 'StatsView');
const StatsInspector = lazyPart(load.stats, 'StatsInspector');

/** A view loaded on demand: nothing until its code arrives. */
const later = (view: ReactNode) => <Suspense fallback={null}>{view}</Suspense>;
/** A settings panel loaded on demand: its empty frame until its code arrives, so the view keeps its width. */
const laterPanel = (panel: ReactNode) => (
  <Suspense fallback={<aside className="inspector insp-panel" />}>{panel}</Suspense>
);

if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  const preload = () => {
    for (const f of Object.values(load)) f().catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 5000 });
  else setTimeout(preload, 2000);
}

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
    Main: () => later(<MetadataView />),
    Panel: () => laterPanel(<MetadataInspector />),
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
  path: { label: 'Gating path', Main: () => later(<GatingPathView />) },
  stats: {
    label: 'Statistics',
    Main: () => later(<StatsView />),
    Panel: () => laterPanel(<StatsInspector />),
  },
  ridge: {
    label: 'Ridge',
    Main: () =>
      later(
        <div className="plot-layout">
          <RidgeView />
          <div className="plot-side">
            <RidgeExportCard />
            <PopulationTree />
            <RidgeCombinePanel />
          </div>
        </div>,
      ),
    Panel: () => laterPanel(<RidgeInspector />),
  },
  charts: {
    label: 'Charts',
    Main: () => later(<ChartsView />),
    Panel: () => laterPanel(<ChartInspector />),
  },
  compensation: { label: 'Compensation', Main: () => later(<CompensationView />) },
  samples: { label: 'Samples', Main: () => later(<SamplesView />) },
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
