// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bakeBaselines, drawUnderlines, splitHalos } from './pdfText.ts';

/** jsdom has no layout: a text's box is 20 px tall, its top 16 px above the baseline, or 6 px when centered. */
const proto = SVGElement.prototype as unknown as { getBBox?: () => DOMRect };
beforeEach(() => {
  proto.getBBox = function (this: SVGElement) {
    const middle = this.getAttribute('dominant-baseline') === 'middle';
    const y = Number(this.getAttribute('y') ?? 0) - (middle ? 6 : 16);
    return { x: Number(this.getAttribute('x') ?? 0) - 1, y, width: 50, height: 20 } as DOMRect;
  };
});
afterEach(() => {
  proto.getBBox = undefined;
  document.body.innerHTML = '';
});

function figure(body: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`;
  return document.querySelector('svg')!;
}

describe('PDF text', () => {
  it('moves a text drawn on its middle baseline by what the baseline moved it, in its own coordinates', () => {
    const svg = figure(`
      <text x="0" y="30" dominant-baseline="middle">a</text>
      <text x="0" y="0" transform="rotate(-90)" dominant-baseline="middle">b</text>
      <text x="0" y="60">c</text>`);
    bakeBaselines(svg);
    const [a, b, c] = Array.from(svg.querySelectorAll('text'));
    expect(a!.getAttribute('transform')).toBe('translate(0 10)');
    expect(a!.hasAttribute('dominant-baseline')).toBe(false);
    expect(b!.getAttribute('transform')).toBe('rotate(-90) translate(0 10)');
    expect(c!.hasAttribute('transform')).toBe(false);
  });

  it('draws a halo as a stroked copy behind its text', () => {
    const svg = figure(
      `<text style="fill:#000;stroke:#fff;stroke-width:3px;paint-order:stroke;text-decoration:underline">g</text>`,
    );
    // jsdom drops paint-order from a style; browsers keep it.
    const style = svg.querySelector('text')!.style;
    const get = style.getPropertyValue.bind(style);
    style.getPropertyValue = (p: string) => (p === 'paint-order' ? 'stroke' : get(p));
    splitHalos(svg);
    const [halo, text] = Array.from(svg.querySelectorAll('text'));
    expect([halo!.style.fill, halo!.style.stroke, halo!.style.textDecoration]).toEqual([
      'none',
      '#fff',
      'none',
    ]);
    expect([text!.style.fill, text!.style.stroke]).toEqual(['#000', 'none']);
  });

  it('puts the underline at least half its thickness below the baseline, as Chromium does', () => {
    const svg = figure(
      `<text x="0" y="40" style="font-size:40px;fill:#000;text-decoration:underline">u</text>`,
    );
    // Liberation Sans: 67 / 2048 em below the baseline (1.3 px), 150 / 2048 em thick (2.9 px).
    drawUnderlines(svg, () => ({ offset: 67 / 2048, thickness: 150 / 2048 }));
    const r = svg.querySelector('rect')!;
    expect(Number(r.getAttribute('y'))).toBe(42);
    expect(Number(r.getAttribute('height'))).toBeCloseTo(2.93, 2);
  });

  it("underlines a text at its font's underline position and thickness, in its color", () => {
    const svg = figure(`
      <text x="10" y="40" transform="rotate(5)" style="font-size:20px;fill:#f00;text-decoration:underline">u</text>
      <text x="10" y="80" style="font-size:20px;fill:#000">plain</text>
      <text x="10" y="90" style="font-size:20px;fill:none;text-decoration:underline">halo</text>`);
    drawUnderlines(svg, () => ({ offset: 0.1, thickness: 0.05 }));
    const rects = svg.querySelectorAll('rect');
    expect(rects).toHaveLength(1);
    const r = rects[0]!;
    expect(r.previousElementSibling?.textContent).toBe('u');
    expect(['x', 'y', 'width', 'height', 'transform'].map((k) => r.getAttribute(k))).toEqual([
      '9',
      '42',
      '50',
      '1',
      'rotate(5)',
    ]);
    expect(r.getAttribute('style')).toContain('fill:#f00');
    expect(svg.querySelector('text')!.style.textDecoration).toBe('none');
  });
});
