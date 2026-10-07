# Exports and reporting

| What | Where | Format |
|---|---|---|
| Statistics | Statistics → *CSV (tidy)* / *CSV (wide)* | CSV with file hashes, population paths, units, compensation and override flags ([details](../methods/exports#m-export-stats-statistics-tables)) |
| Statistics table | Statistics → *Columns* + *CSV (table)* | the table as shown (per sample, or replicates combined), with the chosen columns ([details](./charts#exporting)) |
| Charts | Charts → *SVG* / *PNG* / *CSV* | the chart as vector or 300 dpi image, or the plotted means, error and *n* |
| Sample variables | Metadata → *Export CSV* | file, well and variables of each sample — a template to fill in and import |
| Gates | Statistics → *Gating-ML* | Gating-ML 2.0 for the template, plus one file per overridden sample |
| Gated events | Statistics → *FCS (raw)* / *CSV (compensated)* | events of the current population for the selected sample |
| Plots | Plot toolbar → *SVG* / *PNG*; Ridge → *SVG* | vector axes and gates with a 300-dpi embedded raster; PNG at 300 dpi |
| Analysis | Header → *Save workspace* | JSON ([format](../methods/workspace)) |

## Reporting checklist (MIFlowCyt)

For publication, report at least the following (Lee et al. 2008, MIFlowCyt):

- the instrument (`$CYT`, `$CYTSN`) and its configuration, from the Samples tab;
- the compensation method and matrix, with its condition number;
- the transforms with their parameters, as written in the exports;
- the gating hierarchy, with the Gating-ML file as supplementary data and any per-sample overrides;
- the statistic definitions ([Statistics](../methods/statistics)) and the flowmeris version shown in the
  exports.

Deposit raw FCS files (e.g. FlowRepository) together with the Gating-ML and workspace files.

- Lee JA, et al. MIFlowCyt: the minimum information about a flow cytometry experiment. *Cytometry A* 2008;73:926–930.
