/** Reordering lists of ids (ridge rows, chart series). */

/**
 * `order` with `ids` moved, in their order there, next to `target`: before it, or after it if `after`.
 * Null if `target` is one of `ids`.
 */
export function moveIds(order: string[], ids: string[], target: string, after: boolean): string[] | null {
  const moving = new Set(ids);
  if (moving.has(target)) return null;
  const rest = order.filter((x) => !moving.has(x));
  const at = rest.indexOf(target) + (after ? 1 : 0);
  return [...rest.slice(0, at), ...order.filter((x) => moving.has(x)), ...rest.slice(at)];
}
