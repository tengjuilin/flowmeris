#!/usr/bin/env node
// Fails when a TypeScript source file grows past MAX_LINES. Files that were already larger when the
// limit was introduced are listed in tools/size-allowlist.json with their line count; they may shrink
// but not grow. `--tighten` lowers recorded counts to the current ones and drops entries that now fit.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MAX_LINES = 500;
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const allowFile = resolve(root, 'tools/size-allowlist.json');
const allow = JSON.parse(readFileSync(allowFile, 'utf8'));

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.ts', '*.tsx'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter((f) => f && !f.startsWith('fixtures/'));

const lines = (f) => {
  try {
    return readFileSync(resolve(root, f), 'utf8').split('\n').length - 1;
  } catch {
    return 0; // deleted but still in the index
  }
};

const errors = [];
const next = {};
for (const f of files) {
  const n = lines(f);
  const cap = allow[f];
  if (cap === undefined) {
    if (n > MAX_LINES) errors.push(`${f}: ${n} lines (limit ${MAX_LINES}); split it by responsibility`);
  } else if (n > cap) {
    errors.push(`${f}: ${n} lines, grew past its allowlisted ${cap}; split it rather than adding to it`);
    next[f] = cap; // --tighten never raises a cap
  } else if (n > MAX_LINES) {
    next[f] = n;
  }
}
const stale = Object.keys(allow).filter((f) => !(f in next));

if (process.argv.includes('--tighten')) {
  writeFileSync(allowFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`size-allowlist.json: ${Object.keys(next).length} entries`);
} else if (stale.length || Object.entries(next).some(([f, n]) => n < allow[f])) {
  console.log('Some allowlisted files shrank; run `node tools/check-size.mjs --tighten` to lock that in.');
}
for (const e of errors) console.error(`FAILED  ${e}`);
if (errors.length) process.exit(1);
