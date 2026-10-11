/**
 * Lay out SVG markup off-screen while `fn` reads it: the rasterizers and the PDF writer read computed
 * styles and text layout, which only a document gives.
 */
export async function withMounted<T>(markup: string, fn: (svg: SVGSVGElement) => Promise<T>): Promise<T> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
  host.innerHTML = markup;
  document.body.appendChild(host);
  try {
    return await fn(host.querySelector('svg')!);
  } finally {
    host.remove();
  }
}
