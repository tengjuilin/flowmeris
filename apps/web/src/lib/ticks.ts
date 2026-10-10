/** A custom tick in data units, as plots, ridges and charts store it; a missing label is formatted from the value. */
export interface TickMark {
  value: number;
  label?: string;
}

/** Custom ticks as the tick editor shows them: one per line, `1000` or `1000 = 1k`. */
export function formatTicks(ticks: TickMark[] | undefined): string {
  return (ticks ?? [])
    .map((t) => (t.label === undefined ? String(t.value) : `${t.value} = ${t.label}`))
    .join('\n');
}

/** One tick per line or comma: `1000` or `1000 = 1k`. Returns null on a malformed entry. */
export function parseTicks(text: string): TickMark[] | null {
  const out: TickMark[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    const value = Number((eq < 0 ? part : part.slice(0, eq)).trim());
    if (!Number.isFinite(value)) return null;
    out.push(eq < 0 ? { value } : { value, label: part.slice(eq + 1).trim() });
  }
  return out;
}
