import { clamp } from './math.ts';

/** A font size kept within 4–48 px, as every text-size field of the settings panels allows. */
export const clampFontSize = (px: number) => clamp(px, 4, 48);

/**
 * Set the base font size of `fonts` to `px` (clamped to 4–48), scaling the sizes `keys` by the same
 * factor, to the nearest half pixel (call inside `mutate`). False if the base size is unchanged.
 */
export function scaleFontSizes<K extends string>(
  fonts: Record<'fontSize' | K, number>,
  keys: readonly K[],
  px: number,
): boolean {
  const next = clampFontSize(px);
  if (next === fonts.fontSize) return false;
  const k = next / fonts.fontSize;
  fonts.fontSize = next;
  for (const key of keys) fonts[key] = clampFontSize(Math.round(fonts[key] * k * 2) / 2);
  return true;
}
