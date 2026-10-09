/** `v` to `n` significant figures in plain notation, keeping trailing zeros (1.50, 0.00120, 12300). */
export function toSigFigs(v: number, n: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Number(v.toPrecision(n));
  if (r === 0) return n > 1 ? (0).toFixed(n - 1) : '0';
  const decimals = n - 1 - Math.floor(Math.log10(Math.abs(r)));
  return r.toFixed(Math.min(100, Math.max(0, decimals)));
}
