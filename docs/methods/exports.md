# Exports

Implementation: `packages/export`. Tests: `packages/export/src/export.test.ts`.

## M-EXPORT-STATS — statistics tables

**Tidy CSV** has one row per sample × population × statistic. The columns are:

| Column | Content |
|---|---|
| `workspace`, `group` | names |
| `sample_file`, `sample_path`, `sample_sha256`, `dataset` | file identity (SHA-256 of the whole file; dataset index for multi-dataset files) |
| `population_path`, `population_id` | e.g. `All events/Lymphocytes/Q2: CD4+ CD8+` |
| `statistic`, `percentile`, `channel`, `marker`, `space`, `transform` | what was computed, on which channel (`$PnN`, `$PnS`) and in which units |
| `value`, `n_events`, `n_excluded` | result, number of values used, values excluded (NaN; ≤ 0 for geometric mean) |
| `gate_overridden_on_path`, `overridden_gate_ids` | whether this sample used an overridden gate anywhere on the population's path |
| `compensation` | `none`, `FCS $SPILLOVER (per sample)` or the matrix name |
| `app_version` | flowmeris version |

Numbers are written with JavaScript's shortest round-trip formatting, so no precision is lost.
**Wide CSV** has one row per sample and one column per population × statistic, for spreadsheets.
Both use RFC 4180 quoting.

## M-EXPORT-GML — Gating-ML 2.0

The group template, and for every sample with overrides its *effective* gates, are written as Gating-ML
2.0 XML with all transforms and (for named matrices) the spectrum matrix. Population ids become gate and
quadrant ids, so parent references follow the population tree. Compensation references are `FCS` (each
sample's `$SPILLOVER`), `uncompensated`, or the exported matrix. Spider gates are exported as four polygon
gates plus a `flowmeris:spider` extension element ([M-GATE-SPIDER](./gating#m-gate-spider-spider)).

Round-trip test: for rectangle, polygon, ellipse, quadrant and spider gates on `data1.fcs`, evaluating
the exported XML with the independent Gating-ML evaluator gives membership identical to the engine.
An end-to-end check exported gates drawn in the app on three 8-colour samples; FlowKit 1.2.3 reproduced
every population count, including those of a sample with an override.

## Gated events

- **FCS (raw):** FCS 3.1 ([M-FCS-WRITE](./fcs#m-fcs-write-fcs-3-1-output)) with linearised,
  uncompensated values and the original keywords (including `$SPILLOVER`), so other tools can re-apply
  compensation.
- **CSV (compensated):** one column per channel, linear compensated values.

## Plots

See [M-EXPORT-PLOT](./plots#export-m-export-plot).

## Workspace

**Save workspace** writes the complete analysis as JSON ([Workspace format](./workspace)). FCS data are
not included; on **Open workspace** the files are re-linked by SHA-256 when the folder is added again.
