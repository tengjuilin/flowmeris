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
    pointPx: Math.max(1, Math.round(plot.style.pointPx * scale)),
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
    generator: `flowmeris ${APP_INFO.version} (${APP_INFO.commit})`,
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

export async function exportPlot(
  h: PlotHandle,
  plot: PlotSpec,
  format: 'svg' | 'png',
  baseName: string,
  dpi = 300,
) {
  try {
    const svg = await buildSvg(h, plot, dpi);
    const name = safeName(baseName.replace(/\.(fcs|lmd)$/i, ''));
    if (format === 'svg') {
      download(`${name}.svg`, svg, 'image/svg+xml');
      return;
    }
    const scale = dpi / 96;
    const { width, height } = h.size;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not render SVG for PNG export'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    download(
      `${name}.png`,
      await encodePngCompressed(data.data, canvas.width, canvas.height, dpi),
      'image/png',
    );
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
