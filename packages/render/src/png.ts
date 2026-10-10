/** PNG encoding (for exports): RGBA → PNG with pHYs DPI chunk, no dependencies. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** PNG scanlines (filter type 0) for RGBA pixels. */
export function pngScanlines(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return raw;
}

/** zlib stream made of stored (uncompressed) deflate blocks. */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.ceil(raw.length / 65535) || 1;
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  let p = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    z[p++] = b === blocks - 1 ? 1 : 0;
    z[p++] = len & 0xff;
    z[p++] = len >>> 8;
    z[p++] = ~len & 0xff;
    z[p++] = (~len >>> 8) & 0xff;
    z.set(raw.subarray(start, start + len), p);
    p += len;
  }
  const ad = adler32(raw);
  z[p++] = ad >>> 24;
  z[p++] = (ad >>> 16) & 0xff;
  z[p++] = (ad >>> 8) & 0xff;
  z[p++] = ad & 0xff;
  return z.subarray(0, p);
}

/** Assemble a PNG from a zlib-compressed scanline stream, with a pHYs chunk for `dpi`. */
export function assemblePng(zlib: Uint8Array, width: number, height: number, dpi = 300): Uint8Array {
  const chunks: [string, Uint8Array][] = [];
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunks.push(['IHDR', ihdr]);
  const phys = new Uint8Array(9);
  const ppm = Math.round(dpi / 0.0254);
  new DataView(phys.buffer).setUint32(0, ppm);
  new DataView(phys.buffer).setUint32(4, ppm);
  phys[8] = 1; // unit: metre
  chunks.push(['pHYs', phys]);
  chunks.push(['IDAT', zlib]);
  chunks.push(['IEND', new Uint8Array(0)]);
  const total = 8 + chunks.reduce((a, [, d]) => a + 12 + d.length, 0);
  const out = new Uint8Array(total);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let o = 8;
  for (const [type, data] of chunks) {
    new DataView(out.buffer).setUint32(o, data.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i);
    out.set(data, o + 8);
    new DataView(out.buffer).setUint32(o + 8 + data.length, crc32(out, o + 4, o + 8 + data.length));
    o += 12 + data.length;
  }
  return out;
}

/** Encode RGBA as PNG (uncompressed deflate blocks; deterministic) with a pHYs chunk for `dpi`. */
export function encodePng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  dpi = 300,
): Uint8Array {
  return assemblePng(zlibStored(pngScanlines(rgba, width, height)), width, height, dpi);
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
