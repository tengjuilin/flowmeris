# Statistics tables and charts

## Derived columns

In the **Statistics** tab, **Derived columns** adds columns computed from the others, row by row:

- **Formula:** an arithmetic expression over other columns, referenced by their header in brackets,
  e.g. `[CD4+ | Median PE-A] / [CD4+ | Median FITC-A]` or `log2([Fold])`. Operators `+ − * / ^` and
  the functions `log10`, `ln`, `log2`, `exp`, `sqrt`, `abs`, `min`, `max` are available; use
  **Insert column** to add a reference. A formula may use earlier derived columns.
- **Normalisation:** a column relative to reference samples — those whose variable has a given value (dose
  0, condition "untreated"). The reference is the mean over the reference samples; tick **Within the same**
  variables to take it per replicate, per cell line, etc. Ratio (x / ref), percent (100 · x / ref) or
  difference (x − ref).

Definitions: [M-STAT-EXPR, M-STAT-NORM](/methods/statistics#derived-columns).

## Combining replicates

**Combine replicates** groups the rows by the chosen variables (e.g. condition and dose) and summarises
every numeric column with the chosen functions: mean, SD, SEM, 95% CI, median, CV, min, max and *n*.
Variables not grouped by (e.g. the replicate id) are dropped from the grouped table.

## Exporting

**Columns** chooses the columns of the **CSV (table)** export, which writes the table as shown — one row
per sample, or one per group when replicates are combined (the grouping variables and *n* are always
included). **CSV (tidy)** and **CSV (wide)** now also carry the sample variables after the sample's file
identity.

## Charts

The **Charts** tab plots the statistics table. Each group can have several charts (tabs).

- **Type:** scatter, line, bar or dot. Bar and dot charts place x values as categories; scatter and line
  charts use a numeric axis when x is numeric.
- **X / Y:** any variable or statistic column (Y: numeric columns), including derived columns.
- **Colour by:** a categorical variable; one series per value, in the category order of the variable.
- **Scales:** linear or log for x (numeric) and y. Values ≤ 0 cannot be shown on a log axis and are
  counted in a note under the chart.
- **Error:** SD, SEM or 95% CI of the samples sharing an x value and colour. The marker or bar shows their
  mean. **Replicates** overlays each sample's value.

Hover a point or bar for its mean, error and *n*; **Data** lists the plotted values. Export as **SVG**
(vector), **PNG** (300 dpi) or **CSV** of the plotted means.
