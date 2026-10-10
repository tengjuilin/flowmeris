# packages/: notes for coding agents

App-independent TypeScript libraries. Each package exports from `src/index.ts` (its `exports` entry)
and is imported by name (`@flowmeris/stats`), never by path. Unit tests sit next to the code
(`src/*.test.ts`). Cross-package golden tests are in `export/test/`.

## Packages

| Package | Job | Production deps | Methods |
|---|---|---|---|
| `model` | workspace schema (zod), canonical JSON, content ids and fingerprints; the types of decoded sample data (`SampleData`, `StorageAdapter`, `ChannelScaling`) | – | M-MODEL-CANON |
| `fcs` | FCS 2.0–3.2 parser, linearisation, FCS 3.1 writer | model (types) | M-FCS-* |
| `compensation` | spillover parsing, matrix inverse, condition number, compensator | – | M-COMP-* |
| `transforms` | Gating-ML 2.0 scales (linear, log, logicle, arcsinh, hyperlog), ticks | model | M-TR-* |
| `stats` | summary statistics, percentiles, frequencies, Student t | – | M-STAT-* |
| `density` | 1D/2D binning, smoothing, contour levels and lines, replicate histograms for ridges | – | M-PLOT-BIN, -SMOOTH, -CONTOUR-*, -RIDGE-COMBINE |
| `gating` | gate geometry, event membership, population bitsets | model, compensation | M-GATE-* |
| `render` | colormaps, 2D raster, histogram, PNG encoder (ADR-0001) | model, density | M-PLOT-PSEUDO, -DENSITY |
| `gatingml` | Gating-ML 2.0 reader and evaluator (ISAC compliance suite) | model, compensation, gating, transforms | M-GATE-* |
| `table` | statistics table: derived columns, formulas, replicate aggregation, table import | model, stats | M-STAT-AGG, -NORM, -EXPR |
| `export` | statistics CSV, Gating-ML writer, gated events as FCS/CSV | model, compensation, fcs | M-EXPORT-* |
| `engine` | cached analysis pipeline used by the worker: columns, populations, stats, rasters (ADR-0004) | model, fcs, compensation, gating, render, stats, transforms | – |
| `storage` | OPFS storage for decoded columns (browser only; tested with in-memory OPFS handles) | model (types) | – |
| `testkit` | fixture paths, tolerances (`TOL`), comparison helpers, synthetic data. Tests only. | – | – |

Every package except `model` and `testkit` may use `testkit` in its tests.

## Rules

- No package imports `apps/`, React or browser-only APIs. The exception is `storage`, which is
  OPFS-only by design.
- Add a dependency to the `package.json` of the package that imports it before importing it;
  `pnpm lint:deps` fails otherwise. Packages used only in tests go under `devDependencies`.
- Numerical code uses float64 (ADR-0002) and follows its method definition in `docs/methods`. Cite the
  method ID in the doc comment.
- Changing a kernel's results means bumping `KERNEL_VERSION` in `engine/src/keys.ts`, so cached results
  are not reused (ADR-0004).
- `gating` uses `invert` from `compensation` (the ellipsoid gate's covariance inverse). It is a general
  matrix inverse, and `compensation` depends on no other package, so it stays there.

## Where things are

| Package | Files |
|---|---|
| `model` | `schema/`: one file per section of the workspace schema (`transform`, `compensation`, `sample`, `gate`, `plot`, `figure`, `ridge`, `table`, `chart`, `workspace`; `common.ts` holds the shared `Num`, `Id`, `HexColor` and is not exported); `canonical.ts`, `ids.ts`, `workspace.ts` (helpers), `storage.ts` |
| `engine` | `engine.ts`: the `Engine` facade, which loads a request's sample and columns and calls `columns.ts` (loading, linear, compensated and transformed columns), `populations.ts` (keys, bitsets, indices, counts) and `handlers/` (`stats`, `raster` with histograms, `preview`, `events`); `keys.ts` (`KERNEL_VERSION`, cache keys, fingerprints), `memo.ts`, `lru.ts`, `storage-memory.ts` |
| `fcs` | `parse.ts` (`parseFcs`) → `header.ts`, `text.ts`, `dataset.ts` (keywords, DATA offsets, channel parameters) → `data.ts` (binary and ASCII decoders); `linearize.ts`, `write.ts` |
| `render` | `colormaps.ts`, `raster2d.ts`, `histogram.ts`, `png.ts` (including `encodePngCompressed`) |
| `stats` | `summary.ts` (`summarize`, frequencies, SEM), `percentile.ts` (numpy-linear percentiles, rank selection), `tdist.ts` (Student's t, CI95) |
