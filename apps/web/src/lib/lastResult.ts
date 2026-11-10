/**
 * The last result of a computation, given again while its inputs are the same objects (`===`). A module-
 * level `LastResult` lets several components that compute the same thing from the same store values (a
 * view and its settings panel) share one computation per change instead of each running it.
 *
 * `deps` must list everything `compute` reads; the result is shared, so callers must not mutate it.
 */
export class LastResult<R> {
  private deps: readonly unknown[] | undefined;
  private value: R | undefined;

  get(deps: readonly unknown[], compute: () => R): R {
    const last = this.deps;
    if (last && last.length === deps.length && last.every((d, i) => d === deps[i])) return this.value as R;
    const value = compute();
    this.deps = deps;
    this.value = value;
    return value;
  }
}
