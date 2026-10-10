# Statistics

Implementation: `packages/stats` (`summary.ts`, `percentile.ts`, `tdist.ts`), `packages/engine` (`handlers/stats.ts`). Tests: `packages/stats/src/stats.test.ts`.

Statistics are computed on the events of a population, by default in **linear, compensated** units
(the group's compensation setting). NaN values are excluded and counted in `n_excluded`.

## Frequencies

| Statistic | Definition |
|---|---|
| Count | number of events in the population |
| % Parent | $100 \cdot n / n_\text{parent}$ |
| % Grandparent | $100 \cdot n / n_\text{grandparent}$; NaN for populations directly under *All events* |
| % Total | $100 \cdot n / n_\text{all events}$ |

## Location and spread

| Statistic | Definition |
|---|---|
| Mean | $\bar x = \frac1n\sum x_i$, summed with Neumaier compensated summation |
| SD | $\sqrt{\frac{1}{n-1}\sum (x_i - \bar x)^2}$ (two-pass) |
| CV | $100 \cdot \mathrm{SD} / \bar x$ (%) |
| Median | middle order statistic; mean of the two middle values when $n$ is even (as `numpy.median`) |
| Percentile $p$ | Hyndman & Fan type 7 ("linear", NumPy default): $h = (n-1)\,p/100$, $Q = x_{(\lfloor h\rfloor)} + (h - \lfloor h\rfloor)(x_{(\lfloor h\rfloor+1)} - x_{(\lfloor h\rfloor)})$, using NumPy's two-sided interpolation for exactness at the ends |
| Robust SD | $\tfrac12\,(P_{84.13} - P_{15.87})$ (FlowJo definition) |
| Robust CV | $100 \cdot \mathrm{rSD} / \mathrm{median}$ (%) (FlowJo definition) |
| Geometric mean | $\exp\bigl(\frac1k\sum \ln x_i\bigr)$ over the $k$ values with $x_i > 0$; the others are counted in `n_excluded` |
| Min / Max | extreme order statistics |

For a normal distribution, $P_{84.13} - P_{15.87} \approx 2\sigma$, so the robust SD estimates $\sigma$
and is insensitive to outliers.

::: warning Geometric mean differs between tools
FlowJo computes the geometric mean "in graph space" so that it is defined for zero and negative values.
Flowmeris uses the textbook definition on positive values and reports how many values were excluded.
For compensated data with many non-positive values, prefer the median.
:::

"MFI" is not a single statistic; report which one (median recommended) and in which units. Exports state
the statistic, channel, marker (`$PnS`), units ("linear" or a transform definition) and compensation used.

## Derived columns

Implementation: `packages/table`. Tests: `packages/table/src/table.test.ts`.

**M-STAT-EXPR — formulas.** A formula is evaluated per row by a recursive-descent parser (no code
evaluation): numbers, `+ − * / ^` (`^` binds tighter than unary minus and associates to the right, so
`-2^2 = −4` and `2^3^2 = 512`), parentheses, `log ln log2 log10 exp sqrt abs min max`, and column references
`[header]`. `ln(x)` is the natural logarithm; `log(x, b)` is the logarithm to base
$b$, computed as $\ln x / \ln b$. A missing or non-numeric input gives NaN; division by zero follows IEEE 754 (±Inf, NaN).

**M-STAT-NORM — normalisation.** For a row $i$ and source column $x$, the reference is

$$r_i = \frac{1}{|R_i|}\sum_{j \in R_i} x_j,$$

where $R_i$ are the rows whose reference variable equals the reference value and whose *within*
variables equal row $i$'s, keeping only finite $x_j$. Ratio $x_i / r_i$, percent $100\,x_i / r_i$,
difference $x_i - r_i$. With no reference rows the result is NaN.

## Combining replicates (M-STAT-AGG)

Rows are grouped by the values of the chosen variables; an empty value forms its own group. For each
numeric column, over the group's $k$ finite values:

| Summary | Definition |
|---|---|
| Mean | $\bar x$ (compensated summation) |
| SD | $s = \sqrt{\frac{1}{k-1}\sum (x_i - \bar x)^2}$; NaN for $k < 2$ |
| SEM | $s / \sqrt{k}$ |
| 95% CI | half-width $t_{0.975,\,k-1} \cdot s / \sqrt{k}$ (Student's *t*; the interval is mean ± half-width) |
| CV | $100\, s / \bar x$ (%) |
| Median, min, max | as for event statistics |
| n | rows in the group |

Student's *t* quantiles are computed by bisection on the upper tail $\tfrac12 I_{\nu/(\nu+t^2)}(\nu/2, \tfrac12)$,
with the regularised incomplete beta function evaluated by its continued fraction. Its log-beta prefactor
uses exact ln Γ recurrences, except for many degrees of freedom (ν ≥ 60), where ln Γ(ν/2 + ½) − ln Γ(ν/2)
comes from Stirling's series to avoid cancellation. Quantiles and the CDF agree with `scipy.stats.t` to
10⁻¹⁰ for ν = 1 – 10⁵. Chart error bars use the same definitions over the samples that share an
x value and series.

## Validation

On every channel of the Gating-ML reference file `data1.fcs` the mean, SD, median, min, max, geometric
mean and nine percentiles agree with NumPy 1.26 to a relative 10⁻¹². Percentiles agree **exactly** on
linear channels; log-amplified channels can differ in the last bit because of `pow`
([M-FCS-LIN](./fcs#m-fcs-lin-linearisation)).

## References

- Hyndman RJ, Fan Y. Sample quantiles in statistical packages. *Am Stat* 1996;50:361–365.
- FlowJo documentation, "Definition of Statistics" (robust CV, robust SD).
