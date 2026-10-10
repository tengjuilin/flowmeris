import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `ms` (e.g. a slider being dragged). */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * `value`, updated only once it has stopped changing for `ms` (avoids recomputing plots mid-drag).
 * The first measured value (after `unset`) takes effect at once.
 */
export function useDebounced<T>(value: T, ms: number, unset: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (v === unset) {
      setV(value);
      return;
    }
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v === unset ? value : v;
}
