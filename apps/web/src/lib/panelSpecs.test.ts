import { describe, expect, it } from 'vitest';
import { ALL_PANELS } from './panelSpecs.ts';
import { specProblems } from './settingsPanel.ts';

describe('settings panel specs', () => {
  it.each(ALL_PANELS.map((s) => [s.name, s] as const))(
    '%s: ids are unique and the default tab exists',
    (_, s) => {
      expect(specProblems(s)).toEqual([]);
    },
  );

  it('each panel has its own element ids and storage', () => {
    const own = ALL_PANELS.filter((s) => s.idPrefix !== 'gate');
    expect(new Set(own.map((s) => s.idPrefix)).size).toBe(own.length);
    expect(new Set(ALL_PANELS.map((s) => s.key)).size).toBe(ALL_PANELS.length);
  });
});
