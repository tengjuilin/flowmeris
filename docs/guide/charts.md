# Statistics tables and charts

## Derived columns

The **Statistics** view has a settings panel at its right with three tabs: **Statistics** (add a statistic,
derived columns), **Replicates** and **Export**. On narrow windows it opens from the Settings button.

In the panel's **Statistics** tab, **Derived columns** adds columns computed from the others, row by row:

- **Formula:** an arithmetic expression over other columns, referenced by their header in brackets,
  e.g. `[CD4+ | Median PE-A] / [CD4+ | Median FITC-A]` or `log2([Fold])`. Operators `+ − * / ^` and
  the functions `log`, `ln`, `log2`, `log10`, `exp`, `sqrt`, `abs`, `min`, `max` are available:
  `ln(x)` is the natural log and `log(x, b)` the log to base *b*, e.g. `log([Fold], 1.5)` (the base is
  required). While you type, matching column names and functions are suggested (after `[`, columns only); ↑/↓ choose, Enter or
  Tab inserts. A mistake (unknown column or function, unbalanced brackets) is reported under the box,
  with the formula shown and the faulty part marked. A formula may use earlier derived columns.
- **Normalization:** a column relative to reference samples — those whose variable has a given value (dose
  0, condition "untreated"). The reference is the mean over the reference samples; tick **Within the same**
  variables to take it per replicate, per cell line, etc. Ratio (x / ref), percent (100 · x / ref) or
  difference (x − ref).

Each derived column has its own **Significant figures** (3 by default): how many digits the table shows
for the column and its replicate summaries. Exports keep full precision.

Definitions: [M-STAT-EXPR, M-STAT-NORM](/methods/statistics#derived-columns).

## Combining replicates

In the **Replicates** tab, **Combine replicates** groups the rows by the chosen variables (e.g. condition and dose) and summarises
every numeric column with the functions ticked under **Summaries**: mean, SD, SEM, 95% CI, median, CV, min, max and *n*.
Variables not grouped by (e.g. the replicate id) are dropped from the grouped table.

## Exporting

In the **Export** tab, the checklist under **CSV (table)** chooses the columns of that export, which writes the table as shown — one row
per sample, or one per group when replicates are combined (the grouping variables and *n* are always
included). **CSV (tidy)** and **CSV (wide)** now also carry the sample variables after the sample's file
identity.

## Charts

The **Charts** tab plots the statistics table. Each group can have several charts, in tabs above the
chart: **+** adds a chart and **×** on a tab deletes that chart (Undo brings it back). Beside the chart are
the **Export** button and the **Groups** card; the settings panel on the right has the chart's settings
(on narrow windows it opens from the Settings button).

- **Type:** scatter, line, bar or dot. Bar and dot charts place x values as categories; scatter and line
  charts use a numeric axis when x is numeric.
- **X / Y:** any variable or statistic column (Y: numeric columns), including derived columns. Clicking
  an axis title on the chart also picks its column.
- **Colour by:** a categorical variable; one series per value, in the category order of the variable.
- **Scales:** linear or log for x (numeric) and y. Values ≤ 0 cannot be shown on a log axis and are
  counted in a note under the chart.
- **Error bars:** SD, SEM or 95% CI of the samples sharing an x value and colour. The marker or bar shows
  their mean. **Show replicate points** overlays each sample's value.

Hover a point or bar for its mean, error and *n*; **Data** lists the plotted values. **Export** writes the
chart as PDF or SVG (vector), PNG or JPG (at the chosen DPI), or **CSV (plotted data)**: the plotted means,
error and *n*.

### Groups

The **Groups** card beside the chart has one row per plotted point (the samples sharing an x value and
colour). Untick a group to hide it; open it with ▸ to untick single replicates, which are then left out of
its mean, error bar, replicate points, the Data table and the CSV export. Click anywhere on a row to toggle
it; Shift-click toggles the range from the last clicked row, as in a file list. **Show all** brings
everything back. Hiding a whole series keeps the other series' colours.

### Chart settings

The settings panel has four tabs of collapsible cards. Settings are saved with each chart. Each card's ↺
resets that card, and **Reset this panel** resets the open tab; neither changes the chart's columns, type
or hidden groups.

- **Figure:** the chart's **Name** (its tab's label) and **Chart type**; **Error bars** and **Show replicate
  points**; **Marks** (bar or marker opacity, marker size, line width, bar width as a share of each
  category, error-bar width and cap width, replicate point size and opacity); **Size** (width: fit the
  view, or fixed in px; and height). Exports use this size.
- **Axis:** **X axis** and **Y axis**, each with its **Column**, **Scale**, **Title** (type a space for
  none), **Min** / **Max** in data units (empty = fit the data; marks outside a fixed range are clipped)
  and custom ticks, one per line, `1000` or `1000 = 1k`. Categorical x axes keep the variable's level
  order. **Colour** is the colour axis: **Colour by**, a categorical palette or a single colour, and each
  series' colour and legend label (also used in the tooltip, the Data table and the CSV export). Drag ⠿ to
  reorder series, or **Reverse**. Changing **Colour by** clears these. **Gridlines** turns them on or off.
- **Text:** font, tick labels (on or off, and their size), axis title size, and the legend (top, right or
  hidden, and its size).
- **Settings:** **Duplicate this chart** (as a new tab, with its settings) or delete it; **Apply same
  settings for all charts** of the group (each keeps its axis titles; an axis's scale, range and ticks go
  only to charts plotting the same column, and series colours, labels and order only to charts coloured by
  the same variable); and reset the settings of this chart or of every chart.
