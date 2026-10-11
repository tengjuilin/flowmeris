# Validation

Flowmeris is tested against independent reference implementations. All tests run in CI on every change
(`pnpm test`).

## Reference implementations

| Reference | Version | Used for |
|---|---|---|
| FlowKit (Python; Gating-ML 2.0 compliant) | 1.2.3, with FlowIO 1.3.0 and FlowUtils | FCS parsing and linearization, compensation, transforms |
| NumPy | 1.26.4 | statistics, binning |
| SciPy | 1.17.1 | t distribution (95% CI), Gaussian smoothing |
| pandas | 3.0.6 | grouped replicate summaries |
| ISAC Gating-ML 2.0 compliance suite | as distributed with FlowKit | gates, transforms, compensation, Boolean logic |

Golden values are produced by `tools/golden/python/generate.py` in an environment pinned by `uv.lock`.
Files that the app writes (Gating-ML and gated-event FCS from fixed workspaces) are committed under
`fixtures/golden/inputs/` and evaluated by FlowKit. A test checks that the app still writes them byte for
byte, so the reference results always describe the current exporter.
`fixtures/golden/golden-manifest.json` records the exact versions. Test files and their licenses are
listed in `fixtures/PROVENANCE.md`.

## Results

| Area | Test | Agreement |
|---|---|---|
| FCS parsing + linearization | 10 files (FCS 2.0, 3.0, 3.1; integer, float, log-amplified, gain, 290k-event 8-color) | event count and channel names exact; sampled rows, column sums, minima and maxima within 10⁻¹⁴ relative |
| Files FlowKit cannot read | multi-dataset `$NEXTDATA` file; files with malformed keywords | all datasets parsed, issues reported as warnings |
| Compensation | `$SPILLOVER` (8 colors) and external CSV matrix | within 10⁻⁹ relative |
| Transforms | logicle (6 parameter sets), hyperlog (3), arcsinh (3), linear (2), log (2) over 108 points each, including negatives and values above T | within 10⁻¹⁰ relative |
| Gating | **Gating-ML 2.0 compliance suite**: 51 reference gates on `data1.fcs` (rectangles, ranges, polygons incl. non-simple, ellipses, 3-D ellipsoid, quadrants, ratio transforms, all transforms, spectrum matrices, Boolean and/or/not, parent references) | **exact**: 0 mismatching events of 13,367 for every gate |
| Engine | gates defined through the app's data model, evaluated via the engine | exact against the ISAC truth files |
| Statistics | mean, SD, median, min, max, geometric mean, 9 percentiles on 8 channels | within 10⁻¹²; percentiles exact on linear channels |
| Gating-ML export | all gate types round-tripped through XML | exact |
| Gating-ML export, evaluated by FlowKit | 38 populations on three files: rectangle (with open bounds), 1-D range, polygon (incl. self-intersecting), ellipse (linear and transformed), quadrant, spider, bisector, five levels deep; linear, flin, logicle, arcsinh, hyperlog; no, keyword and CSV-matrix compensation; ties on integer-valued boundaries | **exact** membership of every event; % of parent and of total within 10⁻¹² |
| Population statistics | every population above × every channel × linear and each transform's units (incl. log of compensated values, with non-positive values excluded): n, excluded, mean, SD, CV, median, robust SD/CV, geometric mean, min, max, 5 percentiles; about 28,000 values | within the tolerance of the values' own space (below) |
| Statistics edge cases | n = 0, 1, 2; ties; NaN; zeros and negatives (geometric mean); 10⁹ offset; 10⁻²⁰⁰ and 10³⁰⁰ magnitudes | within 10⁻¹²; percentiles exact |
| Replicate summaries | mean, SD, SEM, 95% CI half-width, median, CV, min, max, grouped by two variables (pandas); t quantiles and CDF for df 1 – 10⁵ (SciPy) | within 10⁻¹² (t distribution 10⁻¹⁰) |
| Formula and normalization columns | log to bases 2, e, 3, 10 and ½; ln, log2, log10, exp, sqrt, abs, min, max, powers, precedence; ratio, percent and difference to reference rows, overall and within a variable | within 10⁻¹⁴ (formulas), 10⁻¹² (normalization) |
| Inverse transforms | logicle (4 parameter sets), hyperlog (2), arcsinh (2), linear (2), log (2) over 60 points of [−0.2, 1.2] | within 10⁻¹⁰ |
| Binning and smoothing | 1-D and 2-D histograms (NumPy) with values on every bin edge, off-scale and NaN; Gaussian smoothing (SciPy, σ = 0.5 – 3.7 bins); histogram count / % of max / fraction; equal-probability and logarithmic contour levels; Scott bandwidth | counts exact; others within 10⁻¹² |
| Gated events as FCS | raw and compensated events of three files written by the app, read by FlowKit | every value exact (float32) |
| End-to-end | gates drawn in the browser on three 8-color samples, exported, re-evaluated by FlowKit | every population count identical |

Property-based tests (fast-check) cover FCS write→read round trips, bitset algebra, logicle
invertibility and monotonicity, spider-gate partitioning, and spider/quadrant equivalence.

## Tolerances

Defined in `packages/testkit/src/index.ts`; a value $a$ matches a reference $b$ when
$|a-b| \le \text{abs} + \text{rel}\cdot\max(|a|,|b|)$.

| Quantity | rel | abs |
|---|---|---|
| Linearized values | 10⁻¹⁴ | 0 |
| Compensated values | 10⁻⁹ | 10⁻⁹ |
| Transformed values | 10⁻¹⁰ | 10⁻¹² |
| Statistics | 10⁻¹² | 10⁻¹² |
| Student's t quantiles and CDF | 10⁻¹⁰ | 10⁻¹² |
| Formula columns | 10⁻¹⁴ | 0 |
| Smoothed densities, contour levels | 10⁻¹² | 10⁻¹⁵ |
| Gate membership | — | exact |

## Known differences from other tools

- **Log-amplified channels:** ≤ 1 ULP differences from FlowKit because `Math.pow` and the C library `pow`
  round differently for some inputs. An event lying within 10⁻¹⁶ of a gate boundary could in principle be
  classified differently; none is in the compliance data.
- **FlowJo biexponential** is not Gating-ML logicle ([Transforms](../methods/transforms)).
- **FlowJo geometric mean** is computed in display space; Flowmeris uses positive values only
  ([Statistics](../methods/statistics)).
- **Spider gates** exported to Gating-ML are approximated by polygons that agree everywhere except
  exactly on the rays.
