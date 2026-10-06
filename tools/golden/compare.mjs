// Compares two golden directories structurally, allowing tiny float differences
// (last-bit libm/BLAS variation between macOS and Linux). Usage: node compare.mjs <expected> <actual>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [expected, actual] = process.argv.slice(2);
const RTOL = 1e-9;
const ATOL = 1e-12;
const problems = [];

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(join(dir, base))) {
    const rel = join(base, name);
    if (statSync(join(dir, rel)).isDirectory()) out.push(...walk(dir, rel));
    else if (name.endsWith('.json') && name !== 'golden-manifest.json') out.push(rel);
  }
  return out.sort();
}

function cmp(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > ATOL + RTOL * Math.max(Math.abs(a), Math.abs(b))) {
      problems.push(`${path}: ${a} vs ${b}`);
    }
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return problems.push(`${path}: length ${a.length} vs ${b.length}`);
    for (let i = 0; i < a.length && problems.length < 20; i++) cmp(a[i], b[i], `${path}[${i}]`);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return problems.push(`${path}: keys differ`);
    for (const k of ka) if (problems.length < 20) cmp(a[k], b[k], `${path}.${k}`);
  } else if (a !== b) {
    problems.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}

const fa = walk(expected);
const fb = walk(actual);
if (fa.join() !== fb.join()) {
  console.error('file sets differ', { expected: fa, actual: fb });
  process.exit(1);
}
for (const f of fa) {
  cmp(
    JSON.parse(readFileSync(join(expected, f), 'utf8')),
    JSON.parse(readFileSync(join(actual, f), 'utf8')),
    f,
  );
}
if (problems.length) {
  console.error(`Golden drift (rtol ${RTOL}):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`golden unchanged within tolerance (${fa.length} files)`);
