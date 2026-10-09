/** `v` to `n` significant figures in plain notation, keeping trailing zeros (1.50, 0.00120, 12300). */
export function toSigFigs(v: number, n: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Number(v.toPrecision(n));
  if (r === 0) return n > 1 ? (0).toFixed(n - 1) : '0';
  const decimals = n - 1 - Math.floor(Math.log10(Math.abs(r)));
  return r.toFixed(Math.min(100, Math.max(0, decimals)));
}

export const PLAIN_DECIMAL = /^(-?\d+)(\.\d+)?$/;

/** Digits after the decimal point of a formatted number (0 if there is none or it is not plain, e.g. 1e-7). */
export function fracDigits(text: string): number {
  const m = PLAIN_DECIMAL.exec(text);
  return m?.[2] ? m[2].length - 1 : 0;
}
