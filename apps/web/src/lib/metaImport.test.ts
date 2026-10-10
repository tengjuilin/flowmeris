import type { Variable, Workspace } from '@flowmeris/model';
import type { PlateBlock } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { type Target, importPlate, importTable, initialTargets, matchTargets } from './metaImport.ts';

const dose: Variable = { id: 'dose', name: 'Dose', type: 'numeric', levels: [] };
const ws = (): Workspace =>
  ({
    variables: [dose],
    samples: {
      a: { id: 'a', fileName: 'a.fcs', well: 'A01', meta: {} },
      b: { id: 'b', fileName: 'b.fcs', label: 'Bee', meta: {} },
    },
  }) as unknown as Workspace;

describe('importing sample variables', () => {
  it('maps columns to the variable of the same name or a new one, leaving out ids, empties and the key', () => {
    const t = initialTargets(
      ['file_name', ' dose ', 'Cell line', 'Empty', 'Well'],
      [['a.fcs'], ['1'], ['HeLa'], [' '], ['A01']],
      [dose],
      0,
    );
    expect(t.map((x) => [x.include, x.to, x.type])).toEqual([
      [false, 'new', 'categorical'],
      [true, 'dose', 'numeric'],
      [true, 'new', 'categorical'],
      [false, 'new', 'categorical'],
      [false, 'new', 'categorical'],
    ]);
  });

  it('matches samples by file name, label (else short name) and well', () => {
    expect(matchTargets(ws(), ['a', 'b', 'gone'], { a: 'A' })).toEqual([
      { id: 'a', fileName: 'a.fcs', name: 'A', well: 'A01' },
      { id: 'b', fileName: 'b.fcs', name: 'Bee' },
    ]);
  });

  it('imports table rows into matched samples, skipping blanks and counting bad numbers', () => {
    const w = ws();
    const targets: Target[] = [
      { include: true, to: 'new', name: 'key', type: 'categorical' },
      { include: true, to: 'dose', name: 'Dose', type: 'numeric' },
      { include: true, to: 'new', name: 'Line', type: 'categorical' },
    ];
    const rows = [
      ['a.fcs', '5', 'HeLa'],
      ['b.fcs', 'lots', ''],
    ];
    expect(importTable(w, rows, targets, 0, [['a'], ['b']])).toEqual({ set: 2, bad: 1 });
    const line = w.variables.find((v) => v.name === 'Line')!;
    expect(w.variables).toHaveLength(2);
    expect(w.samples.a!.meta).toEqual({ dose: 5, [line.id]: 'HeLa' });
    expect(w.samples.b!.meta).toEqual({});
  });

  it('imports plate blocks into the samples in their wells', () => {
    const w = ws();
    const samples = matchTargets(w, ['a', 'b'], {});
    const blocks: PlateBlock[] = [
      { name: 'Dose', values: { A01: '2', B01: '3' } },
      { name: 'Skip', values: { A01: 'x' } },
    ];
    const targets: Target[] = [
      { include: true, to: 'dose', name: 'Dose', type: 'numeric' },
      { include: false, to: 'new', name: 'Skip', type: 'categorical' },
    ];
    expect(importPlate(w, blocks, targets, samples)).toEqual({ set: 1, bad: 0 });
    expect(w.samples.a!.meta).toEqual({ dose: 2 });
    expect(w.variables).toHaveLength(1);
  });
});
