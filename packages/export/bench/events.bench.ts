/**
 * Event export benchmark (not part of the test suite):
 *   corepack pnpm exec vite-node packages/export/bench/events.bench.ts
 * Env: N events (default 1M), P channels (default 30). Prints time and an output hash.
 */
import { eventsToCsv, eventsToFcs } from '../src/index.ts';

const N = Number(process.env.N ?? 1_000_000);
const P = Number(process.env.P ?? 30);
const channels = Array.from({ length: P }, (_, i) => `C${i}`);
let seed = 1;
const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const columns = channels.map(() => Float64Array.from({ length: N }, () => (rnd() - 0.1) * 1e5));

function hash(b: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i]!, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
function run(label: string, fn: () => Uint8Array) {
  const t = performance.now();
  const r = fn();
  console.log(`${label.padEnd(16)} ${(performance.now() - t).toFixed(1).padStart(9)} ms  ${hash(r)}`);
}
console.log(`${N} events × ${P} channels`);
run('eventsToCsv', () => {
  const out = eventsToCsv({ channels, columns, count: N });
  return typeof out === 'string' ? new TextEncoder().encode(out) : out;
});
run('eventsToFcs', () => eventsToFcs({}, { channels, columns }, 'raw', { prov: '1' }));
