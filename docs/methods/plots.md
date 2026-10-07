# Plots

Implementation: `packages/density`, `packages/render`. Tests: `packages/density/src/density.test.ts`,
`packages/render/src/render.test.ts`.

All plots are computed in display (transformed) units and rasterised on the CPU at the screen's pixel
resolution ([ADR-0001](../adr/#adr-0001-cpu-rasterisation-in-workers)). Rendering is deterministic:
identical inputs give byte-identical images.

## M-PLOT-BIN — binning and off-scale events

Events are binned into a grid of one bin per output pixel. Events beyond the displayed range are placed
in the edge bin of that axis ("piled on the axis", the convention of cytometry software), and events with
NaN coordinates (log of non-positive values) are piled on the axis minimum. Both counts are shown under
the plot. They are never silently dropped.

## M-PLOT-SMOOTH — density estimate

Smoothing is a separable Gaussian convolution of the binned counts (a binned kernel density estimate;
Wand 1994), with kernel standard deviation σ in pixels (Display → Smoothing σ; default 1.5 px), truncated
at ±4σ and normalised. Zero padding is used at the plot edges, so mass is lost beyond the displayed
range. That mass is already counted as off-scale.

## Plot types

| Type | Definition |
|---|---|
| **Dot** | every pixel containing ≥ 1 event is drawn in the dot colour (optionally enlarged to 2–4 px) |
| **Pseudocolor** (M-PLOT-PSEUDO) | every pixel containing ≥ 1 event is coloured by $\log(1+\hat f)/\log(1+\hat f_\max)$ of the smoothed density $\hat f$. Isolated events stay visible while dense regions show structure. |
| **Density** (M-PLOT-DENSITY) | the smoothed density image, linear colour scale, cells below 0.5% of the maximum transparent |
| **Contour** | iso-density lines of the smoothed density (marching squares) on a grid of 3-px cells |
| **Histogram** | 1-D counts in 256 bins (64–1024), optionally smoothed (σ = 1.5 bins), normalised to count, mode (% of max) or area |

### M-PLOT-CONTOUR-EQP — equal-probability contours

Cells are sorted by smoothed density; the $k$-th level is the density at which the cumulative mass of the
densest cells first reaches $k\,p$ of the total, for $k = 1 … 1/p - 1$ ($p$ = 2%, 5% or 10%). Each band
between consecutive lines holds ≈ $p$ of the events and the outermost line encloses $1-p$. With
**Show outliers**, events in cells below the outermost level are drawn as dots. These are FlowJo's
semantics for 2%, 5% and 10% contour plots.

### M-PLOT-CONTOUR-LOG — logarithmic contours

The outermost line encloses 98% of events and each line inward encloses half as many as the previous one.

## Colour

The default colour map for density-coded plots is **viridis**: perceptually uniform, readable with
common colour-vision deficiencies, and monotone in lightness. *magma* and *gray* are alternatives.
*classic* (blue→red) reproduces the familiar FlowJo pseudocolour for comparison. It is not perceptually
uniform and can create false boundaries. Population colours use a fixed-order eight-colour palette
validated for colour-vision-deficiency separation, and populations are always also labelled by name.

## Group plots

- **Tiles:** the current plot repeated for every sample in the group, same axes and scales, with each
  sample's effective gates (overrides drawn dashed in orange).
- **Ridge:** one histogram per sample on a shared x axis, each normalised to its own mode, smoothed
  (σ = 1.5 bins) and labelled with its event count. The settings panel on the right sets the fill
  colour (one colour, or the categorical palette, with per-sample overrides), opacity, outline, overlap,
  row height, sample order and labels, tick positions and labels, axis title, font and width. These are
  saved per group and population in the workspace (`layouts`, kind `ridge`); the SVG export inlines
  them.
- **Ridge, combined replicates (M-PLOT-RIDGE-COMBINE):** the *Replicates* card below the population
  tree combines the checked samples sharing the values of the chosen sample variables (e.g. condition
  and dose) into one ridge, sorted by those values. *Average of replicate curves* normalises each
  replicate's smoothed histogram to unit area over the displayed range and averages them, so every
  replicate weighs the same; an optional band shows ±SD or ±SEM (n − 1 denominator) per bin.
  *Pooled events* adds the replicates' counts, so replicates with more events weigh more. Either way
  the combined curve is then scaled to its own mode and n is the replicates' total event count.
  Replicates without events in range are left out of the average. The setting is saved with the ridge
  layout (`combine`); combined ridges keep their own order, colours and labels. The card lists the
  combined ridges: untick one to hide it (`combine.hidden`), or open it with ▸ and untick single
  replicates to leave them out of that ridge's curve, band and n (`combine.exclude`). Shift-click sets a range of rows.

## Export (M-EXPORT-PLOT)

SVG: axes, ticks, labels, gates, contours, histograms and ridges are vector; event rasters are
re-rendered at the export DPI (default 300) and embedded as PNG. Point size and smoothing σ are scaled
with the DPI so the export matches the screen. The SVG embeds a `<metadata>` block with the app version,
sample SHA-256, plot specification and transforms. PNG export renders the same SVG at the chosen DPI and
records the DPI in the PNG `pHYs` chunk.

## References

- Wand MP. Fast computation of multivariate kernel estimators. *J Comput Graph Stat* 1994;3:433–445.
- FlowJo documentation, "Contour Plots", "Pseudocolor Plots".
- Crameri F, Shephard GE, Heron PJ. The misuse of colour in science communication. *Nat Commun* 2020;11:5444.
