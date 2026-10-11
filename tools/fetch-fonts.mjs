#!/usr/bin/env node
// Downloads the figure fonts listed in tools/fonts.lock.json (ADR-0011) into apps/web/src/assets/fonts,
// unmodified, and verifies each file's SHA-256. Files already in place with the right hash are kept, so
// this is fast and offline after the first run. Archives are cached in node_modules/.cache.
//
//   node tools/fetch-fonts.mjs             fetch; exit 1 on any failure (dev, build)
//   node tools/fetch-fonts.mjs --optional  fetch; only warn on failure (postinstall, e.g. offline)
//   node tools/fetch-fonts.mjs --hash      print the SHA-256 of every source and file (to update the lock)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const lock = JSON.parse(readFileSync(resolve(root, 'tools/fonts.lock.json'), 'utf8'));
const dest = resolve(root, lock.dest);
const cache = resolve(root, 'node_modules/.cache/flowmeris-fonts');
const optional = process.argv.includes('--optional');
const printHashes = process.argv.includes('--hash');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** The files of a .tar archive, by path. */
function untar(buf) {
  const out = new Map();
  for (let p = 0; p + 512 <= buf.length; ) {
    const name = buf
      .subarray(p, p + 100)
      .toString('utf8')
      .replace(/\0.*$/s, '');
    if (!name) break;
    const size = Number.parseInt(
      buf
        .subarray(p + 124, p + 136)
        .toString('utf8')
        .trim() || '0',
      8,
    );
    out.set(name, buf.subarray(p + 512, p + 512 + size));
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** The files of a .zip archive, by path (stored or deflated entries, read from the central directory). */
function unzip(buf) {
  const out = new Map();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip archive');
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const local = buf.readUInt32LE(p + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 0 ? data : method === 8 ? inflateRawSync(data) : null);
    p += 46 + skip;
  }
  return out;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const archives = new Map();
/** A source archive's files, downloaded once (and cached) and checked against its SHA-256. */
async function archive(id) {
  if (archives.has(id)) return archives.get(id);
  const src = lock.sources[id];
  const file = resolve(cache, `${id}-${src.sha256.slice(0, 12)}`);
  let buf = existsSync(file) ? readFileSync(file) : await download(src.url);
  if (printHashes) console.log(`source  ${id}  ${sha(buf)}`);
  else if (sha(buf) !== src.sha256) throw new Error(`SHA-256 mismatch for source ${id} (${src.url})`);
  mkdirSync(cache, { recursive: true });
  if (!existsSync(file)) writeFileSync(file, buf);
  buf = src.url.endsWith('.zip') ? unzip(buf) : untar(gunzipSync(buf));
  archives.set(id, buf);
  return buf;
}

async function fetchFile(f) {
  if (f.url) return download(f.url);
  const data = (await archive(f.source)).get(f.member);
  if (!data) throw new Error(`${f.member} is not in source ${f.source}`);
  return Buffer.from(data);
}

let failed = 0;
mkdirSync(dest, { recursive: true });
for (const f of lock.files) {
  const out = resolve(dest, f.file);
  if (!printHashes && existsSync(out) && sha(readFileSync(out)) === f.sha256) continue;
  try {
    const buf = await fetchFile(f);
    if (printHashes) {
      console.log(`file    ${f.file}  ${sha(buf)}`);
      continue;
    }
    if (sha(buf) !== f.sha256) throw new Error('SHA-256 mismatch');
    writeFileSync(out, buf);
    console.log(`fetched ${f.file}`);
  } catch (e) {
    failed++;
    console.error(`FAILED  ${f.file}: ${e instanceof Error ? e.message : e}`);
  }
}
if (failed && optional) {
  console.warn(
    `fetch-fonts: ${failed} font file(s) missing. Figures fall back to system fonts and PDFs cannot embed them; run \`corepack pnpm fonts:fetch\` when online.`,
  );
}
process.exit(failed && !optional ? 1 : 0);
