# ADR-0012 System fonts in the font menu, bundled fonts as fallbacks

**Status.** Accepted. Amends [ADR-0011](./0011-bundled-figure-fonts).

**Decision.** The font menu lists system fonts by name: Arial (the default of plots, ridge plots and
charts), Helvetica, Times New Roman, Trebuchet MS, Verdana and Consolas, then *Other installed font…*.
Fonts saved by earlier versions that are not in the menu (Calibri, Tahoma, Georgia, Palatino, Garamond,
Courier New, and the generic serif and monospace choices) stay what they are and are listed while a figure
uses one; a chart saved with the old default `sans` is drawn in Arial. The bundled open fonts of ADR-0011
are no longer choices: each system font has one as its fallback (`FONTS` in
`apps/web/src/lib/fonts/catalog.ts`), with its proportions where one exists (Liberation Sans for Arial and
Helvetica, Liberation Serif for Times New Roman, Liberation Mono for Courier New, Carlito for Calibri,
Gelasio for Georgia).

On screen, a figure is drawn in the system font, or in its fallback where the font is not installed. A PDF
embeds the system font where the browser can read it (Chromium, once the user allows it), else its
fallback; SVG files carry the fallback as `@font-face`, so they keep their layout where the system font is
missing. When a PDF uses a fallback, the app shows a warning naming the fonts it replaced.

**Why.** Users choose fonts by the names journals and colleagues ask for (Arial, Helvetica, Times New
Roman), and expect those fonts, not look-alikes, in their figures. ADR-0011 made every figure identical
everywhere by drawing only bundled fonts, but at the cost of never using the real Arial. With the system
font first and a metric-compatible fallback second, a figure looks as asked where the font is available,
keeps its layout where it is not, and the user is told whenever an export differs from the screen.

**Consequences.** The screen and a PDF can differ in glyph shapes (not widths, for the metric-compatible
fallbacks) when the PDF is made outside Chromium: the warning says so. Inter is no longer used and is no
longer fetched.
