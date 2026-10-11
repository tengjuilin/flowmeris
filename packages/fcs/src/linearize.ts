import type { ChannelScaling } from './types.ts';

/**
 * Convert stored channel values to linear data values (method M-FCS-LIN).
 *
 *   log channel  ($PnE f1 > 0):  x = 10^(f1 · c / $PnR) · f2
 *   linear channel:              x = c
 *   then                         x = x / gain        (gain = $PnG, 1 for time)
 *   time channel:                x = c · $TIMESTEP
 *
 * The operation order and float64 arithmetic match FlowKit's Sample
 * pre-processing so results agree to the last few ULPs.
 */
export function linearize(stored: ArrayLike<number>, s: ChannelScaling, out?: Float64Array): Float64Array {
  const n = stored.length;
  const res = out ?? new Float64Array(n);
  const { logDecades, logOffset, range, gain, timestep } = s;
  if (logDecades > 0) {
    for (let i = 0; i < n; i++)
      res[i] = (10 ** ((logDecades * (stored[i] as number)) / range) * logOffset) / gain;
  } else if (timestep !== 1) {
    for (let i = 0; i < n; i++) res[i] = ((stored[i] as number) * timestep) / gain;
  } else if (gain !== 1) {
    for (let i = 0; i < n; i++) res[i] = (stored[i] as number) / gain;
  } else {
    for (let i = 0; i < n; i++) res[i] = stored[i] as number;
  }
  return res;
}

/** True when linearization is the identity, so stored values can be used directly. */
export function isIdentityScaling(s: ChannelScaling): boolean {
  return s.logDecades <= 0 && s.gain === 1 && s.timestep === 1;
}
