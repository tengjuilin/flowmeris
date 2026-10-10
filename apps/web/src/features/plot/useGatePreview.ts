import type { AnalysisContext } from '@flowmeris/engine';
import type { Gate, Geometry, Region } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { getPool } from '../../engine-client/pool.ts';

/** Event counts of a gate not yet committed: its parent's and each region's. */
export interface RegionCounts {
  parent: number;
  regions: Partial<Record<Region, number>>;
}

/**
 * Counts of a gate being dragged, previewed while the drag lasts. At most one preview is in flight;
 * edits made meanwhile collapse into the latest one, so a slow worker never builds up a queue of
 * stale drag positions.
 */
export function useDragPreview(ctx: AnalysisContext, sampleId: string) {
  const [preview, setPreview] = useState<(RegionCounts & { gateId: string }) | null>(null);
  const timer = useRef<number | null>(null);
  // Bumped when a drag ends, so a preview still in flight cannot reappear afterwards.
  const epoch = useRef(0);
  const busy = useRef(false);
  const next = useRef<(() => void) | null>(null);

  const schedule = (gate: Gate, geom: Geometry) => {
    if (timer.current) cancelAnimationFrame(timer.current);
    const at = epoch.current;
    timer.current = requestAnimationFrame(() => {
      const send = () => {
        busy.current = true;
        getPool()
          .preview(ctx, { sampleId, gate: { ...gate, geometry: geom } })
          .then((r) => {
            if (at === epoch.current)
              setPreview({ gateId: gate.id, parent: r.parentCount, regions: r.regions });
          })
          .catch(() => {})
          .finally(() => {
            busy.current = false;
            const n = next.current;
            next.current = null;
            n?.();
          });
      };
      if (busy.current) next.current = send;
      else send();
    });
  };

  /** Ends the preview when the drag ends. */
  const stop = () => {
    epoch.current++;
    if (timer.current) cancelAnimationFrame(timer.current);
    next.current = null;
    setPreview(null);
  };

  return { preview, schedule, stop };
}

/**
 * Counts of the quadrant, spider or split gate a click would place under the cursor. `key` identifies
 * `gate` (empty for none); a new key, context or sample restarts the preview. Coalesced like
 * useDragPreview: only the newest cursor position waits for the worker.
 */
export function useHoverPreview(ctx: AnalysisContext, sampleId: string, key: string, gate: Gate | null) {
  const [hoverCounts, setHoverCounts] = useState<RegionCounts | null>(null);
  const busy = useRef(false);
  const next = useRef<(() => void) | null>(null);
  useEffect(() => {
    setHoverCounts(null);
    if (!key || !gate) return;
    let live = true;
    const raf = requestAnimationFrame(() => {
      const send = () => {
        busy.current = true;
        getPool()
          .preview(ctx, { sampleId, gate })
          .then((r) => live && setHoverCounts({ parent: r.parentCount, regions: r.regions }))
          .catch(() => {})
          .finally(() => {
            busy.current = false;
            const n = next.current;
            next.current = null;
            n?.();
          });
      };
      if (busy.current) next.current = send;
      else send();
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      next.current = null;
    };
    // key captures gate; ctx/sample changes restart the preview
  }, [key, ctx, sampleId]);
  return hoverCounts;
}
