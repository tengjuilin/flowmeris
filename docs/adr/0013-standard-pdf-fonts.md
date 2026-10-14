# ADR-0013 Standard fonts in PDF and SVG exports, named, not embedded

**Status.** Accepted. Amends [ADR-0011](./0011-bundled-figure-fonts) and [ADR-0012](./0012-system-font-menu).

**Decision.** A PDF names Arial (the default), Helvetica, Times New Roman, Times, Courier New and Courier
without embedding them (`apps/web/src/lib/export/pdfFonts.ts`). Each face used is written as a font
without a font program: its PostScript name (`ArialMT`, `Arial-BoldMT`, …), WinAnsiEncoding, the
character widths, and a font descriptor. The widths and descriptor are read from the bundled family with
the same widths (Liberation Sans, Serif, Mono, which match Arial, Times New Roman and Courier New exactly
for every WinAnsiEncoding character); the underline is the font's own. The text is drawn with jsPDF's
matching standard font (Helvetica, Times, Courier) given those widths and no kerning, so svg2pdf anchors
it as the browser does. The minus sign (U+2212), which WinAnsiEncoding lacks, is drawn as an en dash
(U+2013). A text with any other character outside WinAnsiEncoding (Greek, for example) is embedded as
before (ADR-0012). Tick exponents in every figure are drawn as raised digits (`SupLabel`), not as Unicode
superscripts, which Arial lacks beyond ³.

SVG files name their fonts (the system font, its bundled fallback, a generic family) without carrying
them. PNG and JPEG still carry the bundled fallbacks as `@font-face`, since an SVG drawn as an image cannot
use the page's fonts; that does not change the size of the image. A PDF also deflates its streams.

**Why.** Embedding made exports large: about 0.5 MB of base64 per face in an SVG, and a font subset per
face in a PDF, for fonts that every computer that opens a figure has (Arial and Times New Roman ship with
Windows and macOS), and that every PDF reader stands in for with metric-compatible fonts where it does
not. Naming the font keeps the figure's text editable as that font in Illustrator or Inkscape. Because
the PDF carries the exact widths, text is placed the same with the real font or a stand-in. Fonts without
a standard PDF font of the same widths (Verdana, Consolas, …) are still embedded, since a reader without
them would lay the text out differently.

**Consequences.** A PDF in Arial no longer asks for permission to read the computer's fonts. Its minus
signs are slightly narrower (556 against 584 thousandths of an em). Glyph shapes in a PDF or SVG are those
of the reader's Arial, or its stand-in where the computer has none. A figure that mixes Arial and Helvetica
names both after the first used (they share jsPDF's Helvetica). A PDF of a figure in Arial is a few
kilobytes plus its event raster, and an SVG no longer grows with the faces it uses.

Browsers' PDF viewers on macOS do not draw Arial. Chrome's (PDFium) maps every name of Arial and Times
New Roman (`ArialMT`, `Arial-BoldMT`, `Arial,Bold`, `Arial Bold`, …) to the standard font Helvetica or
Times, which macOS has. Edge's (powered by Adobe Acrobat) maps them to the standard fonts too, and draws
those in Adobe Sans MM and Adobe Serif MM, the multiple master fonts it carries, stretched to the PDF's
widths; only names it does not know as standard (`Arial-Regular`) reach the computer's Arial. Text keeps
its place in both, since the PDF carries Arial's widths. No name avoids this: Preview and Safari find
Arial only by its PostScript or full name, so `Arial-Regular` is drawn in another font there, and naming
the standard font (`Helvetica`) has them draw Helvetica too. Only embedding the font would change it.
