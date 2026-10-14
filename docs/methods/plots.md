# Plots

Implementation: `packages/density` (ridge replicates: `combine.ts`), `packages/render`. Tests:
`packages/density/src/density.test.ts`, `packages/density/src/combine.test.ts`,
`packages/render/src/render.test.ts`.

All plots are computed in display (transformed) units and rasterised on the CPU at the screen's pixel
resolution ([ADR-0001](../adr/0001-cpu-rasterisation)). Rendering is deterministic:
identical inputs give byte-identical images.

A plot looks the same at every size, on every screen and in every export: the density is estimated on a
fixed grid, and sizes (points, outliers, contour lines) are px of a plot whose plot area is 400 px wide
(`REFERENCE_PLOT_PX`), scaled with the plot's width. A plot drawn 200 px wide draws a 3-px point 1.5 px
wide; on a 2× screen, or exported at 192 dpi, it draws it 3 device px wide. Only the sharpness changes.
Text, ticks and the plot frame keep their own sizes in px.

## M-PLOT-BIN — binning and off-scale events

Events are binned into a fixed grid of 256 × 256 bins over the displayed ranges, whatever the plot's
size; the density, the pseudocolor colors and the contours come from this grid. Points are drawn where
image pixels hold events (a second binning, one bin per pixel). Events beyond the displayed range are
placed in the edge bin of that axis ("piled on the axis", the convention of cytometry software), and
events with NaN coordinates (log of non-positive values) are piled on the axis minimum. Both counts are
shown under the plot. They are never silently dropped.

## M-PLOT-SMOOTH — density estimate

Smoothing is a separable Gaussian convolution of the binned counts (a binned kernel density estimate;
Wand 1994), truncated at ±4σ and normalized. The kernel standard deviation σ is a percentage of each axis's
displayed range (Display → Smoothing σ; default 0.5%, i.e. 1.28 bins; 0–10%), so the same bandwidth is
used at every plot size, and the bandwidth is the same fraction of both axes. Density, contour and zebra
plots smooth by at least one bin. Zero padding is used at the plot edges, so mass is lost beyond the
displayed range. That mass is already counted as off-scale. The density at an image pixel is the grid's
value interpolated bilinearly at the pixel's center, each bin's value placed at the bin's center (as
marching squares places it).

## Plot types

| Type | Definition |
|---|---|
| **Dot** | every pixel containing ≥ 1 event is drawn in the dot color, as a point of Display → Point size (default 3 px; 0.25–10 px, at the reference width) |
| **Pseudocolor** (M-PLOT-PSEUDO) | every pixel containing ≥ 1 event is colored by $\log(1+\hat f)/\log(1+\hat f_\max)$ of the smoothed density $\hat f$. Isolated events stay visible while dense regions show structure. Points are 3 px by default, as for dot plots. |
| **Density** (M-PLOT-DENSITY) | the smoothed density image, linear color scale, cells below 0.5% of the maximum transparent |
| **Contour** | iso-density lines of the smoothed density (marching squares on the density grid), Display → Line width (default 1 px at the reference width) and Line color (default: the theme's) |
| **Zebra** (M-PLOT-ZEBRA) | the contour plot with each band between its lines filled by its own gradient, from the outer color at its outer line to the inner color at its inner line |
| **Histogram** | 1-D counts in 256 bins (64–1024), optionally smoothed (σ = 1.5 bins). The y axis (picked on its title or in Display) shows **Count** (events per bin), **% of max** (heights over the highest bin; FlowJo's "normalized to mode") or **Fraction** (heights over their sum, i.e. unit area) |

### M-PLOT-CONTOUR-EQP — equal-probability contours

Cells are sorted by smoothed density; the $k$-th level is the density at which the cumulative mass of the
densest cells first reaches $k\,p$ of the total, for $k = 1 … 1/p - 1$ ($p$ = 2%, 5% or 10%). Each band
between consecutive lines holds ≈ $p$ of the events and the outermost line encloses $1-p$. With
**Show outliers**, pixels holding events where the density is below the outermost level are drawn as
points of Display → Outlier size (default 2 px at the reference width) and Outlier color (default
black). These are FlowJo's semantics for 2%, 5% and 10% contour plots.

### M-PLOT-CONTOUR-LOG — logarithmic contours

The outermost line encloses 98% of events and each line inward encloses half as many as the previous one.

### M-PLOT-ZEBRA — zebra plots

FlowJo's zebra plot: a contour plot (same density, same levels, same lines and outliers) whose bands are
filled, each with its own gradient, so the fill shows density within each band as well as the band
itself. With ascending levels $L_1 … L_n$ and $L_{n+1} = \max \hat f$, a pixel whose density (above) is
$L_k \le \hat f < L_{k+1}$ is in band $k$ and takes the color $(1-t)\,c_\text{outer} + t\,c_\text{inner}$
with $t = (\hat f - L_k)/(L_{k+1} - L_k)$, mixed per RGB channel: every band starts at the **Outer color**
on its outer line (default black) and reaches the **Inner color** (default white) at its inner line,
where the next band starts again. Pixels below $L_1$ stay empty. **Contour lines** (on by default) draws
the contour plot's lines over the bands. The color map is not used.

## Color

The default color map for density-coded plots is **viridis**: perceptually uniform, readable with
common color-vision deficiencies, and monotone in lightness. *magma* and *gray* are alternatives.
*classic* (blue→red) reproduces the familiar FlowJo pseudocolor for comparison. It is not perceptually
uniform and can create false boundaries. Population colors use a fixed-order eight-color palette
validated for color-vision-deficiency separation, and populations are always also labeled by name.

## Group plots

- **Tiles:** the current plot repeated for every sample in the group, same axes and scales, with each
  sample's effective gates (overrides drawn dashed in orange).
- **Ridge:** one histogram per sample on a shared x axis, each normalized to its own mode, smoothed
  (σ = 1.5 bins) and labeled with its event count. The settings panel on the right sets the fill
  color (one color, or the categorical palette, with per-sample overrides), opacity, outline, overlap,
  row height, sample order and labels, tick positions and labels, axis title, font and width. These are
  saved per group and population in the workspace (`layouts`, kind `ridge`); the SVG export inlines
  them.
- **Ridge, combined replicates (M-PLOT-RIDGE-COMBINE):** the *Replicates* card below the population
  tree combines the checked samples sharing the values of the chosen sample variables (e.g. condition
  and dose) into one ridge, sorted by those values. *Average of replicate curves* normalizes each
  replicate's smoothed histogram to unit area over the displayed range and averages them, so every
  replicate weighs the same; an optional band shows ±SD or ±SEM (n − 1 denominator) per bin.
  *Pooled events* adds the replicates' counts, so replicates with more events weigh more. Either way
  the combined curve is then scaled to its own mode and n is the replicates' total event count.
  Replicates without events in range are left out of the average. By default the settings are shared by
  all populations of the group (`ridgeCombine`), so switching the gate keeps the same grouping, hidden
  ridges and excluded replicates; untick *Same settings for all populations* (`ridgeFollow`) to give each
  population its own copy, saved with its ridge layout (`combine`). Combined ridges keep their own order, colors and labels. The card lists the
  combined ridges: untick one to hide it (`combine.hidden`), or open it with ▸ and untick single
  replicates to leave them out of that ridge's curve, band and n (`combine.exclude`). Shift-click sets a range of rows.

## Export (M-EXPORT-PLOT)

Every figure is exported by one pipeline (`apps/web/src/lib/export`): the figure is built as a
standalone SVG (the on-screen SVG with its computed styles inlined and on-screen-only parts removed),
laid out, and written in the chosen format.

SVG: axes, ticks, labels, gates, contours, histograms and ridges are vector; event rasters are
re-rendered at the export DPI (default 300) and embedded as PNG; being relative to the plot's width and
axes, they are the on-screen picture, sharper. A plot's SVG embeds a `<metadata>` block with the app
version, sample SHA-256, plot specification and transforms. PNG and JPEG render the same SVG at the chosen
DPI (the SVG's px are 1/96 in); PNG records the DPI in its `pHYs` chunk. PDF converts the SVG to vector
PDF (jsPDF and svg2pdf) on a page of the figure's size, 1 px = 0.75 pt, so text keeps its size. Text
features svg2pdf does not draw are rewritten first, measured from the browser's layout: a text on a
middle (or other non-alphabetic) baseline is moved by the shift the baseline gave it; an underline is drawn
as a rectangle in the text's color, as thick as the font's underline, its top at the font's underline
position but at least half its thickness (rounded up, ≥ 1 px) below the baseline, as Chromium draws it; a
text halo is drawn as a stroked copy behind the text.

Fonts (ADR-0011, ADR-0012, ADR-0013): figure text is set in a system font, with a bundled TrueType font of
the same proportions as its fallback, drawn without kerning or ligatures; tick exponents are raised digits
at 0.7 times the tick size. The PDF names Arial, Helvetica, Times New Roman, Times, Courier New and Courier
without embedding them: each face is written with its PostScript name, WinAnsiEncoding, and the character
widths and descriptor of the bundled font with the same widths (Liberation), and the minus sign is drawn as
an en dash. Other text embeds each face used: the system font's where the browser can read it, else the
fallback's (and the user is warned). The PDF's streams are deflated. SVG files name the fonts without
carrying them; PNG and JPEG carry the fallbacks as `@font-face` data URLs. Text widths, and so anchoring
and wrapping, match the screen in every format.

## References

- Wand MP. Fast computation of multivariate kernel estimators. *J Comput Graph Stat* 1994;3:433–445.
- FlowJo documentation, "Contour Plots", "Pseudocolor Plots", "Zebra Plots".
- Crameri F, Shephard GE, Heron PJ. The misuse of color in science communication. *Nat Commun* 2020;11:5444.
