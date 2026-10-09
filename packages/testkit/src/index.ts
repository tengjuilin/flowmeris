import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export * from './synthetic.ts';

/** Absolute path of the repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function fixturePath(rel: string): string {
  return resolve(REPO_ROOT, 'fixtures', rel);
}

export function hasFixture(rel: string): boolean {
  return existsSync(fixturePath(rel));
}

export function readFixture(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath(rel)));
}

export function readGolden<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(fixturePath(`golden/${rel}`), 'utf8')) as T;
}

/**
 * Tolerance policy (docs/validation/tolerances.md). Values are compared as
 * |a − b| ≤ abs + rel·max(|a|, |b|).
 */
export const TOL = {
  /** Parsing and linearisation: exact, up to a few ULP for pow(). */
  linearize: { rel: 1e-14, abs: 0 },
  /** Compensation (LU inverse vs NumPy's inverse). */
  compensation: { rel: 1e-9, abs: 1e-9 },
  /** Transforms (iterative logicle/hyperlog solvers). */
  transform: { rel: 1e-10, abs: 1e-12 },
  /** Summary statistics. */
  stats: { rel: 1e-12, abs: 1e-12 },
  /** Student's t quantiles and CDF (incomplete beta continued fraction; bisection to 1e-14). */
  tdist: { rel: 1e-10, abs: 1e-12 },
  /** Formula columns: elementary functions (log, exp, pow) may differ from libm by an ULP or two. */
  formula: { rel: 1e-14, abs: 0 },
  /** Binned densities after smoothing, and contour levels on them. */
  density: { rel: 1e-12, abs: 1e-15 },
} as const;

export function isClose(a: number | null, b: number | null, tol: { rel: number; abs: number }): boolean {
  if (a === null || b === null)
    return a === b || (a !== null && !Number.isFinite(a)) || (b !== null && !Number.isFinite(b));
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (a === b) return true;
  return Math.abs(a - b) <= tol.abs + tol.rel * Math.max(Math.abs(a), Math.abs(b));
}

/** Returns a list of human-readable mismatches (empty = all close). */
export function compareArrays(
  actual: ArrayLike<number>,
  expected: ArrayLike<number | null>,
  tol: { rel: number; abs: number },
  label = '',
  maxReport = 5,
): string[] {
  const out: string[] = [];
  if (actual.length !== expected.length) return [`${label}: length ${actual.length} ≠ ${expected.length}`];
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i] as number;
    const e = expected[i] as number | null;
    if (!isClose(a, e, tol)) {
      out.push(`${label}[${i}]: ${a} ≠ ${e}`);
      if (out.length >= maxReport) break;
    }
  }
  return out;
}

/** Kahan–Babuška (Neumaier) summation, to compare against Python's math.fsum. */
export function accurateSum(xs: ArrayLike<number>): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] as number;
    const t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += s - t + x;
    else c += x - t + s;
    s = t;
  }
  return s + c;
}
