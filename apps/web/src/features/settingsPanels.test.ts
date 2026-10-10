import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every settings panel is drawn by components/ui/settings: a feature builds no panel frame, tabs or
 * cards of its own (the `insp-*` frame classes, the tab panel), so a change there reaches every panel.
 */
const root = new URL('.', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  );
const FRAME = /insp-(panel|head|tabs|global|section)\b|role="tabpanel"|role="tablist"/;

describe('settings panels', () => {
  it('no feature draws a panel frame, tab strip or card of its own', () => {
    const offenders = files(root).filter((f) => FRAME.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
});
