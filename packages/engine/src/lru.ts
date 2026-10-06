/** Byte-budgeted LRU cache (Map preserves insertion order; re-insert on hit). */
export class LruCache<V> {
  private map = new Map<string, { value: V; bytes: number }>();
  private used = 0;
  constructor(
    private budget: number,
    private sizeOf: (v: V) => number,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    const old = this.map.get(key);
    if (old) {
      this.used -= old.bytes;
      this.map.delete(key);
    }
    const bytes = this.sizeOf(value);
    this.map.set(key, { value, bytes });
    this.used += bytes;
    for (const [k, e] of this.map) {
      if (this.used <= this.budget || this.map.size <= 1) break;
      this.map.delete(k);
      this.used -= e.bytes;
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
    this.used = 0;
  }

  get bytes(): number {
    return this.used;
  }

  setBudget(bytes: number): void {
    this.budget = bytes;
  }
}
