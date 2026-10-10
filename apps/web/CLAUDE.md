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
| `src/components/ui/` | generic controls that take data and callbacks as props: `icons.tsx`, `Section` (collapsible settings card), `InspectorTabs` and `PanelReset`, `NumInput`/`OptNumInput`, `Slider`/`PercentSlider`, `SettingsToggle`, `ActionRow`, `PickerMenu`, `GroupPicker`, `PlotSizeSlider`, `SupLabel`, `ColorField` (swatch with reset), `ReorderList` (drag-to-reorder rows, with `useRowSelection`). No store or pool imports (`lint:deps`) |
| `src/components/controls/` | settings controls shared by several views, which may use the store: `AxisFields` (scale and range), `TicksEditor`, `FontSelect`, `TextStyleEditor`, `ExportMenu` |
| `src/components/hooks/` | DOM and timing hooks: `useSize`, `useWidth`, `useVisible`, `useSettled`/`useDebounced` |
| `src/features/plot/` | one plot: `PlotCanvas` (composes `usePlotData`, `useGateEditing`/`useGatePreview`, `GateShapes`, `DraftShapes`, `PlotAxes`, `PlotPaths`), `PlotControls` (plot type, channels and scales, drawing tools, edit scope), `usePlot` (`usePlotForPopulation`, `useTilePlot`) |
| `src/features/gate/` | the Gate view: `PlotPanel` (with its toolbar and export card), `RefPlots`, and the plot settings panel `Inspector` (`GateInspector.tsx`, tabs in `tabs/`, cards `AxisEditor`, `StyleEditor`, `GateEditor`), also used by the Plot grid and Tiles views |
| `src/features/ridge/` | the Ridge view: `RidgeView` (and `RidgeExportCard`), `useRidge` (the current population's ridge layout and its rows), `useRidgeCurves`, `RidgeCombinePanel` (Replicates card), and `RidgeInspector` (tabs in `tabs/`, edits in `ridgeEdits.ts`) |
| `src/features/tiles/` | the Tiles view (`TilesView`); its settings panel is `features/gate`'s `Inspector target="tiles"` |
| `src/components/` | the other views and inspectors (see below), moving to `features/` |
| `src/styles/` | all CSS, global, in files imported in cascade order by `styles/index.css` (with the features' CSS) |

A feature folder's public API is its `index.ts`: other code imports only that (`pnpm lint:deps`). Files inside
a feature import each other directly.

Views (`ui.view`). Each is defined once in `app/views.tsx`; to add one, add its id to `VIEW_IDS` in
`state/store.ts`, its entry to `VIEW_DEFS` and its place in `VIEW_ORDER`:

| `ui.view` | View component | Settings panel |
|---|---|---|
| `metadata` | `MetadataView` | `MetadataInspector` (toggled by `views.metaSettings`) |
| `gate` | `PlotPanel` → `PlotCanvas`, plus `PopulationTree` and `RefPlots` | `Inspector` (`features/gate`) |
| `plot` (Plot grid) | `PlotGridView` | `Inspector target="grid"` (toggled by `views.gridSettings`) |
| `tiles` | `TilesView` (`features/tiles`) | `Inspector target="tiles"` (toggled by `views.tilesSettings`) |
| `path` | `GatingPathView` | – |
| `stats` | `StatsView` | `StatsInspector` (in `StatsView.tsx`) |
| `ridge` | `RidgeView`, plus `RidgeCombinePanel` (`features/ridge`) | `RidgeInspector` (`features/ridge`) |
| `charts` | `ChartsView` | `ChartInspector`, rendered by `ChartsView` |
| `compensation` | `CompensationView` | – |
| `samples` | `SamplesView` in `CompensationView.tsx` | – |

What is in `src/lib/`:

| File | Contents |
|---|---|
| `keys.ts` | worker-pool cache keys: `lineageKey`, `plotKey` |
| `gates.ts` | `addGate`: a new gate's populations and their names |
| `axisDefaults.ts`, `plotFactories.ts` | default axes and channels, scale kinds, factory axes (`axisAtFactory`, `resetAxisToFactory`); new Gate-view and Tiles plots |
| `figure.ts`, `ridgeStyle.ts`, `styleScope.ts` | plot and ridge appearance; settings kept per channel and shared across populations (`styleScope` is the shared logic) |
| `gridCarry.ts` | grid-plot settings copied to the other grid plots |
| `ridgeRows.ts`, `ridgeLayout.ts`, `ridgePanels.ts` | which ridges a ridge plot draws (samples or combined replicates); its labels, pixel layout and paths (`ridgeLabels`, `ridgeFrame`, `ridgePaths`); its settings panel's card and tab resets, reordering (`moveRidges`) and base font scaling |
| `statsTable.ts`, `statsFormat.ts`, `chartSelection.ts`, `formula.ts` | statistics table rows and columns, number formatting, chart data, formula editing |
| `metadata.ts`, `palette.ts` | sample variables (values, types, paste); colours of populations and values |
| `ingest.ts`, `files.ts`, `names.ts` | grouping loaded files; data-file extensions; short sample names |
| `export/` | figure export: `svg.ts`, `pdf.ts`, `figure.ts`, `plot.ts` (takes its data as a `PlotExportSource`) |
| `geometry.ts`, `fitSize.ts`, `order.ts`, `text.ts`, `format.ts`, `json.ts`, `download.ts`, `sheets.ts` | gate drawing geometry; sizing (`nearestColumns`, and `RowFit` for rows of plots in Tiles and the Plot grid); moving ids in a list (`moveIds`); label wrapping, number formats, JSON copy/compare, downloads, spreadsheets |
| `ticks.ts`, `math.ts` | custom ticks (`parseTicks`, `formatTicks`, `customTicks`), histogram y ticks; `clamp` |
| `plotFrame.ts`, `plotLayout.ts`, `plotPaths.ts` | a plot's pixel mapping and gate hit testing (`hitGate`, `popAt`); margins and titles (`plotBox`, `axisLabel`); histogram and contour SVG paths |
| `gateEdit.ts` | gate shapes from drags and handles (`applyHandle`, `translate`, `shapeFromDrag`, `newGateBase`) |
| `plotPanels.ts` | the plot settings panel's per-tab defaults and reset (`panelAtDefaults`, `resetPanel`) |

`figure.ts` has the SVG text styling (`textCss`, `figureText`) and fonts (`FONT_STACKS`, `fontStack`);
`ridgeStyle.ts` the ridge defaults and colours (`ridgeColor`). Search for a symbol before assuming where it lives.

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
- Components: `src/**/*.test.tsx` (vitest project `dom`: jsdom and `@testing-library/react`, setup in
  `vitest.dom-setup.ts`). Use it for controls in `components/ui` and `components/controls`; select by
  role and label, and drive them with `fireEvent`.
- UI behaviour across views is covered by Playwright in `/e2e` (`corepack pnpm build && corepack pnpm e2e`).
  To check a change by eye, start the `web` server from `.claude/launch.json`.

## CSS

All CSS is global, with flat class names. `styles/index.css` imports the files in cascade order (later
files win at equal specificity): `styles/*.css` and each feature's own file (`features/plot/plot.css`,
`features/gate/gate.css`, `features/tiles/tiles.css`, `features/ridge/ridge.css`). Moving a rule to
another file can change what wins: compare the built CSS (`apps/web/dist/assets/*.css`) before and
after, and check any rule that now comes after another rule with the same specificity that sets the
same property on the same elements. Theme tokens, in light
and dark, are at the top of `base.css`; the breakpoints at 1100 px and 700 px are in `responsive.css`.

Classes shared across views:
- `insp-panel`, `insp-head`, `insp-tabs`, `insp-global`, `insp-section*` and `insp-pane-title`: every
  settings panel (rendered by `ui/InspectorTabs`, `ui/PanelReset` and `ui/Section`);
- `reorder-list`, `reorder-grip` and `list-actions` (`styles/lists.css`): the drag-to-reorder lists of ridge rows
  and chart series (`ui/ReorderList`), and the buttons above them;
- `view-controls` and `view-settings`: the controls at the end of the Tiles, Plot grid, Path and Metadata
  toolbars (`ui/SettingsToggle`);
- `tab-strip`, `tab-strip-tab` and `tab-strip-add`: the reference-plot and chart tabs.
