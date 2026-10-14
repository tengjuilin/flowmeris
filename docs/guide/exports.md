# Exports and reporting

| What | Where | Format |
|---|---|---|
| Statistics | Statistics → settings › Export → *CSV (tidy)* / *CSV (wide)* | CSV with file hashes, population paths, units, compensation and override flags ([details](../methods/exports#m-export-stats-statistics-tables)) |
| Statistics table | Statistics → settings › Export → *CSV (table)* and its column checklist | the table as shown (per sample, or replicates combined), with the chosen columns ([details](./charts#exporting)) |
| Charts | Charts → *Export* | the chart as a [figure](#figures), or *CSV (plotted data)*: the plotted means, error and *n* |
| Sample variables | Metadata → *Export CSV* | file, well and variables of each sample — a template to fill in and import |
| Gates | Statistics → settings › Export → *Gating-ML* | Gating-ML 2.0 for the template, plus one file per overridden sample |
| Gated events | Statistics → settings › Export → *FCS (raw)* / *CSV (compensated)* | events of the current population for the selected sample |
| Plots | Gate, Plot or Ridge → *Export* | the plot as a [figure](#figures): vector axes and gates with the events embedded as an image at the chosen DPI (300 by default). In the Plot view, the selected plot with the sample it shows (overlays are not drawn) |
| Analysis | Header → *Workspace → Export* | JSON ([format](../methods/workspace)) |

## Figures

Every figure (Gate, Plot and Ridge plots, charts) has the same **Export** menu:

| Format | What you get |
|---|---|
| PDF (vector) | lines, shapes and text stay vector; Arial, Helvetica, Times New Roman and Courier New are named, other fonts embedded |
| PNG, JPG | an image at the chosen resolution (72–1200 DPI; PNG records it in the file) |
| SVG (vector) | for editing; the fonts are named, not embedded, and plots record the app version, sample hash and plot settings |

The text of an exported figure is in the same font, size, weight, slant and color as on screen. A PDF in
Arial (the default), Helvetica, Times New Roman or Courier New names the font without embedding it, so it
stays small and shows in that font on any computer that has it (Windows and macOS have all four); PDF
readers stand in a font of the same widths elsewhere. Minus signs in such a PDF are drawn as en dashes. A
PDF in another font, or with characters those fonts lack in a PDF (such as Greek letters), embeds the font.
Where it cannot (in Firefox or Safari, or a font that is not installed), it uses an open font with the same
proportions in its place, such as DejaVu Sans for Verdana, and a red warning names the fonts it replaced.
Chrome and Edge then ask once for permission to read the computer's fonts; allow it to embed the fonts
themselves. An SVG file names its fonts without embedding them; open it on a computer that has them.

## Reporting checklist (MIFlowCyt)

For publication, report at least the following (Lee et al. 2008, MIFlowCyt):

- the instrument (`$CYT`, `$CYTSN`) and its configuration, from the Samples tab;
- the compensation method and matrix, with its condition number;
- the transforms with their parameters, as written in the exports;
- the gating hierarchy, with the Gating-ML file as supplementary data and any per-sample overrides;
- the statistic definitions ([Statistics](../methods/statistics)) and the Flowmeris version shown in the
  exports.

Deposit raw FCS files (e.g. FlowRepository) together with the Gating-ML and workspace files.

- Lee JA, et al. MIFlowCyt: the minimum information about a flow cytometry experiment. *Cytometry A* 2008;73:926–930.
