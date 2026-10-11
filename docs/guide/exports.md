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
| Analysis | Header → *Save workspace* | JSON ([format](../methods/workspace)) |

## Figures

Every figure (Gate, Plot and Ridge plots, charts) has the same **Export** menu:

| Format | What you get |
|---|---|
| PDF (vector) | lines, shapes and text stay vector; the fonts are embedded |
| PNG, JPG | an image at the chosen resolution (72–1200 DPI; PNG records it in the file) |
| SVG (vector) | for editing; the fonts are embedded, and plots record the app version, sample hash and plot settings |

The text of an exported figure is in the same font, size, weight, slant and color as on screen. The fonts
in the font list ship with Flowmeris and are embedded in every export, in every browser. A font chosen
with *Other installed font…* is embedded in a PDF only in Chromium-based browsers (Chrome, Edge), which ask
once for permission to read installed fonts, and only for TrueType fonts; otherwise the PDF uses Liberation
Sans in its place and says so.

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
