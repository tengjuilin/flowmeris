# Statistics

Implementation: `packages/stats`, `packages/engine` (`stats()`). Tests: `packages/stats/src/stats.test.ts`.

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
flowmeris uses the textbook definition on positive values and reports how many values were excluded.
For compensated data with many non-positive values, prefer the median.
:::

"MFI" is not a single statistic; report which one (median recommended) and in which units. Exports state
the statistic, channel, marker (`$PnS`), units ("linear" or a transform definition) and compensation used.

## Validation

On every channel of the Gating-ML reference file `data1.fcs` the mean, SD, median, min, max, geometric
mean and nine percentiles agree with NumPy 1.26 to a relative 10⁻¹². Percentiles agree **exactly** on
linear channels; log-amplified channels can differ in the last bit because of `pow`
([M-FCS-LIN](./fcs#m-fcs-lin-linearisation)).

## References

- Hyndman RJ, Fan Y. Sample quantiles in statistical packages. *Am Stat* 1996;50:361–365.
- FlowJo documentation, "Definition of Statistics" (robust CV, robust SD).
