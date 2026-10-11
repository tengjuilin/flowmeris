import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED,
  FACES,
  FONT_ALIASES,
  FONT_GROUPS,
  GENERIC_FAMILY,
  bundledFamily,
  fontChoice,
  fontLabel,
  fontStack,
} from './catalog.ts';

const lock = JSON.parse(
  readFileSync(new URL('../../../../../tools/fonts.lock.json', import.meta.url), 'utf8'),
) as {
  dest: string;
  files: { file: string }[];
};
const locked = lock.files.map((f) => f.file);

describe('font catalog', () => {
  it('bundles every face of every family, and fetches exactly those files', () => {
    const files = BUNDLED.flatMap((f) => FACES.map((face) => f.files[face]));
    expect(new Set(files).size).toBe(files.length);
    expect(files.toSorted()).toEqual(locked.filter((f) => f.endsWith('.ttf')).toSorted());
    expect(lock.dest).toBe('apps/web/src/assets/fonts');
  });

  it('fetches a license with every family', () => {
    const licenses = new Set(BUNDLED.map((f) => f.license));
    expect([...licenses].toSorted()).toEqual(locked.filter((f) => f.endsWith('.LICENSE.txt')).toSorted());
  });

  it('draws every menu font, old font id and generic family in a bundled family', () => {
    const ids = FONT_GROUPS.flatMap((g) => g.fonts.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of FONT_GROUPS) for (const f of g.fonts) expect(bundledFamily(f.family)).toBeDefined();
    for (const [old, id] of Object.entries(FONT_ALIASES)) {
      expect(ids).not.toContain(old);
      expect(fontChoice(old)?.id).toBe(id);
    }
    for (const fam of Object.values(GENERIC_FAMILY)) expect(bundledFamily(fam)).toBeDefined();
  });

  it('keeps the font ids saved by earlier versions', () => {
    const old = ['sans', 'arial', 'helvetica', 'calibri', 'verdana', 'tahoma', 'trebuchet', 'serif', 'times'];
    for (const id of [...old, 'georgia', 'palatino', 'garamond', 'mono', 'courier', 'consolas'])
      expect(fontChoice(id)).toBeDefined();
  });

  it('gives a CSS stack of the bundled family, or an installed font with the bundled sans-serif after it', () => {
    expect(fontStack('arial')).toBe('"Liberation Sans", sans-serif');
    expect(fontStack('georgia')).toBe('"Gelasio", serif');
    expect(fontStack('courier')).toBe('"Liberation Mono", monospace');
    expect(fontStack('Futura')).toBe('"Futura", "Liberation Sans", sans-serif');
    expect(fontStack('a"b;c')).toBe('"abc", "Liberation Sans", sans-serif');
  });

  it('labels a font by its family and what it stands in for', () => {
    expect(fontLabel('times')).toBe('Liberation Serif (Times New Roman metrics)');
    expect(fontLabel('garamond')).toBe('EB Garamond');
    expect(fontLabel('Futura')).toBe('Futura');
  });
});
