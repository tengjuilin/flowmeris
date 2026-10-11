# apps/web: notes for coding agents

The React 18 app (Vite). All analysis runs in a pool of Web Workers. The UI keeps the workspace (a JSON
document, `@flowmeris/model` `Workspace`) in one zustand store with patch-based undo.

Every view is in a feature folder (ADR-0008); `components/` holds only the controls and hooks shared by
several features. Update this file when the layout changes.

## Where things are

| Path | Contents |
|---|---|
| `src/app/` | the shell: `views.tsx` (VIEW_DEFS: every view's label, content, settings panel, tool keys, tab action; VIEW_ORDER), `App.tsx`, `Header.tsx`, `TabBar.tsx`, `Overlays.tsx`, `useHotkeys.ts`, `useDropIngest.ts` |
| `src/state/store.ts` | the store: `ws` (workspace), `ui` (where the user is and what is selected), `views` (layout preferences), `status` (missing data, loading, toast), undo history, Back/Forward |
| `src/state/prefs.ts` | preferences in browser storage: session view and layout, settings panels' tabs and collapsed cards (`usePanelState`; the stored format is in `lib/settingsPanel.ts`) |
| `src/state/persist.ts` | IndexedDB autosave of `ws` (ring of 20 snapshots) |
| `src/engine-client/` | `pool.ts`: the worker pool (ADR-0003, ADR-0010), `getPool()`; `scheduler.ts`: its request queue and result cache |
| `src/workers/compute.worker.ts` | worker side: wraps `@flowmeris/engine` behind Comlink (`ComputeApi`) |
| `src/state/commands/` | named store commands: `gates.ts`, `plots.ts` (incl. `drill`, and `openPathPlot` for the Gating path), `grid.ts`, `refPlots.ts`, `charts.ts`, `metadata.ts` (delete a variable, detect wells), `ingest.ts`, `workspace.ts` (open, save, new) |
| `src/state/hooks/` | data hooks that fetch from the worker pool: `stats.ts` (`useSampleStats`, `useAnalysisTable`) |
| `src/state/export.ts` | figure export wired to the store, pool and toasts (`exportFigure`, `storePlotFigure`); see Figure export below |
| `src/lib/` | pure logic, tested in Node: no store, pool, workers or components (`pnpm lint:deps` checks this). Functions documented "call inside `mutate`" work on a workspace draft |
| `src/components/ui/` | generic controls that take data and callbacks as props: `icons.tsx`, `settings/` (every settings panel's parts: `SettingsPanel`, `EmptyPanel`, `Card`, `InspectorTabs`, `PanelReset`, and the Settings tab's `ApplyCard`, `ResetCard`, `ActionsCard`; see Settings panels below), `TabStrip` (closable tabs with +), `NumInput`/`OptNumInput` (commit while typing), `Slider`/`PercentSlider`, `SettingsToggle`, `ActionRow`, `PickerMenu`, `GroupPicker`, `PlotSizeSlider`, `SupLabel`, `ColorField` (swatch with reset), `ReorderList` (drag-to-reorder rows, with `useRowSelection`), `ListActions` (the Reverse and reset buttons above such a list). No store or pool imports (`lint:deps`) |
| `src/components/controls/` | settings controls shared by several views, which may use the store: `AxisFields` (scale and range), `TicksEditor`, `ExportMenu`; `text/` (`BaseFontCard`, `TextCards`: the settings panels' text appearance, built on `FontSelect` and `TextStyleEditor`) |
| `src/components/hooks/` | DOM and timing hooks: `useSize`, `useWidth`, `useVisible`, `useSettled`/`useDebounced`, `useFontsLoaded` (measure text again once a font arrives) |
| `src/features/plot/` | one plot: `PlotCanvas` (composes `usePlotData`, `useGateEditing`/`useGatePreview`, `GateShapes`, `DraftShapes`, `PlotAxes`, `PlotPaths`), `PlotControls` (plot type, channels and scales, drawing tools, edit scope), `usePlot` (`usePlotForPopulation`, `useTilePlot`) |
| `src/features/gate/` | the Gate view: `PlotPanel` (with its title, whose buttons open the plot in the Plot or Tiles view, its toolbar and export card), `RefPlots`, and the plot settings panel `Inspector` (`GateInspector.tsx`, tabs in `tabs/`, cards `AxisEditor`, `StyleEditor`, `GateEditor`), also used by the Plot grid and Tiles views |
| `src/features/ridge/` | the Ridge view: `RidgeView` (and `RidgeExportCard`), `useRidge` (the current population's ridge layout and its rows), `useRidgeCurves`, `RidgeCombinePanel` (Replicates card), and `RidgeInspector` (tabs in `tabs/`, edits in `ridgeEdits.ts`) |
| `src/features/tiles/` | the Tiles view (`TilesView`); its settings panel is `features/gate`'s `Inspector target="tiles"` |
| `src/features/stats/` | the Statistics view: `StatsView` (the table), `StatsInspector` with `StatsFields` (new statistic, grouping, summaries, export columns) and `DerivedColumns` (formula and normalization forms, `FormulaInput`); `useGroupMutate` edits the group |
| `src/features/charts/` | the Charts view: `useChart` (the open chart, `ui.chartId`, with its data and edits), `ChartsView` (chart tabs, the chart, `ChartDataTable`, and the side column's Export card and `ChartGroupsPanel`), `Chart` (layout in `frameChart`; axes, series marks, legend and tooltip in `ChartParts`), and the settings panel `ChartInspector` (tabs in `tabs/`, with `ChartAxisFields`, a chart axis in data units unrelated to the cytometry `AxisFields`, `ChartColorFields`, `ChartTicksFields`, `ChartLegendFields`, `ChartMarkFields` (each kind of mark's card) built on `ChartStyleFields` (a color, width or choice of the chart style, so every mark offers them the same way)) |
| `src/features/tree/` | `PopulationTree`: the population tree with counts, beside the plots of the Gate, Plot grid, Tiles and Gating path views |
| `src/features/grid/` | the Plot grid view: `PlotGridView` and `GridCell`, `useGridDrag` (drag plots by their titles) and `useGridKeys` (Delete, cut, copy, paste); slot moves are in `lib/gridMove.ts`; its settings panel is `features/gate`'s `Inspector target="grid"`, whose Figure tab has the cell's population, sample and overlay fields (`gate/tabs/GridCellFields.tsx`) |
| `src/features/path/` | the Gating path view: `GatingPathView` (Path and Tree layouts), `PathCards` (`StepCard`, `PopChip`, `WhenVisible`, `ViewErrorBoundary`), `PopulationsPanel` |
| `src/features/metadata/` | the Metadata view: `MetadataView` (toolbar, variable chips), `MetaTable`, `PlateMap`, `ImportDialog`, and the settings panel `MetadataInspector` with `VariableFields` and `ValuesTab` |
| `src/features/samples/`, `src/features/compensation/`, `src/features/sidebar/` | the Samples view, the Compensation view, and the sidebar of groups and samples |
| `src/styles/` | all CSS, global, in files imported in cascade order by `styles/index.css` (with the features' CSS) |

A feature folder's public API is its `index.ts`: other code imports only that (`pnpm lint:deps`). Files inside
a feature import each other directly. A new view, panel or part of one goes in a feature folder; only
controls and hooks shared by several features go in `components/ui`, `components/controls` or
`components/hooks` (`lint:deps` rejects a file directly in `components/`).

Views (`ui.view`). Each is defined once in `app/views.tsx`; to add one, add its id to `VIEW_IDS` in
`state/store.ts`, its entry to `VIEW_DEFS` and its place in `VIEW_ORDER`:

| `ui.view` | View component | Settings panel |
|---|---|---|
| `metadata` | `MetadataView` (`features/metadata`) | `MetadataInspector` (toggled by `views.metaSettings`) |
| `gate` | `PlotPanel` → `PlotCanvas`, plus `PopulationTree` (`features/tree`) and `RefPlots` | `Inspector` (`features/gate`) |
| `plot` (Plot grid) | `PlotGridView` (`features/grid`) | `Inspector target="grid"` (toggled by `views.gridSettings`) |
| `tiles` | `TilesView` (`features/tiles`) | `Inspector target="tiles"` (toggled by `views.tilesSettings`) |
| `path` | `GatingPathView` (`features/path`) | – |
| `stats` | `StatsView` (`features/stats`) | `StatsInspector` (`features/stats`) |
| `ridge` | `RidgeView`, plus `RidgeCombinePanel` (`features/ridge`) | `RidgeInspector` (`features/ridge`) |
| `charts` | `ChartsView`, with its Export and Groups cards (`features/charts`) | `ChartInspector` (`features/charts`) |
| `compensation` | `CompensationView` (`features/compensation`) | – |
| `samples` | `SamplesView` (`features/samples`) | – |

What is in `src/lib/`:

| File | Contents |
|---|---|
| `keys.ts` | worker-pool cache keys: `lineageKey`, `plotKey` |
| `gates.ts` | `addGate`: a new gate's populations and their names |
| `axisDefaults.ts`, `plotFactories.ts` | default axes and channels, scale kinds, factory axes (`axisAtFactory`, `resetAxisToFactory`); new Gate-view and Tiles plots (`populationPlot`: a population's first plot) |
| `unsavedPlot.ts` | the Gate view's plot (`gateViewPlot`), which may be unsaved (`UNSAVED_PLOT_ID`), and saving it with the first edit that changes it (`addUnsaved`, `settleUnsaved`, used by `mutate`) |
| `figure.ts`, `ridgeStyle.ts`, `styleScope.ts` | plot and ridge appearance; settings kept per channel and shared across populations (`styleScope` is the shared logic) |
| `gridCarry.ts` | grid-plot settings copied to the other grid plots |
| `ridgeRows.ts`, `ridgeLayout.ts`, `ridgePanels.ts` | which ridges a ridge plot draws (samples or combined replicates); its labels, pixel layout and paths (`ridgeLabels`, `ridgeFrame`, `ridgePaths`); its settings panel's card and tab resets, reordering (`moveRidges`) and base font scaling |
| `statsTable.ts`, `statsFormat.ts`, `statsHeader.ts`, `statsExport.ts`, `derived.ts`, `formula.ts` | statistics table rows and columns, number formatting, header sections, dividers and pinned columns; export file names, Gating-ML files and the export column checklist; derived column defaults and descriptions; formula editing |
| `chartAxis.ts`, `chartLayout.ts`, `chartMarks.ts`, `chartLegend.ts`, `chartStyle.ts`, `chartSelection.ts`, `chartPanels.ts` | chart axes (`makeAxis`, `validFix`, `dataExtents`, `barPath`); margins, band slots and the plot area (`plotArea`, with the box aspect ratio); marker shapes (`markerPath`) and the horizontal-line marker's length; the legend's grid of entries, wrapping, room and place (`legendGrid`, `legendMargins`, `legendOrigin`); default style, series color and order, the first chart (`defaultPlot`), the chart CSV; hidden points and excluded rows; the settings panel's cards, card and tab resets, applying settings to all charts, duplicating |
| `metadata.ts`, `metaTable.ts`, `plate.ts`, `metaImport.ts`, `palette.ts` | sample variables (values, types, paste, the shown variable, wells detected); the Metadata table's cells (linked Well, Row and Column, `writeMetaCell`); the plate map (samples by well, series fills); importing a table or plate layout; colors of populations and values |
| `ingest.ts`, `files.ts`, `names.ts` | grouping loaded files; data-file extensions; short sample names |
| `export/` | figure export, used through its `index.ts`; see Figure export below |
| `fonts/` | figure fonts (ADR-0011), used through its `index.ts`: the bundled families and the font menu (`catalog.ts`: `BUNDLED`, `FONT_GROUPS`, `FONT_ALIASES`, `fontStack`), their files (`files.ts`, `registerBundledFonts`), installed fonts (`local.ts`, `sfnt.ts`), which font a text is drawn in (`resolve.ts`) |
| `geometry.ts`, `fitSize.ts`, `order.ts`, `text.ts`, `format.ts`, `json.ts`, `download.ts`, `sheets.ts` | gate drawing geometry; sizing (`nearestColumns`, and `RowFit` for rows of plots in Tiles and the Plot grid); moving ids in a list (`moveIds`); label wrapping, number formats, JSON copy/compare, downloads, spreadsheets |
| `ticks.ts`, `math.ts`, `textScale.ts` | custom ticks (`parseTicks`, `formatTicks`, `customTicks`), histogram y ticks; `clamp`; font sizes (`clampFontSize`, `scaleFontSizes`: the base font size scaling the others) |
| `plotFrame.ts`, `plotLayout.ts`, `plotPaths.ts` | a plot's pixel mapping and gate hit testing (`hitGate`, `popAt`); margins and titles (`plotBox`, `axisLabel`); histogram and contour SVG paths |
| `gateEdit.ts` | gate shapes from drags and handles (`applyHandle`, `translate`, `shapeFromDrag`, `newGateBase`) |
| `plotPanels.ts` | the plot settings panel's per-tab defaults and reset (`panelAtDefaults`, `resetPanel`) |
| `panelSpecs.ts`, `settingsPanel.ts` | every settings panel's tabs and cards with their titles (`PLOT_PANELS`, `RIDGE_PANEL`, `CHART_PANEL`, `STATS_PANEL`, `META_PANEL`); the spec types, card props and the remembered tab and collapsed cards |
| `gatingPath.ts` | the Gating path: the plot showing each gate (`plotForGate`, built from the gate's axes when no saved plot matches), the tree (`treeLayout`), the path's steps |

`figure.ts` has the SVG text styling (`textCss`, `figureText`); `fonts/catalog.ts` the fonts (`fontStack`);
`ridgeStyle.ts` the ridge defaults and colors (`ridgeColor`). Search for a symbol before assuming where it lives.

## Settings panels

Every view's settings panel is built from the same parts, so a change to how panels look or behave is
made once, and each feature keeps only its own logic:

| To change | Edit | Reaches |
|---|---|---|
| a panel's tabs, cards or titles | `lib/panelSpecs.ts` | that panel |
| the frame, tabs, "Reset this panel", empty panel, card | `components/ui/settings/` and `styles/inspector.css` | every panel |
| the Settings tab's Apply / Reset cards | `components/ui/settings/ActionsCard.tsx` | Gate, Ridge, Charts |
| the Base font card, the per-text cards | `components/controls/text/` | Gate, Ridge, Charts |
| remembered tab and collapsed cards | `useSettingsPanel` (`state/prefs.ts`), `lib/settingsPanel.ts` | every panel |
| what a card edits or resets | the feature's `tabs/*.tsx` and `lib/*Panels.ts` | that panel |

- **Add a card**: add it to the tab in `lib/panelSpecs.ts`, then render `<Card {...card('id')}>` in the
  tab; pass `card('id', { changed, onReset })` for its ↺ button. A card not in the spec (one per gate or
  variable) passes its title: `` card(`gate-${id}`, undefined, name) ``.
- **Add a tab**: add it to the spec (`resettable: false` if it has nothing of its own to reset), render
  its component in the inspector, and give "Reset this panel" its reset in the feature's `lib/*Panels.ts`.
- **Text settings**: a Text tab is a `BaseFontCard` and a `TextCards` list of entries (card, label, style,
  size, edits, and `extra` fields); the base size scales the others with `scaleFontSizes`.
- **Settings tab**: `ApplyCard` and `ResetCard` take lists of actions (`label`, `title`, `disabled`,
  `run`) and checkboxes; `ActionsCard` takes actions with their own icons.
- **Guardrails**: `lint:deps` (`web-settings-kit-api`, `web-text-through-cards`) keeps features on the
  kits' `index.ts`; `features/settingsPanels.test.ts` fails when a feature draws `insp-*` frame markup or
  a tab list itself; `lib/panelSpecs.test.ts` checks every spec's ids.

| Panel | Spec | Inspector |
|---|---|---|
| Gate, Tiles, Plot grid | `PLOT_PANELS[target]` | `features/gate/GateInspector.tsx` (tabs in `gate/tabs/`) |
| Ridge | `RIDGE_PANEL` | `features/ridge/RidgeInspector.tsx` (tabs in `ridge/tabs/`) |
| Charts | `CHART_PANEL` | `features/charts/ChartInspector.tsx` (tabs in `charts/tabs/`) |
| Statistics | `STATS_PANEL` | `features/stats/StatsInspector.tsx` |
| Metadata | `META_PANEL` | `features/metadata/MetadataInspector.tsx` (its tab follows the table or plate map) |

## Figure export

Every figure (Gate and Plot grid plots, ridge plots, charts) is written to a file by `lib/export`, so a fix
to a format, to styles or to fonts reaches every view. A view only describes its figure and shows the
shared `ExportMenu` (`components/controls`):

```tsx
<ExportMenu target={() => (svgRef.current ? { figure: svgFigure(svgRef.current), name } : undefined)} />
```

| To change | Edit |
|---|---|
| a figure drawn as on screen (charts, ridges) | `svgFigure(svg)`; nothing else |
| a figure with parts re-rendered for export (event rasters at the DPI) | a `FigureSource` like `plotFigure` (`lib/export/plot.ts`), wired to the store in `state/export.ts` |
| the formats, their labels, extensions and DPI | `lib/export/formats.ts` (`FORMATS`) and its writer in `WRITERS` (`figure.ts`) |
| which styles are copied, which on-screen parts are dropped | `lib/export/standalone.ts` |
| PNG and JPEG | `lib/export/raster.ts` |
| PDF (jsPDF and svg2pdf, loaded on demand) | `lib/export/pdf.ts` |
| text svg2pdf cannot draw (baselines, underline, halos), rewritten before the PDF | `lib/export/pdfText.ts`; add a step there for a new text feature |
| fonts embedded in SVG, PNG and JPEG | `lib/export/fontFaces.ts` |
| the fonts themselves, the font menu | `lib/fonts/catalog.ts` and `tools/fonts.lock.json` (see its comment) |

The pipeline (`writeFigure`): the source builds standalone SVG markup, which is laid out off-screen
(`mount.ts`) and handed to the format's writer. Fonts (ADR-0011): figures are drawn only in the bundled
fonts (or an installed font the user names), and every format embeds the faces its text uses, so text has
the same font, size and width on screen and in every file. Figure text has no kerning or ligatures
(`styles/base.css`), as jsPDF draws none; keep it that way, or PDF text widths will differ from the screen.
In the PDF, svg2pdf finds a face only by weight 400 or 700 and style `normal`/`italic`, registered under
jsPDF's style names (`normal`, `bold`, `italic`, `bolditalic`). Guardrails: `lint:deps`
(`web-figure-export-api`) keeps other code on `lib/export/index.ts`; `lib/export/boundaries.test.ts` fails
when code outside `lib/export` imports jsPDF or svg2pdf, serializes SVG or encodes a canvas, or draws its
own Export button; `lib/export/figure.test.ts` checks what each format receives; `lib/fonts/*.test.ts`
check the catalog against the lock file and that jsPDF embeds every bundled face; `e2e/figure-export.spec.ts`
checks, in real browsers, that each PDF text is set in an embedded font at its on-screen size (helper
`pdfTextFonts`).

## Store rules

- Change the workspace only through `mutate(label, fn, merge?)`, or `mutateGroup(groupId, label, fn,
  merge?)` for one group. Put a reusable change in `state/commands/` with its logic in a draft function
  in `lib/` that a Node test can call on a plain workspace.
- `mutate`: `fn` receives an immer draft. `label` is the undo entry's name. `merge` is a key that folds
  repeated edits from one gesture (a drag, typing) into one undo step within 1 s; it must be unique per
  gesture. `mutateQuiet` changes the workspace without an undo step (for derived data only).
- Opening a population never changes the workspace: the Gate view shows its plot unsaved (`ui.unsavedPlot`,
  or built by `gateViewPlot`) until an edit in the Gate view changes the plot or a gate on it. `mutate`
  then saves it in that edit's undo step, labeled `Add plot and …`, and selects it under its new id.
  Edits find the unsaved plot in the draft by its id, `UNSAVED_PLOT_ID`, as they find a saved one. The
  one exception: when its axes need a transform or axis default the workspace lacks (rare: a channel no
  plot used), `usePlotForPopulation` registers them with `mutateQuiet` so the plot can be drawn.
- After every edit, `mutate` applies the rules listed in `AFTER_EDIT` in `store.ts` (today: grid-plot
  settings carried to the other grid plots, `lib/gridCarry.ts`) and stamps `modifiedAt`.
- Helpers whose doc comment says "call inside `mutate`" take a draft (for example `defaultAxis` in
  `lib/axisDefaults.ts`, which can register transforms and axis defaults). Do not call them on the live state.
- `setUi({ view })` that switches the view records the location left for Back. Layout preferences go
  through `setViews`, messages and loading state through `setStatus` (or `toast()`).
- The root population's id is `'root'`.
- Statistics-table column keys are strings shared by `lib/statsTable.ts`, `features/stats`, `features/charts` and
  `@flowmeris/table`: `${popId}|count`, `${popId}|pctParent`, a `StatSpec` id, `var:${variableId}` and
  `sample:name`.

## Worker pool rules

- Get the pool with `getPool()` (`engine-client/pool.ts`); tests can replace it with `setPool()`.
- Plot requests (`raster`, `histogram`, `counts`) take `{ key, signal }` and go through the
  `Scheduler` (`engine-client/scheduler.ts`). `key` must identify the result completely, typically
  `plotKey` from `lib/keys.ts` plus size and colors. Results with the same key are shared and cached, so
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
- UI behavior across views is covered by Playwright in `/e2e` (`corepack pnpm build && corepack pnpm e2e`).
  To check a change by eye, start the `web` server from `.claude/launch.json`.

## CSS

All CSS is global, with flat class names. `styles/index.css` imports the files in cascade order (later
files win at equal specificity): `styles/*.css` and each feature's own file (`features/plot/plot.css`,
`features/gate/gate.css`, `features/tiles/tiles.css`, `features/ridge/ridge.css`,
`features/grid/grid.css`, `features/path/path.css`, `features/stats/stats.css`,
`features/metadata/metadata.css`, `features/charts/charts.css`). Moving a rule to
another file can change what wins: compare the built CSS (`apps/web/dist/assets/*.css`) before and
after, and check any rule that now comes after another rule with the same specificity that sets the
same property on the same elements. Theme tokens, in light
and dark, are at the top of `base.css`; the breakpoints at 1100 px and 700 px are in `responsive.css`.

Classes shared across views:
- `insp-panel`, `insp-head`, `insp-tabs`, `insp-global`, `insp-section*` and `insp-pane-title`: every
  settings panel (rendered by `ui/settings`);
- `reorder-list`, `reorder-grip` and `list-actions` (`styles/lists.css`): the drag-to-reorder lists of ridge rows
  and chart series (`ui/ReorderList`), and the buttons above them (`ui/ListActions`);
- `view-controls` and `view-settings`: the controls at the end of the Tiles, Plot grid, Path and Metadata
  toolbars (`ui/SettingsToggle`);
- `tab-strip`, `tab-strip-tab` and `tab-strip-add`: the reference-plot and chart tabs (`ui/TabStrip`).
