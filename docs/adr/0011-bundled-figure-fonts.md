# ADR-0011 Bundled figure fonts

**Status.** Accepted.

**Decision.** Figures are set only in fonts the app bundles: open-licensed TrueType families, each with
regular, bold, italic and bold italic faces (`apps/web/src/lib/fonts/catalog.ts`). The page draws them as
web fonts, and every export embeds the same files: the PDF as embedded TrueType fonts, SVG files and the
SVG that PNG and JPEG are drawn from as `@font-face` data URLs. Figure text is drawn without kerning or
ligatures, as jsPDF draws it. The font menu names the bundled family and what it stands in for (for
example "Liberation Serif (Times New Roman metrics)"); font ids saved by earlier versions map to the
nearest bundled family (`FONT_ALIASES`).

The files are not in git. `tools/fetch-fonts.mjs` downloads them unmodified from their upstream releases,
checks each against the SHA-256 in `tools/fonts.lock.json`, and writes them, with their licenses, to
`apps/web/src/assets/fonts` (ignored by git). It runs on install (only warning when offline), before
`dev`, and before `build` (failing if a file is missing), and in CI.

A font installed on the computer ("Other installed font…") is still allowed. Its PDF embeds it where the
browser can read installed fonts (Chromium's Local Font Access, after the user allows it, TrueType outlines
only); otherwise the PDF, like the screen without that font, uses the bundled Liberation Sans, and the user
is told.

**Why.** A PDF can only show a font it embeds, and a browser can read the fonts installed on the computer
only in Chromium, with a permission prompt, and not every format (collections, CFF outlines). System
fonts also differ between computers, so the same figure was laid out differently on each. Drawing figures
in fonts the app ships makes the screen, the PDF, the SVG and the PNG agree in every browser: same
glyphs, same advance widths, so labels wrap and anchor the same. Turning off kerning and ligatures removes
the one remaining difference, since jsPDF applies neither.

Liberation (Sans, Serif, Mono) and Carlito are metric-compatible with Arial and Helvetica, Times New Roman,
Courier New and Calibri, so figures keep the proportions they had in those fonts. Liberation and Carlito
have Reserved Font Names under the SIL Open Font License, so a modified copy (a subset) could not keep their
names; shipping every file unmodified avoids that, and fetching them keeps 17 MB of binaries out of the
repository. Fonts under copyleft licenses that do not cover embedding in SVG (the URW base 35 fonts, AGPL)
are not used, so an exported figure carries no obligations beyond the fonts' own licenses (OFL, Bitstream
Vera).

**Consequences.** Exported SVG files are larger (each embedded face adds about 0.3–1 MB of base64). The
first figure in a font downloads its faces (about 0.3–0.8 MB each); text measured before then is measured
again when they arrive (`useFontsLoaded`). A family without all four faces cannot be added: a PDF cannot
synthesize bold or italic, so it would not match the screen (`lib/fonts/catalog.test.ts` checks this).
