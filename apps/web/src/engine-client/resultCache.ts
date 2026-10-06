/**
 * Main-thread LRU of plot results, keyed by a complete dependency key (e.g. `plotKey` plus the
 * raster size). A remounted plot (switching views, changing the selected population, toggling
 * backgating) is then drawn without another round trip to its worker, and identical requests in
 * flight share one computation. Results must be treated as read-only.
 */
export class ResultCache {
  private map = new Map<string, { value: Promise<unknown>; bytes: number }>();
  private used = 0;

  constructor(private budget: number) {}

  get<T>(key: string, sizeOf: (v: T) => number, compute: () => Promise<T>): Promise<T> {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit.value as Promise<T>;
    }
    const entry = { value: compute() as Promise<unknown>, bytes: 0 };
    this.map.set(key, entry);
    entry.value.then(
      (v) => {
        if (this.map.get(key) !== entry) return;
        entry.bytes = sizeOf(v as T);
        this.used += entry.bytes;
        this.evict();
      },
      () => {
        if (this.map.get(key) === entry) this.map.delete(key);
      },
    );
    return entry.value as Promise<T>;
  }

  private evict() {
    for (const [k, e] of this.map) {
      if (this.used <= this.budget || this.map.size <= 1) break;
      this.map.delete(k);
      this.used -= e.bytes;
    }
  }
}

export const plotResults = new ResultCache(96 * 2 ** 20);
