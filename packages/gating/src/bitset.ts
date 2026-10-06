/**
 * Dense event-membership bitsets (bit i of word i>>>5 ↔ event i).
 * One population of 1M events occupies 125 kB.
 */
export type Bitset = Uint32Array;

export function bitsetWords(n: number): number {
  return (n + 31) >>> 5;
}

export function emptyBitset(n: number): Bitset {
  return new Uint32Array(bitsetWords(n));
}

export function fullBitset(n: number): Bitset {
  const b = new Uint32Array(bitsetWords(n));
  b.fill(0xffffffff);
  const tail = n & 31;
  if (tail !== 0) b[b.length - 1] = (1 << tail) - 1;
  return b;
}

export function setBit(b: Bitset, i: number): void {
  b[i >>> 5] = (b[i >>> 5] as number) | (1 << (i & 31));
}

export function getBit(b: Bitset, i: number): boolean {
  return ((b[i >>> 5] as number) & (1 << (i & 31))) !== 0;
}

/** Number of set bits (SWAR popcount). */
export function popcount(b: Bitset): number {
  let c = 0;
  for (let w = 0; w < b.length; w++) {
    let v = b[w] as number;
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    c += (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) as number;
  }
  return c;
}

/** Calls fn(i) for each set bit in ascending order. */
export function forEachSet(b: Bitset, fn: (i: number) => void): void {
  for (let w = 0; w < b.length; w++) {
    let v = b[w] as number;
    while (v !== 0) {
      const t = v & -v;
      fn((w << 5) + (31 - Math.clz32(t)));
      v ^= t;
    }
  }
}

/** Indices of set bits as Uint32Array. */
export function toIndices(b: Bitset): Uint32Array {
  const out = new Uint32Array(popcount(b));
  let k = 0;
  for (let w = 0; w < b.length; w++) {
    let v = b[w] as number;
    if (v === 0) continue;
    const base = w << 5;
    if (v === 0xffffffff) {
      for (let j = 0; j < 32; j++) out[k++] = base + j;
      continue;
    }
    while (v !== 0) {
      const t = v & -v;
      out[k++] = base + (31 - Math.clz32(t));
      v ^= t;
    }
  }
  return out;
}

export function and(a: Bitset, b: Bitset): Bitset {
  const o = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = (a[i] as number) & (b[i] as number);
  return o;
}

export function or(a: Bitset, b: Bitset): Bitset {
  const o = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = (a[i] as number) | (b[i] as number);
  return o;
}

/** Complement within the first n events. */
export function not(a: Bitset, n: number): Bitset {
  const o = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = ~(a[i] as number) >>> 0;
  const tail = n & 31;
  if (tail !== 0 && o.length > 0) o[o.length - 1] = (o[o.length - 1] as number) & ((1 << tail) - 1);
  return o;
}

export function fromBooleans(arr: ArrayLike<boolean | number>): Bitset {
  const b = emptyBitset(arr.length);
  for (let i = 0; i < arr.length; i++) if (arr[i]) setBit(b, i);
  return b;
}
