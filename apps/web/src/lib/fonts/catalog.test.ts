import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED,
  FACES,
  FONTS,
  FONT_ALIASES,
  FONT_MENU,
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

  it('lists the system fonts by name, each with a bundled font in its place where it is missing', () => {
    expect(FONT_MENU.map((id) => fontLabel(id))).toEqual([
      'Arial',
      'Helvetica',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
      'Consolas',
    ]);
    const ids = FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of FONT_MENU) expect(ids).toContain(id);
    for (const f of FONTS) expect(bundledFamily(f.fallback), f.id).toBeDefined();
    for (const [old, id] of Object.entries(FONT_ALIASES)) {
      expect(ids).not.toContain(old);
      expect(fontChoice(old)?.id).toBe(id);
    }
    for (const fam of Object.values(GENERIC_FAMILY)) expect(bundledFamily(fam)).toBeDefined();
  });

  it('bundles only fonts that some font falls back to', () => {
    const used = new Set([...FONTS.map((f) => f.fallback), ...Object.values(GENERIC_FAMILY)]);
    expect(BUNDLED.map((f) => f.family).filter((f) => !used.has(f))).toEqual([]);
  });

  it('keeps the font ids saved by earlier versions; charts saved with "sans" draw Arial', () => {
    const old = ['sans', 'arial', 'helvetica', 'calibri', 'verdana', 'tahoma', 'trebuchet', 'serif', 'times'];
    for (const id of [...old, 'georgia', 'palatino', 'garamond', 'mono', 'courier', 'consolas'])
      expect(fontChoice(id)).toBeDefined();
    expect(fontStack('sans')).toBe(fontStack('arial'));
  });

  it('gives a CSS stack of the system font, then its bundled stand-in', () => {
    expect(fontStack('arial')).toBe('"Arial", "Liberation Sans", sans-serif');
    expect(fontStack('helvetica')).toBe('"Helvetica", "Helvetica Neue", "Liberation Sans", sans-serif');
    expect(fontStack('consolas')).toBe('"Consolas", "DejaVu Sans Mono", monospace');
    expect(fontStack('georgia')).toBe('"Georgia", "Gelasio", serif');
    expect(fontStack('Futura')).toBe('"Futura", "Liberation Sans", sans-serif');
    expect(fontStack('a"b;c')).toBe('"abc", "Liberation Sans", sans-serif');
  });

  it('labels a font by its name', () => {
    expect(fontLabel('times')).toBe('Times New Roman');
    expect(fontLabel('mono')).toBe('Monospace');
    expect(fontLabel('Futura')).toBe('Futura');
  });
});
