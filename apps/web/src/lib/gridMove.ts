/** Rearranging the Plot view's grid slots (by drag and drop, or cut and paste). */

/**
 * Where a dragged plot goes: before or after the plot in the target slot (dropped on its left or right
 * half), or into an empty target slot.
 */
export type DropSide = 'before' | 'after' | 'into';

/** `slots` without the empty slots at the end. */
export function trimSlots<T>(slots: (T | null)[]): (T | null)[] {
  const out = slots.slice();
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

/**
 * Move the plot in slot `from` to slot `to`. Into an empty slot, it moves there and its old slot is left
 * empty. Before or after a plot, the slots between the old and new places (plots and empty slots alike)
 * shift by one to fill the gap: with A B C D, A after C gives B C A D and D before B gives A D B C.
 */
export function moveSlot<T>(slots: (T | null)[], from: number, to: number, side: DropSide): (T | null)[] {
  const item = slots[from];
  if (item == null || from === to) return slots.slice();
  const out = slots.slice();
  while (out.length <= to) out.push(null);
  if (side === 'into') {
    out[to] = item;
    out[from] = null;
  } else {
    out.splice(from, 1);
    // The target's index once the moved plot is out of the list.
    const at = to > from ? to - 1 : to;
    out.splice(side === 'after' ? at + 1 : at, 0, item);
  }
  return trimSlots(out);
}

/** Put `item` into slot `to`, replacing what is there; with `from`, the plot moves from that slot (cut). */
export function putSlot<T>(slots: (T | null)[], to: number, item: T, from?: number): (T | null)[] {
  const out = slots.slice();
  while (out.length <= to) out.push(null);
  if (from !== undefined && from !== to) out[from] = null;
  out[to] = item;
  return trimSlots(out);
}

/** Where a plot dragged over a slot spanning `left` to `left + width` at `x` would go (`DropSide`). */
export function dropSide(occupied: boolean, x: number, left: number, width: number): DropSide {
  if (!occupied) return 'into';
  return x < left + width / 2 ? 'before' : 'after';
}
