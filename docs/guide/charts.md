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

In the **Replicates** tab, **Combine replicates** groups the rows by the chosen variables (e.g. condition and dose) and summarizes
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
- **Color by:** a categorical variable; one series per value, in the category order of the variable.
- **Scales:** linear or log for x (numeric) and y. Values ≤ 0 cannot be shown on a log axis and are
  counted in a note under the chart.
- **Error bars:** SD, SEM or 95% CI of the samples sharing an x value and color. The marker or bar shows
  their mean. **Show replicate points** overlays each sample's value.

Hover a point or bar for its mean, error and *n*; **Data** lists the plotted values. **Export** writes the
chart as PDF or SVG (vector), PNG or JPG (at the chosen DPI), or **CSV (plotted data)**: the plotted means,
error and *n*.

### Groups

The **Groups** card beside the chart has one row per plotted point (the samples sharing an x value and
color). Untick a group to hide it; open it with ▸ to untick single replicates, which are then left out of
its mean, error bar, replicate points, the Data table and the CSV export. Click anywhere on a row to toggle
it; Shift-click toggles the range from the last clicked row, as in a file list. **Show all** brings
everything back. Hiding a whole series keeps the other series' colors.

### Chart settings

The settings panel has four tabs of collapsible cards. Settings are saved with each chart, and number
fields apply while you type (typing one number is one Undo step). Each card's ↺
resets that card, and **Reset this panel** resets the open tab; neither changes the chart's columns, type
or hidden groups.

- **Figure:** the chart's **Name** (its tab's label) and **Chart type**; **Error bars** and **Show replicate
  points**; then one card per kind of mark, each with its line and point settings. A color left unset
  follows each series' color (or the theme's) until you pick one; ↺ next to it sets it back.
  - **Mean markers** (scatter, line and dot charts): opacity; **Marker shape** (circle, square, triangle,
    diamond, or **Horizontal line**, with its own width, length (empty = as wide as the series'
    replicates) and color); size, color, edge color and edge width; and the group width of dot charts.
  - **Bars** (bar charts, in place of Mean markers): opacity, bar width as a share of each category, and
    an outline color and width (0 = no outline).
  - **Line** (line charts): the line joining the means: width, color, and solid, dashed or dotted.
  - **Error bars**: width, cap width and color.
  - **Replicate points**: shape, size, color, edge color and width, and opacity.
  - **Legend** (shown with two or more series): **Location**: top, bottom, left or right of the plot
    area, in a corner inside it (framed), or hidden; **Alignment** along the plot area's side (start,
    center, end); and **Columns**: **Auto columns** fills the space and wraps (above or below the plot,
    as many columns as fit its width; beside or inside it, one column that wraps into more when the plot
    is too short), or set a number. The legend is never cut off: when a box aspect ratio or a small size
    narrows the plot area it wraps, and a legend that cannot fit enlarges the chart.
  - **Size**: width (fit the view, or fixed in px) and height. Exports use this size.
- **Axis:** **X axis** and **Y axis**, each with its **Column**, **Scale**, **Title** (type a space for
  none), **Min** / **Max** in data units (empty = fit the data; marks outside a fixed range are clipped)
  and custom ticks, one per line, `1000` or `1000 = 1k`. Categorical x axes keep the variable's level
  order. **Color** is the color axis: **Color by**, a categorical palette or a single color, and each
  series' color and legend label (also used in the tooltip, the Data table and the CSV export). Drag ⠿ to
  reorder series; the buttons above the list **Reverse** them and reset their order, colors or labels.
  Changing **Color by** clears these. **Ticks and spines** sets the color and width of the tick marks and
  of the axis lines, and a **Box aspect ratio** (plot area width ÷ height, fitted inside the chart's size;
  the chart shrinks to it), as in the Gate view. **Gridlines** turns them on or off and sets their color and width.
- **Text:** the **Base font** (any font from the list or installed on this computer, a color, which is
  the theme's text color until you pick one, and a size that scales the other sizes with it); then
  **Tick labels** (on or off), **Axis titles** and the **Legend** (its place is in the Figure tab),
  each with its own font, size, bold, italic, underline and color, as in the plot panels.
- **Settings:** **Duplicate this chart** (as a new tab, with its settings) or delete it; **Apply same
  settings for all charts** of the group (each keeps its axis titles; an axis's scale, range and ticks go
  only to charts plotting the same column, and series colors, labels and order only to charts colored by
  the same variable); and reset the settings of this chart or of every chart.
