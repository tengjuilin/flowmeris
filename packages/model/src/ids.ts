import { fingerprint } from './canonical.ts';
import type { Transform, TransformId } from './schema/index.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID-style identifier: 48-bit ms timestamp + 80 random bits, Crockford base32. */
export function newId(prefix = ''): string {
  let t = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = new Uint8Array(16);
  globalThis.crypto.getRandomValues(rnd);
  let r = '';
  for (let i = 0; i < 16; i++) r += CROCKFORD[(rnd[i] as number) % 32];
  return prefix + time + r;
}

/** Content-addressed transform id (ADR-0005). Equal parameters ⇒ equal id. */
export function transformId(t: Transform): TransformId {
  return `t_${fingerprint(t).slice(0, 16)}`;
}
