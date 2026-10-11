# Flowmeris

Flow cytometry analysis that runs entirely in the browser. You load a folder of FCS files as a group,
gate them with one shared hierarchy (with per-sample adjustments), plot them, and export statistics,
plots and Gating-ML. Every method is documented, and every result is checked against reference
implementations.

- **Input:** FCS 2.0 / 3.0 / 3.1 / 3.2, including multi-dataset files. Compensation comes from each
  sample's `$SPILLOVER` keyword, an edited matrix, or an imported CSV.
- **Scales:** linear, log10, logicle, arcsinh and hyperlog, using the Gating-ML 2.0 definitions and
  editable parameters.
- **Plots:** dot, pseudocolor, density, contour (equal-probability or logarithmic levels, with
  outliers) and histogram; tiled per-sample panels and ridge plots for groups.
- **Gates:** rectangle, ellipse, polygon, quadrant, spider, histogram range and bisector. Gates are hierarchical,
  you can drill into any population, and edits apply to the whole group or to one sample only
  (overrides are flagged everywhere).
- **Output:** tidy and wide statistics CSV with provenance, Gating-ML 2.0, gated events as FCS 3.1 or
  CSV, SVG/PNG plots at 300 dpi, and the workspace as JSON.
- **Privacy:** no server. Data stay in the browser's private storage. A Content-Security-Policy forbids
  network requests to anywhere but the app's own origin.

## Validation

| Check | Result |
|---|---|
| ISAC Gating-ML 2.0 compliance suite (51 reference gates) | exact event-level agreement |
| FCS parsing, compensation and transforms vs FlowKit 1.2.3 (pinned) | ≤ 10⁻¹⁴, 10⁻⁹ and 10⁻¹⁰ relative |
| Statistics vs NumPy, on gated populations in linear and transformed units | ≤ 10⁻¹² relative (transformed: 10⁻¹⁰); percentiles exact on linear channels |
| Replicate summaries and t-based 95% CI vs SciPy/pandas | ≤ 10⁻¹² (t distribution 10⁻¹⁰) |
| Gating-ML exported by the app, evaluated by FlowKit (every gate kind) | identical membership, event by event |
| Gates drawn in the app, exported as Gating-ML and evaluated by FlowKit | identical population counts |

Details: [`docs/validation`](docs/validation/index.md). Methods: [`docs/methods`](docs/methods/index.md).

## Development

Requires Node ≥ 20 (pnpm via `corepack`). To regenerate the golden fixtures you also need
[uv](https://github.com/astral-sh/uv).

```bash
corepack pnpm install
```

```bash
corepack pnpm fixtures:fetch   # large test files, SHA-256 verified
```

```bash
corepack pnpm dev              # docs at http://localhost:5173, app at /app/
```

```bash
corepack pnpm check            # lint + typecheck + unit/golden tests
```

```bash
corepack pnpm build && corepack pnpm e2e   # Playwright (Chromium, Firefox, WebKit)
```

```bash
corepack pnpm golden           # regenerate fixtures/golden from FlowKit (pinned in uv.lock)
```

```bash
corepack pnpm build:site && corepack pnpm preview   # docs + app (at /app/), as deployed
```

### Layout

Notes for coding agents (layering, tests, conventions) are in [`CLAUDE.md`](CLAUDE.md).


| Path | Contents |
|---|---|
| `packages/model` | workspace schema (zod), canonical JSON, fingerprints |
| `packages/fcs` | FCS parser and writer |
| `packages/transforms`, `compensation`, `gating`, `stats`, `density`, `render` | numerical kernels |
| `packages/gatingml`, `export` | Gating-ML reader/evaluator; CSV and Gating-ML export |
| `packages/table` | statistics table: derived columns, formulas, replicate summaries, table import |
| `packages/testkit` | test-only helpers: fixture paths, tolerances, synthetic data |
| `packages/engine`, `storage` | cached analysis pipeline; OPFS persistence |
| `apps/web` | React app and compute workers |
| `docs` | VitePress site: guide, methods, validation, decision records |
| `fixtures`, `tools/golden` | reference data and the golden-value generator (`fixtures/golden/inputs`: files the app writes, evaluated by FlowKit) |

## Status

Milestones M0–M3 of the implementation plan are complete, along with parts of M4–M5 (tiles, ridge
plots, spider gates, Gating-ML/FCS/SVG/PNG export). Not yet implemented:
- XLSX export;
- PDF plot export;
- N×N plot matrix;
- Time-channel QC view;
- Boolean gates in the UI;
- compensation from single-stain controls;
- Gating-ML import in the UI;
- WebAssembly kernels.

## License

Not yet chosen. Test fixtures keep their upstream licenses (see `fixtures/PROVENANCE.md`).
