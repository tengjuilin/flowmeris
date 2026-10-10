# Exports and reporting

| What | Where | Format |
|---|---|---|
| Statistics | Statistics → settings › Export → *CSV (tidy)* / *CSV (wide)* | CSV with file hashes, population paths, units, compensation and override flags ([details](../methods/exports#m-export-stats-statistics-tables)) |
| Statistics table | Statistics → settings › Export → *CSV (table)* and its column checklist | the table as shown (per sample, or replicates combined), with the chosen columns ([details](./charts#exporting)) |
| Charts | Charts → *Export* | the chart as PDF or SVG (vector) or PNG or JPG (chosen DPI), or *CSV (plotted data)*: the plotted means, error and *n* |
| Sample variables | Metadata → *Export CSV* | file, well and variables of each sample — a template to fill in and import |
| Gates | Statistics → settings › Export → *Gating-ML* | Gating-ML 2.0 for the template, plus one file per overridden sample |
| Gated events | Statistics → settings › Export → *FCS (raw)* / *CSV (compensated)* | events of the current population for the selected sample |
| Plots | Gate or Plot toolbar → *SVG* / *PNG*; Ridge → *SVG* | vector axes and gates with a 300-dpi embedded raster; PNG at 300 dpi. In the Plot view, the selected plot with the sample it shows (overlays are not drawn) |
| Analysis | Header → *Save workspace* | JSON ([format](../methods/workspace)) |

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
