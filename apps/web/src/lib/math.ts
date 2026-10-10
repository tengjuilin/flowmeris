/** `v` limited to `[lo, hi]`. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
