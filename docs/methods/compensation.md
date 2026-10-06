# Compensation

Implementation: `packages/compensation`. Tests: `packages/compensation/src/compensation.test.ts`.

## M-COMP-MODEL

Observed detector signals $\mathbf{o}$ (row vector over $n$ detectors) arise from the true
fluorochrome signals $\mathbf{t}$ through the spillover matrix $S$:

$$\mathbf{o} = \mathbf{t}\,S, \qquad S_{ij} = \text{fraction of fluorochrome } i\text{'s signal seen in detector } j,$$

so the compensated values are

$$\mathbf{t} = \mathbf{o}\,S^{-1}.$$

This is the Gating-ML 2.0 `spectrumMatrix` convention and the FCS `$SPILLOVER` layout (rows =
fluorochromes, columns = detectors). Compensation acts on **linearised** values (after
[M-FCS-LIN](./fcs#m-fcs-lin-linearisation)) and before any display transform. Channels that are not part
of the matrix (scatter, time, unlisted detectors) pass through unchanged.

## M-COMP-PARSE — sources of a matrix

A group's compensation setting is one of:

| Setting | Matrix used for each sample |
|---|---|
| None | identity (uncompensated) |
| Each sample's `$SPILLOVER` | the sample's own keyword; samples without one are uncompensated |
| A named matrix | one matrix for every sample: imported from CSV, or an edited copy of a keyword matrix |

Keyword precedence: `$SPILLOVER`, `$SPILL`, `SPILL`, `SPILLOVER`, `$COMP`, `COMP`. The value is
`n, det₁…detₙ, s₁₁, s₁₂, …, sₙₙ` (row-major). CSV import expects a header row of detector names followed
by $n$ rows of $n$ numbers (FlowJo/FlowKit layout). Detector names are matched to `$PnN` exactly, then
case-insensitively.

## M-COMP-INV — inversion

$S^{-1}$ is computed in float64 by LU decomposition with partial pivoting (the LAPACK `getrf`/`getri`
algorithm family that NumPy uses). Each compensated value is accumulated as
$t_j = \sum_i o_i\,(S^{-1})_{ij}$ in matrix-row order.

## M-COMP-COND — conditioning

The app reports the 1-norm condition number $\kappa_1(S) = \lVert S\rVert_1 \lVert S^{-1}\rVert_1$ and
warns when $\kappa_1 > 10^3$: relative errors in the spillover values can then be amplified up to a
thousand-fold in compensated data.

## Recommended checks

Inspect compensation on bivariate plots of every pair of fluorescence channels before gating
(Cossarizza et al. 2021), looking for "leaning" populations (under-compensation) and super-negative
events (over-compensation). Edited matrices highlight the cells that differ from their source.

## References

- Bagwell CB, Adams EG. Fluorescence spectral overlap compensation for any number of flow cytometry parameters. *Ann N Y Acad Sci* 1993;677:167–184.
- Roederer M. Spectral compensation for flow cytometry: visualization artifacts, limitations, and caveats. *Cytometry* 2001;45:194–205.
- Spidlen J, Moore W, ISAC Data Standards Task Force, Brinkman RR. ISAC's Gating-ML 2.0 data exchange standard for gating description. *Cytometry A* 2015;87:683–687.
- Cossarizza A, et al. Guidelines for the use of flow cytometry and cell sorting in immunological studies (third edition). *Eur J Immunol* 2021;51:2708–3145.
