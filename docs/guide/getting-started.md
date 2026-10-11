# Getting started

1. **[Open Flowmeris](../app/){target="_self"}** in a current Chromium-based browser, Firefox or Safari. Nothing is installed or uploaded.
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
(histograms); arrow keys nudge the selected gate (Shift = 10 px); `Esc` cancels; `⌘Z` / `⇧⌘Z` undo/redo. In the Plot
grid, `⌘X` / `⌘C` / `⌘V` cut, copy and paste the selected plot.

Settings panels: most views have a settings panel at the right, in tabs of collapsible cards. Each panel
remembers its last tab and the cards you collapsed, in this browser; every card starts open.
**Reset this panel** resets the settings of the open tab; tabs with no settings of their own (such as
**Settings**) do not have it. With nothing to edit yet, a panel says what to do first.
In the plot, ridge and chart panels, the **Text** tab starts with the **Base font** card (the font, color and size
every text starts from; changing the size scales the others), followed by one card per kind of text.
The fonts in the list ship with Flowmeris, so a figure looks the same on every computer and in every
export (see [Exports](./exports#figures)). Each is named with the font it stands in for: Liberation Sans
has the widths of Arial and Helvetica, Liberation Serif those of Times New Roman, Carlito those of Calibri.
