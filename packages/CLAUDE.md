# packages/: notes for coding agents

App-independent TypeScript libraries. Each package exports from `src/index.ts` (its `exports` entry)
and is imported by name (`@flowmeris/stats`), never by path. Unit tests sit next to the code
(`src/*.test.ts`). Cross-package golden tests are in `export/test/`.

## Packages

| Package | Job | Production deps | Methods |
|---|---|---|---|
| `model` | workspace schema (zod), canonical JSON, content ids and fingerprints | – | M-MODEL-CANON |
| `fcs` | FCS 2.0–3.2 parser, linearisation, FCS 3.1 writer | – | M-FCS-* |
| `compensation` | spillover parsing, matrix inverse, condition number, compensator | – | M-COMP-* |
| `transforms` | Gating-ML 2.0 scales (linear, log, logicle, arcsinh, hyperlog), ticks | model | M-TR-* |
| `stats` | summary statistics, percentiles, frequencies, Student t | – | M-STAT-* |
| `density` | 1D/2D binning, smoothing, contour levels and lines | – | M-PLOT-BIN, -SMOOTH, -CONTOUR-* |
| `gating` | gate geometry, event membership, population bitsets | model, compensation | M-GATE-* |
| `render` | colormaps, 2D raster, histogram, PNG encoder (ADR-0001) | model, density | M-PLOT-PSEUDO, -DENSITY |
| `gatingml` | Gating-ML 2.0 reader and evaluator (ISAC compliance suite) | model, compensation, gating, transforms | M-GATE-* |
| `table` | statistics table: derived columns, formulas, replicate aggregation, table import | model, stats | M-STAT-AGG, -NORM, -EXPR |
| `export` | statistics CSV, Gating-ML writer, gated events as FCS/CSV | model, compensation, fcs | M-EXPORT-* |
| `engine` | cached analysis pipeline used by the worker: columns, populations, stats, rasters (ADR-0004) | model, fcs, compensation, gating, render, stats, transforms | – |
| `storage` | OPFS storage for decoded columns (browser only, untested) | engine (types) | – |
| `testkit` | fixture paths, tolerances (`TOL`), comparison helpers, synthetic data. Tests only. | – | – |

Every package except `model` and `testkit` may use `testkit` in its tests.

## Rules

- No package imports `apps/`, React or browser-only APIs. The exception is `storage`, which is
  OPFS-only by design.
- Add a dependency to the `package.json` of the package that imports it before importing it;
  `pnpm lint:deps` fails otherwise. Packages used only in tests go under `devDependencies`.
- Numerical code uses float64 (ADR-0002) and follows its method definition in `docs/methods`. Cite the
  method ID in the doc comment.
- Changing a kernel's results means bumping `KERNEL_VERSION` in `engine/src/engine.ts`, so cached results
  are not reused (ADR-0004).
- Known structure debt, to be split by section: `model/src/schema.ts`, `engine/src/engine.ts`,
  `fcs/src/parse.ts`, `render/src/index.ts` and `stats/src/index.ts`. `storage` depends on `engine` only
  for the `StorageAdapter` types.
