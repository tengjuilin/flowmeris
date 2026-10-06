# Validation

flowmeris is tested against independent reference implementations. All tests run in CI on every change
(`pnpm test`).

## Reference implementations

| Reference | Version | Used for |
|---|---|---|
| FlowKit (Python; Gating-ML 2.0 compliant) | 1.2.3, with FlowIO 1.3.0 and FlowUtils | FCS parsing and linearisation, compensation, transforms |
| NumPy | 1.26.4 | statistics |
| ISAC Gating-ML 2.0 compliance suite | as distributed with FlowKit | gates, transforms, compensation, Boolean logic |

Golden values are produced by `tools/golden/python/generate.py` in an environment pinned by `uv.lock`.
`fixtures/golden/golden-manifest.json` records the exact versions. Test files and their licences are
listed in `fixtures/PROVENANCE.md`.

## Results

| Area | Test | Agreement |
|---|---|---|
| FCS parsing + linearisation | 10 files (FCS 2.0, 3.0, 3.1; integer, float, log-amplified, gain, 290k-event 8-colour) | event count and channel names exact; sampled rows, column sums, minima and maxima within 10⁻¹⁴ relative |
| Files FlowKit cannot read | multi-dataset `$NEXTDATA` file; files with malformed keywords | all datasets parsed, issues reported as warnings |
| Compensation | `$SPILLOVER` (8 colours) and external CSV matrix | within 10⁻⁹ relative |
| Transforms | logicle (6 parameter sets), hyperlog (3), arcsinh (3), linear (2), log (2) over 108 points each, including negatives and values above T | within 10⁻¹⁰ relative |
| Gating | **Gating-ML 2.0 compliance suite**: 51 reference gates on `data1.fcs` (rectangles, ranges, polygons incl. non-simple, ellipses, 3-D ellipsoid, quadrants, ratio transforms, all transforms, spectrum matrices, Boolean and/or/not, parent references) | **exact**: 0 mismatching events of 13,367 for every gate |
| Engine | gates defined through the app's data model, evaluated via the engine | exact against the ISAC truth files |
| Statistics | mean, SD, median, min, max, geometric mean, 9 percentiles on 8 channels | within 10⁻¹²; percentiles exact on linear channels |
| Gating-ML export | all gate types round-tripped through XML | exact |
| End-to-end | gates drawn in the browser on three 8-colour samples, exported, re-evaluated by FlowKit | every population count identical |

Property-based tests (fast-check) cover FCS write→read round trips, bitset algebra, logicle
invertibility and monotonicity, spider-gate partitioning, and spider/quadrant equivalence.

## Tolerances

Defined in `packages/testkit/src/index.ts`; a value $a$ matches a reference $b$ when
$|a-b| \le \text{abs} + \text{rel}\cdot\max(|a|,|b|)$.

| Quantity | rel | abs |
|---|---|---|
| Linearised values | 10⁻¹⁴ | 0 |
| Compensated values | 10⁻⁹ | 10⁻⁹ |
| Transformed values | 10⁻¹⁰ | 10⁻¹² |
| Statistics | 10⁻¹² | 10⁻¹² |
| Gate membership | — | exact |

## Known differences from other tools

- **Log-amplified channels:** ≤ 1 ULP differences from FlowKit because `Math.pow` and the C library `pow`
  round differently for some inputs. An event lying within 10⁻¹⁶ of a gate boundary could in principle be
  classified differently; none is in the compliance data.
- **FlowJo biexponential** is not Gating-ML logicle ([Transforms](../methods/transforms)).
- **FlowJo geometric mean** is computed in display space; flowmeris uses positive values only
  ([Statistics](../methods/statistics)).
- **Spider gates** exported to Gating-ML are approximated by polygons that agree everywhere except
  exactly on the rays.
