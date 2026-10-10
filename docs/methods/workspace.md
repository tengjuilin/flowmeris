# Workspace format

Implementation: `packages/model` (zod schema in `src/schema/`, one file per section). The workspace is plain JSON:

```text
{ schema: "flowmeris.workspace", schemaVersion: 1,
  app: { version, commit, kernels },
  transforms:   { t_<hash>: { kind: "logicle", T, W, M, A } , … },
  compMatrices: { cm_…: { detectors, spill, source } , … },
  samples:      { s_<sha256-prefix>_<dataset>: { sha256, keywords, channels, parseWarnings, well, meta, … } },
  variables:    [ { id, name, type: "numeric" | "categorical", unit, levels } ],
  groups: [ { sampleIds, channels, compensation,
              template: { populations, gates },
              overrides: [ { sampleId, gateId, geometry, at } ],
              axisDefaults, plots, refPlots, grid: { columns, cells }, layouts, stats,
              analysis: { derived, aggregate: { enabled, by, funcs }, exportColumns },
              statPlots } ] }
```

- **Gates** store their dimensions (channel, compensation reference, transform id) and geometry in that
  space; populations reference a gate and a region (`in`, `Q1`–`Q4`).
- **Transforms** are content-addressed: equal parameters give the same id.
- **Plot grid** (`grid`) holds the Plot view's cells in row order; an empty cell is `null`. Each cell has
  a population, an optional pinned sample, overlaid sample ids, plot type, axes and style. Workspaces
  saved before the grid existed load with an empty 3-column grid.
- **Sample variables** (`variables`) are shared by all groups; each sample stores its values in `meta`
  by variable id, and its plate well (`A01`–`H12`) in `well`. The group's `analysis` holds the statistics
  table's derived columns, grouping and export columns, and `statPlots` the Charts tab's charts; columns
  are referred to by key (`var:<id>`, `<population>|count`, a statistic id, `derived:<id>`). Workspaces
  saved before these existed load with none.
- **Sample ids** derive from the file's SHA-256 and dataset index, so re-adding the same file re-links it.

## M-MODEL-CANON — canonical JSON and fingerprints

Saved workspaces and cache keys use canonical JSON: object keys sorted, `undefined` members omitted,
numbers in shortest round-trip form, `-0` written as `0`, non-finite numbers rejected. A fingerprint is
the first 128 bits of the SHA-256 of the canonical JSON.

## Versioning

`schemaVersion` increases on incompatible changes. Older files are migrated step by step when opened.
Files from a newer version are refused with a message rather than misread.
