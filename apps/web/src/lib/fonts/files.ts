import { BUNDLED, type BundledFamily, FACES, type FaceName } from './catalog.ts';

/**
 * The bundled font files (ADR-0011), served with the app. They are absent until tools/fetch-fonts.mjs
 * has run; figures then fall back to system fonts and exports warn (see `fontsMissing`).
 */

const URLS = import.meta.glob<string>('../../assets/fonts/*.ttf', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** URL of a bundled font file, or undefined when it has not been fetched. */
export function fontUrl(file: string): string | undefined {
  return URLS[`../../assets/fonts/${file}`];
}

/** True when the bundled fonts were not fetched before this build (see tools/fetch-fonts.mjs). */
export function fontsMissing(): boolean {
  return BUNDLED.some((f) => FACES.some((face) => !fontUrl(f.files[face])));
}

const bytes = new Map<string, Promise<Uint8Array>>();

/** The TrueType file of a bundled face (fetched from the app once). */
export function bundledBytes(family: BundledFamily, face: FaceName): Promise<Uint8Array> {
  const file = family.files[face];
  let p = bytes.get(file);
  if (!p) {
    const url = fontUrl(file);
    if (!url) return Promise.reject(new Error(`Font file ${file} is missing; run corepack pnpm fonts:fetch`));
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`Font file ${file}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => bytes.delete(file));
    bytes.set(file, p);
  }
  return p;
}

/**
 * Make the bundled families available to the page's figures. Each face is downloaded only when text
 * first uses it; `document.fonts` fires `loadingdone` then (see useFontsLoaded).
 */
export function registerBundledFonts(fonts: FontFaceSet = document.fonts) {
  for (const f of BUNDLED) {
    for (const face of FACES) {
      const url = fontUrl(f.files[face]);
      if (!url) continue;
      const descriptors = {
        weight: face.startsWith('bold') ? '700' : '400',
        style: face.endsWith('italic') ? 'italic' : 'normal',
      };
      fonts.add(new FontFace(f.family, `url(${JSON.stringify(url)}) format("truetype")`, descriptors));
    }
  }
}
