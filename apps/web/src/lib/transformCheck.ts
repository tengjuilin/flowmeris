import { type Transform, TransformSchema } from '@flowmeris/model';
import { makeScale } from '@flowmeris/transforms';

/** Why a scale's parameters can't be used, for the axis editor to refuse them (M-TR-*). */

const SCALE_NAMES: Record<Transform['kind'], string> = {
  flin: 'Linear',
  flog: 'Log10',
  fasinh: 'Arcsinh',
  logicle: 'Logicle',
  hyperlog: 'Hyperlog',
};

/**
 * Why `t` is not a usable scale, or null when it is: first the workspace schema's limits (a saved
 * workspace must pass them), then those the scale itself checks (e.g. logicle's W ≤ M/2).
 */
export function transformError(t: Transform): string | null {
  const parsed = TransformSchema.safeParse(t);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const name = `${SCALE_NAMES[t.kind]}: ${issue.path.join('.')}`;
    if (issue.code === 'too_small') return `${name} must be ${issue.inclusive ? '≥' : '>'} ${issue.minimum}`;
    return `${name} must be a finite number`;
  }
  try {
    makeScale(t);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

/** Why `c` is not a usable arcsinh cofactor, or null when it is. */
export function cofactorError(c: number): string | null {
  return c > 0 && Number.isFinite(c) ? null : 'Arcsinh: cofactor must be > 0';
}
