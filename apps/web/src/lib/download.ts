import { assemblePng, encodePng, pngScanlines } from '@flowmeris/render';

/** Trigger a browser download of in-memory content (nothing is uploaded anywhere). */
export function download(name: string, data: Blob | Uint8Array | string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

/** PNG with native deflate (CompressionStream) when available; uncompressed otherwise. */
export async function encodePngCompressed(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dpi: number,
): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return encodePng(rgba, width, height, dpi);
  const raw = pngScanlines(rgba, width, height);
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const zlib = new Uint8Array(await new Response(stream).arrayBuffer());
  return assemblePng(zlib, width, height, dpi);
}
