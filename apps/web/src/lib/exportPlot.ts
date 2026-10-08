import type { PlotSpec } from '@flowmeris/model';
import type { PlotHandle } from '../components/PlotCanvas.tsx';
import { pool } from '../engine-client/pool.ts';
import { APP_INFO, contextFor, toast, useStore } from '../state/store.ts';
import { download, encodePngCompressed, safeName } from './download.ts';

/**
 * Plot export (method M-EXPORT-PLOT). Axes, gates, labels, contours and
 * histograms are exported as vector SVG; event rasters (dot / pseudocolor /
 * density) are re-rendered at the requested DPI and embedded as PNG.
 */

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'paint-order',
];

function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const parts = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((s) => !s.endsWith(':'));
  dst.setAttribute('style', parts.join(';'));
  dst.removeAttribute('class');
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i]!, dst.children[i]!);
}

/** Serialise an on-screen SVG as a standalone file, with its CSS-derived styles inlined. */
export function standaloneSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
  return new XMLSerializer().serializeToString(clone);
}

/** Draw an on-screen SVG onto a canvas at `dpi` (the SVG's px are 96 dpi); `background` fills first. */
async function svgToCanvas(svg: SVGSVGElement, dpi: number, background?: string) {
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = dpi / 96;
  const url = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rasterise an on-screen SVG to a PNG at `dpi` (the SVG's px are 96 dpi). */
export async function svgToPng(svg: SVGSVGElement, dpi: number): Promise<Uint8Array> {
  const { canvas, ctx } = await svgToCanvas(svg, dpi);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodePngCompressed(data, canvas.width, canvas.height, dpi);
}

/** Rasterise an on-screen SVG to a JPEG (white background) at `dpi`. */
export async function svgToJpeg(
  svg: SVGSVGElement,
  dpi: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { canvas } = await svgToCanvas(svg, dpi, '#ffffff');
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', 0.95),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

interface LocalFont {
  family: string;
  style: string;
  blob(): Promise<Blob>;
}

let localFonts: Promise<LocalFont[]> | undefined;

/** Fonts installed on this computer (Chromium's Local Font Access API); empty when unavailable or denied. */
function installedFonts(): Promise<LocalFont[]> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  if (!q) return Promise.resolve([]);
  localFonts ??= q.call(window).catch(() => {
    localFonts = undefined;
    return [];
  });
  return localFonts;
}

const STANDARD_PDF_FONT = { 'sans-serif': 'helvetica', serif: 'times', monospace: 'courier' } as const;

function genericOf(families: string[]): keyof typeof STANDARD_PDF_FONT {
  for (let i = families.length - 1; i >= 0; i--) {
    const f = families[i]!.toLowerCase();
    if (f in STANDARD_PDF_FONT) return f as keyof typeof STANDARD_PDF_FONT;
  }
  return 'sans-serif';
}

function fontStyleName(bold: boolean, italic: boolean) {
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
}

/** The installed face of `family` with the requested weight and slant, as TrueType bytes jsPDF can embed. */
async function findTrueType(all: LocalFont[], family: string, bold: boolean, italic: boolean) {
  const want = family.toLowerCase();
  const faces = all.filter((f) => f.family.toLowerCase() === want);
  const isBold = (f: LocalFont) => /\bbold\b/i.test(f.style) && !/semi|demi|extra|ultra/i.test(f.style);
  const isItalic = (f: LocalFont) => /italic|oblique/i.test(f.style);
  const face = faces.find((f) => isBold(f) === bold && isItalic(f) === italic);
  if (!face) return undefined;
  const bytes = new Uint8Array(await (await face.blob()).arrayBuffer());
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  // jsPDF embeds TrueType outlines only (not CFF "OTTO" or collections "ttcf").
  if (tag !== '\0\x01\0\0' && tag !== 'true') return undefined;
  return bytes;
}

/**
 * Point each <text> at a font the PDF actually has: the installed face the figure's font stack resolves to
 * (embedded), else the standard PDF font of the same kind. Returns the families that had to be substituted.
 */
async function embedFonts(root: SVGSVGElement, pdf: import('jspdf').jsPDF): Promise<string[]> {
  const all = await installedFonts();
  const registered = new Set<string>();
  const substituted = new Set<string>();
  for (const t of Array.from(root.querySelectorAll('text, tspan'))) {
    const st = (t as SVGElement).style;
    const families = st.fontFamily
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (!families.length) continue;
    const bold = Number(st.fontWeight) >= 600 || st.fontWeight === 'bold';
    const italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique';
    const style = fontStyleName(bold, italic);
    let chosen: string | undefined;
    for (const fam of families) {
      if (fam.toLowerCase() in STANDARD_PDF_FONT) break;
      const key = `${fam}|${style}`;
      if (registered.has(key)) {
        chosen = fam;
        break;
      }
      const bytes = await findTrueType(all, fam, bold, italic);
      if (!bytes) continue;
      const file = `${fam}-${style}.ttf`;
      pdf.addFileToVFS(file, bytesToBase64(bytes));
      pdf.addFont(file, fam, style);
      registered.add(key);
      chosen = fam;
      break;
    }
    if (chosen) st.fontFamily = `"${chosen}"`;
    else {
      st.fontFamily = STANDARD_PDF_FONT[genericOf(families)];
      substituted.add(families[0]!);
    }
  }
  return [...substituted];
}

/** A one-page vector PDF of an on-screen SVG: paths and text stay vector, with fonts embedded where possible. */
export async function svgToPdf(svg: SVGSVGElement): Promise<Blob> {
  // Ask for installed fonts first, while the click that started the export still counts as a user gesture.
  const fonts = installedFonts();
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js'), fonts]);
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  // svg2pdf reads layout from the DOM, so render the standalone copy off-screen.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  host.innerHTML = standaloneSvg(svg);
  document.body.appendChild(host);
  try {
    const el = host.firstElementChild as SVGSVGElement;
    const pdf = new jsPDF({
      unit: 'px',
      format: [w, h],
      orientation: w >= h ? 'landscape' : 'portrait',
      hotfixes: ['px_scaling'],
    });
    const substituted = await embedFonts(el, pdf);
    await svg2pdf(el, pdf, { x: 0, y: 0, width: w, height: h });
    if (substituted.length)
      toast(
        `PDF used a standard font in place of ${substituted.join(', ')} (not embeddable from this browser).`,
      );
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

export type ImageFormat = 'svg' | 'png' | 'jpeg' | 'pdf';

/** Export an on-screen SVG figure as `format`; `dpi` applies to PNG and JPEG only (SVG and PDF are vector). */
export async function exportSvgFigure(
  svg: SVGSVGElement,
  format: ImageFormat,
  baseName: string,
  dpi: number,
) {
  const name = safeName(baseName);
  if (format === 'svg') return download(`${name}.svg`, standaloneSvg(svg), 'image/svg+xml');
  if (format === 'png') return download(`${name}.png`, await svgToPng(svg, dpi), 'image/png');
  if (format === 'pdf') return download(`${name}.pdf`, await svgToPdf(svg), 'application/pdf');
  download(`${name}.jpg`, (await svgToJpeg(svg, dpi)).bytes, 'image/jpeg');
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function hiResRaster(plot: PlotSpec, pw: number, ph: number, scale: number) {
  const st = useStore.getState();
  const g = st.ws.groups.find((x) => x.id === st.ui.groupId)!;
  const sampleId = st.ui.sampleId && g.sampleIds.includes(st.ui.sampleId) ? st.ui.sampleId : g.sampleIds[0]!;
  const style = {
    ...plot.style,
    pointPx: Math.min(10 * scale, plot.style.pointPx * scale),
    smoothSigmaBins: plot.style.smoothSigmaBins * scale,
  };
  return pool.raster(contextFor(st.ws, g), {
    sampleId,
    plot: { ...plot, style },
    width: Math.round(pw * scale),
    height: Math.round(ph * scale),
    dotColor: '#222222',
  });
}

async function buildSvg(h: PlotHandle, plot: PlotSpec, dpi: number): Promise<string> {
  if (!h.svg) throw new Error('Plot not ready');
  const { width, height, margin } = h.size;
  const pw = width - margin.l - margin.r;
  const ph = height - margin.t - margin.b;
  const clone = h.svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(h.svg, clone);
  clone.querySelectorAll('[data-handle], .draft, .draft-vertex').forEach((n) => n.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.removeAttribute('style');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  if (plot.kind !== 'histogram') {
    const r = await hiResRaster(plot, pw, ph, dpi / 96);
    const png = await encodePngCompressed(r.rgba, r.width, r.height, dpi);
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('x', String(margin.l));
    img.setAttribute('y', String(margin.t));
    img.setAttribute('width', String(pw));
    img.setAttribute('height', String(ph));
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('href', `data:image/png;base64,${bytesToBase64(png)}`);
    clone.insertBefore(img, bg.nextSibling);
  }
  const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  const st = useStore.getState();
  meta.textContent = JSON.stringify({
    generator: `Flowmeris ${APP_INFO.version} (${APP_INFO.commit})`,
    sample: st.ws.samples[st.ui.sampleId ?? '']?.sha256,
    plot,
    transforms: {
      x: st.ws.transforms[plot.x.transform],
      y: plot.y ? st.ws.transforms[plot.y.transform] : undefined,
    },
    rasterDpi: dpi,
  });
  clone.insertBefore(meta, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

/**
 * Export a Gate-view plot. SVG is written as built; PNG, JPEG and PDF render that SVG (axes and gates stay
 * vector in the PDF, the event raster is embedded at `dpi`).
 */
export async function exportPlot(
  h: PlotHandle,
  plot: PlotSpec,
  format: ImageFormat,
  baseName: string,
  dpi = 300,
) {
  const svg = await buildSvg(h, plot, dpi);
  const name = baseName.replace(/\.(fcs|lmd)$/i, '');
  if (format === 'svg') return download(`${safeName(name)}.svg`, svg, 'image/svg+xml');
  // The rasterisers and PDF writer read computed styles, so the figure is laid out off-screen first.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    await exportSvgFigure(host.querySelector('svg')!, format, name, dpi);
  } finally {
    host.remove();
  }
}
