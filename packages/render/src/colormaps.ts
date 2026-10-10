// ---------------------------------------------------------------------------
// Colormaps — sequential, single perceptual ramp by default (viridis).
// "classic" reproduces the blue→red pseudocolor familiar from FlowJo; it is not
// perceptually uniform and is offered for familiarity only (docs/methods/plots.md).
// ---------------------------------------------------------------------------

const STOPS: Record<string, string[]> = {
  viridis: [
    '#440154',
    '#482878',
    '#3e4989',
    '#31688e',
    '#26828e',
    '#1f9e89',
    '#35b779',
    '#6ece58',
    '#fde725',
  ],
  magma: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55064', '#fb8761', '#fec287', '#fcfdbf'],
  classic: [
    '#0000ff',
    '#00a0ff',
    '#00ffff',
    '#00ff80',
    '#00ff00',
    '#a0ff00',
    '#ffff00',
    '#ff8000',
    '#ff0000',
  ],
  gray: ['#d9d9d9', '#000000'],
};

export const COLORMAPS = Object.keys(STOPS);

/** `#rrggbb` as its red, green and blue bytes. */
export function hex(h: string): [number, number, number] {
  return [
    Number.parseInt(h.slice(1, 3), 16),
    Number.parseInt(h.slice(3, 5), 16),
    Number.parseInt(h.slice(5, 7), 16),
  ];
}

const LUT_CACHE = new Map<string, Uint8Array>();

/** 256-entry RGB lookup table, linear interpolation between stops. */
export function colormapLut(name: string): Uint8Array {
  const hit = LUT_CACHE.get(name);
  if (hit) return hit;
  const stops = (STOPS[name] ?? STOPS.viridis!).map(hex);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[c]! + (b[c]! - a[c]!) * f);
  }
  LUT_CACHE.set(name, lut);
  return lut;
}

export function colormapCss(name: string, t: number): string {
  const lut = colormapLut(name);
  const i = Math.max(0, Math.min(255, Math.round(t * 255)));
  return `rgb(${lut[i * 3]},${lut[i * 3 + 1]},${lut[i * 3 + 2]})`;
}

/**
 * Population/gate colours: the validated 8-slot categorical palette, assigned
 * in fixed order (never cycled past 8 — additional populations reuse slot 8's
 * neutral fallback and rely on labels).
 */
export const CATEGORICAL = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];
