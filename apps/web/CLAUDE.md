# apps/web: notes for coding agents

The React 18 app (Vite). All analysis runs in a pool of Web Workers. The UI keeps the workspace (a JSON
document, `@flowmeris/model` `Workspace`) in one zustand store with patch-based undo.

The layout below is being migrated to feature folders (ADR-0008); this file describes the state of the
code now. Update it when the layout changes.

## Where things are

| Path | Contents |
|---|---|
| `src/app/` | the shell: `views.tsx` (VIEW_DEFS: every view's label, content, settings panel, tool keys, tab action; VIEW_ORDER), `App.tsx`, `Header.tsx`, `TabBar.tsx`, `Overlays.tsx`, `useHotkeys.ts`, `useDropIngest.ts` |
| `src/state/store.ts` | the store: `ws` (workspace), `ui` (where the user is and what is selected), `views` (layout preferences), `status` (missing data, loading, toast), undo history, Back/Forward |
| `src/state/prefs.ts` | preferences in browser storage: session view and layout, inspector tabs and sections (`usePanelState`, `useRememberedTab`) |
| `src/state/persist.ts` | IndexedDB autosave of `ws` (ring of 20 snapshots) |
| `src/engine-client/` | `pool.ts`: the worker pool (ADR-0003, ADR-0010), `getPool()`; `scheduler.ts`: its request queue and result cache |
| `src/workers/compute.worker.ts` | worker side: wraps `@flowmeris/engine` behind Comlink (`ComputeApi`) |
| `src/state/commands/` | named store commands: `gates.ts`, `plots.ts` (incl. `drill`), `grid.ts`, `refPlots.ts`, `ingest.ts`, `workspace.ts` (open, save, new) |
| `src/state/hooks/` | data hooks that fetch from the worker pool: `stats.ts` (`useSampleStats`, `useAnalysisTable`) |
| `src/state/export.ts` | figure export wired to the store, pool and toasts (`exportPlot`, `exportSvgFigure`) |
| `src/lib/` | pure logic, tested in Node: no store, pool, workers or components (`pnpm lint:deps` checks this). Functions documented "call inside `mutate`" work on a workspace draft |
| `src/components/` | views and inspectors (see below) |
| `src/styles.css` | all CSS, one global file |

Views (`ui.view`). Each is defined once in `app/views.tsx`; to add one, add its id to `VIEW_IDS` in
`state/store.ts`, its entry to `VIEW_DEFS` and its place in `VIEW_ORDER`:

| `ui.view` | View component | Settings panel |
|---|---|---|
| `metadata` | `MetadataView` | `MetadataInspector` (toggled by `views.metaSettings`) |
| `gate` | `PlotPanel` → `PlotCanvas`, plus `PopulationTree` and `RefPlots` | `Inspector` from `GateInspector.tsx` |
| `plot` (Plot grid) | `PlotGridView` | `Inspector target="grid"` (toggled by `views.gridSettings`) |
| `tiles` | `TilesView` in `GroupViews.tsx` | `Inspector target="tiles"` (toggled by `views.tilesSettings`) |
| `path` | `GatingPathView` | – |
| `stats` | `StatsView` | `StatsInspector` (in `StatsView.tsx`) |
| `ridge` | `RidgeView` in `GroupViews.tsx`, plus `RidgeCombinePanel` | `RidgeInspector` |
| `charts` | `ChartsView` | `ChartInspector`, rendered by `ChartsView` |
| `compensation` | `CompensationView` | – |
| `samples` | `SamplesView` in `CompensationView.tsx` | – |

What is in `src/lib/`:

| File | Contents |
|---|---|
| `keys.ts` | worker-pool cache keys: `lineageKey`, `plotKey` |
| `gates.ts` | `addGate`: a new gate's populations and their names |
| `axisDefaults.ts`, `plotFactories.ts` | default axes and channels, scale kinds; new Gate-view and Tiles plots |
| `figure.ts`, `ridgeStyle.ts`, `styleScope.ts` | plot and ridge appearance; settings kept per channel and shared across populations (`styleScope` is the shared logic) |
| `gridCarry.ts` | grid-plot settings copied to the other grid plots |
| `ridgeRows.ts` | which ridges a ridge plot draws (samples or combined replicates) |
| `statsTable.ts`, `statsFormat.ts`, `chartSelection.ts`, `formula.ts` | statistics table rows and columns, number formatting, chart data, formula editing |
| `metadata.ts`, `palette.ts` | sample variables (values, types, paste); colours of populations and values |
| `ingest.ts`, `files.ts`, `names.ts` | grouping loaded files; data-file extensions; short sample names |
| `export/` | figure export: `svg.ts`, `pdf.ts`, `figure.ts`, `plot.ts` (takes its data as a `PlotExportSource`) |
| `geometry.ts`, `fitSize.ts`, `text.ts`, `format.ts`, `json.ts`, `download.ts`, `sheets.ts` | gate drawing geometry, sizing, label wrapping, number formats, JSON copy/compare, downloads, spreadsheets |

Some names do not match what the files hold: `components/Inspector.tsx` is a library of shared
controls (`Section`, `NumInput`, `AxisEditor`, `StyleEditor`, `GateEditor`, icons), and `RidgeInspector.tsx`
also exports shared controls (`TicksEditor`, `FontSelect`, `TextStyleEditor`). Search for a symbol
before assuming where it lives.

## Store rules

- Change the workspace only through `mutate(label, fn, merge?)`, or `mutateGroup(groupId, label, fn,
  merge?)` for one group. Put a reusable change in `state/commands/` with its logic in a draft function
  in `lib/` that a Node test can call on a plain workspace.
- `mutate`: `fn` receives an immer draft. `label` is the undo entry's name. `merge` is a key that folds
  repeated edits from one gesture (a drag, typing) into one undo step within 1 s; it must be unique per
  gesture. `mutateQuiet` changes the workspace without an undo step (for derived data only).
- After every edit, `mutate` applies the rules listed in `AFTER_EDIT` in `store.ts` (today: grid-plot
  settings carried to the other grid plots, `lib/gridCarry.ts`) and stamps `modifiedAt`.
- Helpers whose doc comment says "call inside `mutate`" take a draft (for example `defaultAxis` in
  `lib/axisDefaults.ts`, which can register transforms and axis defaults). Do not call them on the live state.
- `setUi({ view })` that switches the view records the location left for Back. Layout preferences go
  through `setViews`, messages and loading state through `setStatus` (or `toast()`).
- The root population's id is `'root'`.
- Statistics-table column keys are strings shared by `lib/statsTable.ts`, `StatsView`, `ChartsView` and
  `@flowmeris/table`: `${popId}|count`, `${popId}|pctParent`, a `StatSpec` id, `var:${variableId}` and
  `sample:name`.

## Worker pool rules

- Get the pool with `getPool()` (`engine-client/pool.ts`); tests can replace it with `setPool()`.
- Plot requests (`raster`, `histogram`, `counts`) take `{ key, signal }` and go through the
  `Scheduler` (`engine-client/scheduler.ts`). `key` must identify the result completely, typically
  `plotKey` from `lib/keys.ts` plus size and colours. Results with the same key are shared and cached, so
  never mutate a result.
- Other requests (`table`, `preview`, `channelValues`, `exportEvents`) go to the worker at once, so a
  gate preview never waits behind queued plots (ADR-0010).
- To add a worker method, add it to `Engine`, pass it through in `workers/compute.worker.ts` with
  `Parameters<Engine['name']>`, and add the pool method. Types that are not Engine's own go in
  `packages/engine/src/api.ts`.

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
