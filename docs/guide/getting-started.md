# Getting started

1. **[Open flowmeris](../app/){target="_self"}** in a current Chromium-based browser, Firefox or Safari. Nothing is installed or uploaded.
2. **Add a folder** of `.fcs` (or `.lmd`) files with *Add folder…*, or drag the folder onto the page.
   Each folder becomes a **group**. Files are hashed (SHA-256), parsed and stored in the browser's private
   storage. Files with several datasets give one sample per dataset.
3. **Check the samples** in the *Samples* tab: event counts, FCS version, channels (`$PnN`/`$PnS`,
   `$PnR`, `$PnE`, `$PnG`), keywords, and any parser notes (see the
   [warning codes](../methods/fcs#warning-and-error-codes)).
4. **Check compensation** in the *Compensation* tab. By default each sample uses its own `$SPILLOVER`
   keyword.
5. **Gate** in the *Plot* tab (see [Gating](./gating)). Double-click a gate to open that population and
   gate further.
6. **Review all samples** in *Tiles* and *Ridge*. Fix individual samples with *This sample only*
   (see [Groups and overrides](./groups)).
7. **Export** statistics, plots, Gating-ML and the workspace (see [Exports](./exports)).

Keyboard: `V` select, `R` rectangle, `E` ellipse, `P` polygon, `Q` quadrant, `S` spider, `H` range
(histograms); arrow keys nudge the selected gate (Shift = 10 px); `Esc` cancels; `⌘Z` / `⇧⌘Z` undo/redo.
