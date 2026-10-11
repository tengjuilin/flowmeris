// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_FONTS, embedFontFaces, usedFaces } from './fontFaces.ts';

const fetched = vi.hoisted(() => ({ files: [] as string[], fail: false }));
vi.mock('../fonts/files.ts', () => ({
  bundledBytes: async (family: { files: Record<string, string> }, face: string) => {
    if (fetched.fail) throw new Error('missing');
    fetched.files.push(family.files[face]!);
    return new Uint8Array([0, 1, 0, 0]);
  },
}));

function figure(texts: string[]): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${texts
    .map((style) => `<text style='${style}'>x</text>`)
    .join('')}</svg>`;
  return document.querySelector('svg')!;
}

afterEach(() => {
  fetched.files.length = 0;
  fetched.fail = false;
});

describe('embedded font faces', () => {
  it('lists each bundled face the text uses once, with an installed font’s bundled fallback', () => {
    const svg = figure([
      'font-family:"Liberation Sans", sans-serif;font-weight:400',
      'font-family:"Liberation Sans", sans-serif;font-weight:700;font-style:italic',
      'font-family:"Liberation Sans";font-weight:400',
      'font-family:"Futura", "Liberation Sans", sans-serif;font-weight:700',
      'font-family:serif',
    ]);
    expect(usedFaces(svg).map((u) => `${u.family.family} ${u.face}`)).toEqual([
      'Liberation Sans regular',
      'Liberation Sans bolditalic',
      'Liberation Sans bold',
      'Liberation Serif regular',
    ]);
  });

  it('adds @font-face rules with the files as data URLs', async () => {
    const svg = figure(['font-family:"EB Garamond";font-weight:700;font-style:italic']);
    await embedFontFaces(svg);
    expect(fetched.files).toEqual(['EBGaramond-BoldItalic.ttf']);
    const style = svg.firstElementChild!;
    expect(style.tagName).toBe('style');
    expect(style.textContent).toBe(
      '@font-face{font-family:"EB Garamond";font-weight:700;font-style:italic;src:url(data:font/ttf;base64,AAEAAA==) format("truetype")}',
    );
  });

  it('warns when the fonts were not fetched for this build', async () => {
    fetched.fail = true;
    const warn = vi.fn();
    const svg = figure(['font-family:Inter']);
    await embedFontFaces(svg, warn);
    expect(warn).toHaveBeenCalledWith(MISSING_FONTS);
    expect(svg.querySelector('style')).toBeNull();
  });
});
