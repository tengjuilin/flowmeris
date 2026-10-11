# Exports

Implementation: `packages/export`. Tests: `packages/export/src/export.test.ts`.

## M-EXPORT-STATS — statistics tables

**Tidy CSV** has one row per sample × population × statistic. The columns are:

| Column | Content |
|---|---|
| `workspace`, `group` | names |
| `sample_file`, `sample_path`, `sample_sha256`, `dataset` | file identity (SHA-256 of the whole file; dataset index for multi-dataset files) |
| *sample variables* | one column per workspace variable, headed by its name (and unit) |
| `population_path`, `population_id` | e.g. `All events/Lymphocytes/Q2: CD4+ CD8+` |
| `statistic`, `percentile`, `channel`, `marker`, `space`, `transform` | what was computed, on which channel (`$PnN`, `$PnS`) and in which units |
| `value`, `n_events`, `n_excluded` | result, number of values used, values excluded (NaN; ≤ 0 for geometric mean) |
| `gate_overridden_on_path`, `overridden_gate_ids` | whether this sample used an overridden gate anywhere on the population's path |
| `compensation` | `none`, `FCS $SPILLOVER (per sample)` or the matrix name |
| `app_version` | Flowmeris version |

Numbers are written with JavaScript's shortest round-trip formatting, so no precision is lost.
**Wide CSV** has one row per sample (file, hash, sample variables) and one column per population ×
statistic, for spreadsheets. **Table CSV** is the statistics table as shown, with the chosen columns: one
row per sample, or one per group of replicates ([M-STAT-AGG](./statistics#combining-replicates-m-stat-agg)).
Both use RFC 4180 quoting.

## M-EXPORT-GML — Gating-ML 2.0

The group template, and for every sample with overrides its *effective* gates, are written as Gating-ML
2.0 XML with all transforms and (for named matrices) the spectrum matrix. Population ids become gate and
quadrant ids, so parent references follow the population tree. Compensation references are `FCS` (each
sample's `$SPILLOVER`), `uncompensated`, or the exported matrix. Spider gates are exported as four polygon
gates plus a `flowmeris:spider` extension element ([M-GATE-SPIDER](./gating#m-gate-spider-spider)), and
bisectors as one-divider quadrant gates ([M-GATE-SPLIT](./gating#m-gate-split-bisector)). The schema
allows no `custom_info` inside a `Quadrant`, so the names of a quadrant gate's populations are written in
the gate's own `custom_info`, one `flowmeris:name` element per quadrant.

Round-trip test: for rectangle, polygon, ellipse, quadrant, spider and bisector gates on `data1.fcs`, evaluating
the exported XML with the independent Gating-ML evaluator gives membership identical to the engine.
An end-to-end check exported gates drawn in the app on three 8-color samples; FlowKit 1.2.3 reproduced
every population count, including those of a sample with an override. Golden test: Gating-ML the app
exports for 38 populations on three files (every gate kind; linear, flin, logicle, arcsinh and hyperlog
dimensions; keyword, matrix and no compensation) is evaluated by FlowKit, and the engine's membership
is identical event by event ([Validation](../validation/)).

## Gated events

- **FCS (raw):** FCS 3.1 ([M-FCS-WRITE](./fcs#m-fcs-write-fcs-3-1-output)) with linearized,
  uncompensated values and the original keywords (including `$SPILLOVER`), so other tools can re-apply
  compensation. Time values are written in seconds, so `$TIMESTEP` is set to 1. (Values written
  compensated carry no spillover keyword, which would compensate them twice.) Golden test: FlowKit reads
  the exported events exactly as the engine holds them, at float32 precision.
- **CSV (compensated):** one column per channel, linear compensated values.

## Plots

See [M-EXPORT-PLOT](./plots#export-m-export-plot).

## Workspace

**Save workspace** writes the complete analysis as JSON ([Workspace format](./workspace)). FCS data are
not included; on **Open workspace** the files are re-linked by SHA-256 when the folder is added again.
