/**
 * Deterministic synthetic data for tests and benchmarks.
 * xoshiro128** PRNG + Box–Muller normals; reproducible from a 32-bit seed.
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  constructor(seed: number) {
    // splitmix32 seeding
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
  }
  /** Uniform in [0, 1). */
  next(): number {
    const result = Math.imul(this.rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = this.rotl(this.s3, 11);
    return result / 4294967296;
  }
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  private rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }
}

export interface MixtureComponent {
  weight: number;
  /** Mean per channel (linear units). */
  mean: number[];
  /** SD per channel (linear units). */
  sd: number[];
}

/** Gaussian mixture in linear space; returns columns and the true component label of each event. */
export function gaussianMixture(
  n: number,
  components: MixtureComponent[],
  seed = 1,
): { columns: Float64Array[]; labels: Uint8Array } {
  const rng = new Rng(seed);
  const d = components[0]?.mean.length ?? 0;
  const columns = Array.from({ length: d }, () => new Float64Array(n));
  const labels = new Uint8Array(n);
  const total = components.reduce((a, c) => a + c.weight, 0);
  for (let i = 0; i < n; i++) {
    let u = rng.next() * total;
    let k = 0;
    while (k < components.length - 1 && u >= (components[k] as MixtureComponent).weight) {
      u -= (components[k] as MixtureComponent).weight;
      k++;
    }
    labels[i] = k;
    const c = components[k] as MixtureComponent;
    for (let j = 0; j < d; j++)
      (columns[j] as Float64Array)[i] = (c.mean[j] as number) + (c.sd[j] as number) * rng.normal();
  }
  return { columns, labels };
}
