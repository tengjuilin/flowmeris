# Workspace format

Implementation: `packages/model` (zod schema in `schema.ts`). The workspace is plain JSON:

```text
{ schema: "flowmeris.workspace", schemaVersion: 1,
  app: { version, commit, kernels },
  transforms:   { t_<hash>: { kind: "logicle", T, W, M, A } , … },
  compMatrices: { cm_…: { detectors, spill, source } , … },
  samples:      { s_<sha256-prefix>_<dataset>: { sha256, keywords, channels, parseWarnings, … } },
  groups: [ { sampleIds, channels, compensation,
              template: { populations, gates },
              overrides: [ { sampleId, gateId, geometry, at } ],
              axisDefaults, plots, refPlots, grid: { columns, cells }, layouts, stats } ] }
```

- **Gates** store their dimensions (channel, compensation reference, transform id) and geometry in that
  space; populations reference a gate and a region (`in`, `Q1`–`Q4`).
- **Transforms** are content-addressed: equal parameters give the same id.
- **Plot grid** (`grid`) holds the Plot view's cells in row order; an empty cell is `null`. Each cell has
  a population, an optional pinned sample, overlaid sample ids, plot type, axes and style. Workspaces
  saved before the grid existed load with an empty 3-column grid.
- **Sample ids** derive from the file's SHA-256 and dataset index, so re-adding the same file re-links it.

## M-MODEL-CANON — canonical JSON and fingerprints

Saved workspaces and cache keys use canonical JSON: object keys sorted, `undefined` members omitted,
numbers in shortest round-trip form, `-0` written as `0`, non-finite numbers rejected. A fingerprint is
the first 128 bits of the SHA-256 of the canonical JSON.

## Versioning

`schemaVersion` increases on incompatible changes. Older files are migrated step by step when opened.
Files from a newer version are refused with a message rather than misread.
