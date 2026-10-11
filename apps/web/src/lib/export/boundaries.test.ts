import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Figures become files only in lib/export, so a fix to export (fonts, styles, a format) reaches every
 * view. Elsewhere, code describes a figure (`svgFigure`, `plotFigure`) and shows an ExportMenu.
 */
const src = new URL('../..', import.meta.url).pathname;
const exportDir = new URL('.', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const outside = files(src).filter((f) => !f.startsWith(exportDir) && !/\.test\.tsx?$/.test(f));
const offenders = (re: RegExp) =>
  outside.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(src, f));

describe('figure export boundaries', () => {
  it('only lib/export writes figure files (PDF libraries, SVG serializing, canvas encoding)', () => {
    expect(offenders(/from 'jspdf'|from 'svg2pdf\.js'|import\('(jspdf|svg2pdf\.js)'\)/)).toEqual([]);
    expect(offenders(/XMLSerializer|\.toBlob\(|\.toDataURL\(/)).toEqual([]);
  });

  it('every Export button is the shared ExportMenu', () => {
    const own = offenders(/className="export-(menu|pop)"|'export-menu'/);
    expect(own).toEqual(['components/controls/ExportMenu.tsx']);
  });
});
