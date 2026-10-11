// @vitest-environment jsdom
import type { PlotSpec } from '@flowmeris/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORMATS, FORMAT_IDS, clampDpi } from './formats.ts';
import { type PlotExportSource, type PlotHandle, plotFigure, svgFigure, writeFigure } from './index.ts';

// The writers need a canvas and jsPDF; here they report the laid-out SVG they were given.
const { seen, record } = vi.hoisted(() => {
  const seen: { format: string; svg: string; attached: boolean; dpi: number }[] = [];
  const record =
    (format: string) =>
    async (el: SVGSVGElement, dpi = 0) => {
      seen.push({ format, svg: el.outerHTML, attached: document.body.contains(el), dpi });
      return new Uint8Array([1]);
    };
  return { seen, record };
});
vi.mock('./pdf.ts', () => ({ svgToPdf: (el: SVGSVGElement) => record('pdf')(el) }));
vi.mock('./raster.ts', () => ({ svgToPng: record('png'), svgToJpeg: record('jpeg') }));
// jsdom's Blob has no stream(); the encoder is tested in @flowmeris/render.
vi.mock('@flowmeris/render', () => ({ encodePngCompressed: async () => new Uint8Array([137, 80, 78, 71]) }));

const NS = 'http://www.w3.org/2000/svg';

/** An on-screen figure: a styled label with a tooltip, and a gate handle. */
function onScreen(): SVGSVGElement {
  document.head.innerHTML = '<style>.lbl { font-size: 13px; font-weight: 700; fill: #ff0000 }</style>';
  document.body.innerHTML = `<svg xmlns="${NS}" width="120" height="80">
    <text class="lbl" x="5" y="20">CD4<title>drag to move</title></text>
    <rect data-handle="1" width="4" height="4"/>
    <path class="draft" d="M0 0"/>
  </svg>`;
  return document.querySelector('svg')!;
}

afterEach(() => {
  seen.length = 0;
  document.body.innerHTML = '';
});

describe('formats', () => {
  it('lists PDF, PNG, JPG and SVG, with a DPI only for the raster formats', () => {
    expect(FORMAT_IDS).toEqual(['pdf', 'png', 'jpeg', 'svg']);
    expect(FORMAT_IDS.filter((f) => FORMATS[f].raster)).toEqual(['png', 'jpeg']);
    expect(FORMAT_IDS.map((f) => FORMATS[f].ext)).toEqual(['pdf', 'png', 'jpg', 'svg']);
  });

  it('keeps the DPI within 72–1200, 300 when unset', () => {
    expect([clampDpi(10), clampDpi(600), clampDpi(5000), clampDpi(Number.NaN)]).toEqual([72, 600, 1200, 300]);
  });
});

describe('svgFigure', () => {
  it('writes standalone SVG with the CSS styles inline and no tooltips', async () => {
    const out = (await writeFigure(svgFigure(onScreen()), 'svg', 300)) as string;
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.getAttribute('xmlns')).toBe(NS);
    expect(svg.getAttribute('viewBox')).toBe('0 0 120 80');
    expect(doc.querySelector('title')).toBeNull();
    const text = doc.querySelector('text')!;
    expect(text.getAttribute('class')).toBeNull();
    expect(text.getAttribute('style')).toContain('font-size:13px');
    expect(text.getAttribute('style')).toContain('font-weight:700');
    expect(seen).toEqual([]);
  });

  it('lays the figure out in the document for the other formats, and removes it after', async () => {
    const figure = svgFigure(onScreen());
    for (const format of ['pdf', 'png', 'jpeg'] as const) await writeFigure(figure, format, 600);
    expect(seen.map((s) => [s.format, s.attached])).toEqual([
      ['pdf', true],
      ['png', true],
      ['jpeg', true],
    ]);
    expect(seen[1]!.dpi).toBe(600);
    expect(seen.every((s) => s.svg.includes('font-size:13px'))).toBe(true);
    expect(document.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('plotFigure', () => {
  const plot = (kind: PlotSpec['kind']) =>
    ({
      kind,
      population: 'root',
      x: { transform: 't' },
      style: { pointPx: 3, smoothSigmaBins: 2 },
    }) as PlotSpec;
  const source = (): PlotExportSource & { calls: number[][] } => {
    const calls: number[][] = [];
    return {
      calls,
      raster: async (_p, width, height) => {
        calls.push([width, height]);
        return { rgba: new Uint8ClampedArray(width * height * 4), width, height } as never;
      },
      sha256: 'abc',
      transforms: { x: undefined, y: undefined },
      generator: 'Flowmeris test',
    };
  };
  const handle = (): PlotHandle => ({
    svg: onScreen(),
    raster: null,
    size: { width: 120, height: 80, margin: { l: 20, r: 0, t: 0, b: 20 } },
  });

  it('drops edit handles and drafts, adds a white background, provenance and the raster at the DPI', async () => {
    const src = source();
    const out = await plotFigure(handle(), plot('pseudocolor'), src).build(192);
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('[data-handle], .draft')).toBeNull();
    expect(doc.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
    expect(JSON.parse(doc.querySelector('metadata')!.textContent!)).toMatchObject({
      generator: 'Flowmeris test',
      sample: 'abc',
      rasterDpi: 192,
    });
    // The 100 × 60 px plot area, rendered at 2× (192 dpi).
    expect(src.calls).toEqual([[200, 120]]);
    expect(doc.querySelector('image')?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
  });

  it('draws histograms as vector only', async () => {
    const src = source();
    const out = await plotFigure(handle(), plot('histogram'), src).build(300);
    expect(out).not.toContain('<image');
    expect(src.calls).toEqual([]);
  });
});
