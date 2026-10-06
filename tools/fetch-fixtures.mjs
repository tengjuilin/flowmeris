#!/usr/bin/env node
// Downloads large test fixtures listed in fixtures/remote-fixtures.lock.json and verifies SHA-256.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const lock = JSON.parse(readFileSync(resolve(root, 'fixtures/remote-fixtures.lock.json'), 'utf8'));
let failed = false;
for (const f of lock.files) {
  const dest = resolve(root, f.path);
  const sha = (buf) => createHash('sha256').update(buf).digest('hex');
  if (existsSync(dest) && sha(readFileSync(dest)) === f.sha256) {
    console.log(`ok      ${f.path}`);
    continue;
  }
  const res = await fetch(f.url);
  if (!res.ok) {
    console.error(`FAILED  ${f.path}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== f.sha256) {
    console.error(`FAILED  ${f.path}: SHA-256 mismatch`);
    failed = true;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  console.log(`fetched ${f.path}`);
}
process.exit(failed ? 1 : 0);
