import type { LruCache } from './lru.ts';

/** What the engine's result cache holds: columns (Float64Array) and bitsets or indices (Uint32Array). */
export type Cached = Float64Array | Uint32Array;

/** The cached value under `key`, computed with `fn` and cached on a miss. */
export function memo<T extends Cached>(cache: LruCache<Cached>, key: string, fn: () => T): T {
  const hit = cache.get(key) as T | undefined;
  if (hit) return hit;
  const v = fn();
  cache.set(key, v);
  return v;
}

/** Small string-keyed memo that is simply cleared once it grows past `max` entries. */
export class BoundedMemo<V> {
  private map = new Map<string, V>();
  constructor(private max: number) {}
  get(key: string, make: () => V): V {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    if (this.map.size >= this.max) this.map.clear();
    this.map.set(key, v);
    return v;
  }
}
