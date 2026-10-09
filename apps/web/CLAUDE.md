# apps/web: notes for coding agents

The React 18 app (Vite). All analysis runs in a pool of Web Workers. The UI keeps the workspace (a JSON
document, `@flowmeris/model` `Workspace`) in one zustand store with patch-based undo.

The layout below is being migrated to feature folders (ADR-0008); this file describes the state of the
code now. Update it when the layout changes.

## Where things are

| Path | Contents |
|---|---|
| `src/App.tsx` | shell: header, workspace open/save, tab bar, view switching, hotkeys, drop-to-ingest, overlays |
| `src/state/store.ts` | the store: `ws` (workspace), `ui` (selection, view, per-view settings, status), undo history, navigation |
| `src/state/persist.ts` | IndexedDB autosave of `ws` (ring of 20 snapshots) |
| `src/engine-client/pool.ts` | `pool`, the worker pool (ADR-0003): request queue, cancellation, client cache |
| `src/workers/compute.worker.ts` | worker side: wraps `@flowmeris/engine` behind Comlink (`ComputeApi`) |
| `src/lib/` | pure helpers, tested in Node (`*.test.ts`). `analysis`, `ingest`, `statsTable` and `exportPlot` still import the store or pool; they are listed in `.dependency-cruiser-known-violations.json` and are to be split |
| `src/components/` | views and inspectors (see below) |
| `src/styles.css` | all CSS, one global file |

Views (`ui.view`, tab order in `VIEWS` in `App.tsx`). The view and inspector are chosen by separate
conditionals in `App.tsx`:

| `ui.view` | View component | Settings panel |
|---|---|---|
| `metadata` | `MetadataView` | `MetadataInspector` (toggled by `ui.metaSettings`) |
| `gate` | `PlotPanel` → `PlotCanvas`, plus `PopulationTree` and `RefPlots` | `Inspector` from `GateInspector.tsx` |
| `plot` (Plot grid) | `PlotGridView` | `Inspector target="grid"` (toggled by `ui.gridSettings`) |
| `tiles` | `TilesView` in `GroupViews.tsx` | `Inspector target="tiles"` (toggled by `ui.tilesSettings`) |
| `path` | `GatingPathView` | – |
| `stats` | `StatsView` | `StatsInspector` (in `StatsView.tsx`) |
| `ridge` | `RidgeView` in `GroupViews.tsx`, plus `RidgeCombinePanel` | `RidgeInspector` |
| `charts` | `ChartsView` | `ChartInspector`, rendered by `ChartsView` |
| `compensation` | `CompensationView` | – |
| `samples` | `SamplesView` in `CompensationView.tsx` | – |

Some names do not match what the files hold: `components/Inspector.tsx` is a library of shared
controls (`Section`, `NumInput`, `AxisEditor`, `StyleEditor`, `GateEditor`, icons), and `RidgeInspector.tsx`
also exports shared controls (`TicksEditor`, `FontSelect`, `TextStyleEditor`). Search for a symbol
before assuming where it lives.

## Store rules

- Change the workspace only through `useStore.getState().mutate(label, fn, merge?)`. `fn` receives an
  immer draft. `label` is the undo entry's name. `merge` is a key that folds repeated edits from one
  gesture (a drag, typing) into one undo step within 1 s; it must be unique per gesture. `mutateQuiet`
  changes the workspace without an undo step (for derived data only).
- Helpers whose doc comment says "call inside `mutate`" take a draft (for example `defaultAxis` in
  `lib/defaults.ts`, which can register transforms and axis defaults). Do not call them on the live state.
- `mutate` currently does more than apply `fn`:
  - it carries grid-plot style changes to sibling cells (`lib/gridCarry.ts`);
  - it stamps `modifiedAt`.
- Changing `ui.view` pushes a Back/Forward history entry (subscription at the bottom of `store.ts`).
- The root population's id is `'root'`.
- Statistics-table column keys are strings shared by `lib/statsTable.ts`, `StatsView`, `ChartsView` and
  `@flowmeris/table`: `${popId}|count`, `${popId}|pctParent`, a `StatSpec` id, `var:${variableId}` and
  `sample:name`.

## Worker pool rules

- Plot requests (`raster`, `histogram`, `counts`) take `{ key, signal }`. `key` must identify the result
  completely, typically `plotKey` from `lib/analysis.ts` plus size and colours. Results with the same key
  are shared and cached, so never mutate a result.
- Other methods (`table`, `preview`, `channelValues`, `exportEvents`) are not queued or cached.
- Adding a worker method means editing `packages/engine`, `workers/compute.worker.ts` and
  `engine-client/pool.ts`. Keep the three signatures identical.

## Tests

- Pure logic goes in `src/lib/*.ts` with a colocated `*.test.ts` (Node, vitest project `unit`). When
  logic inside a component needs testing, move it to `lib/` first.
- UI behaviour is covered by Playwright in `/e2e` (`corepack pnpm build && corepack pnpm e2e`). To check a
  change by eye, start the `web` server from `.claude/launch.json`.

## CSS

`src/styles.css` is global with flat, feature-prefixed class names. Theme tokens are at the top, in light
and dark. Mind the shared classes whose names suggest a single feature:
- `ridge-section`, `ridge-tabs`, `ridge-inspector*` and `ridge-samples` style every inspector;
- `tiles-controls` and `tiles-settings` are reused by the grid and path views.

Changing any of them affects all of those views.
