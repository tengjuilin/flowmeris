import { type Sample, newWorkspace } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { addIngested, folderOf } from './ingest.ts';

const sample = (id: string, fileName: string, pnns = ['FSC-A', 'FL1-A'], keywords = {}): Sample =>
  ({
    id,
    fileName,
    relativePath: `x/${fileName}`,
    datasetIndex: 0,
    keywords,
    channels: pnns.map((pnn) => ({ pnn })),
    meta: {},
  }) as unknown as Sample;

const ws = () => newWorkspace('W', { version: 'test', commit: 'test', kernels: 'test' });

describe('ingesting files', () => {
  it('takes the folder from the relative path', () => {
    expect(folderOf('Plate 1/day2/A1.fcs')).toBe('Plate 1/day2');
    expect(folderOf('A1.fcs')).toBe('Ungrouped files');
  });

  it('makes one group per folder, samples in natural file order, with a Gate plot', () => {
    const w = ws();
    const { firstNewGroup } = addIngested(w, [
      { folder: 'B', samples: [sample('s3', 'b.fcs')] },
      { folder: 'A', samples: [sample('s10', 'tube10.fcs'), sample('s2', 'tube2.fcs')] },
    ]);
    expect(w.groups.map((g) => [g.name, g.sampleIds])).toEqual([
      ['A', ['s2', 's10']],
      ['B', ['s3']],
    ]);
    expect(firstNewGroup).toBe(w.groups[0]!.id);
    expect(w.groups.every((g) => g.plots.length === 1 && g.plots[0]!.population === 'root')).toBe(true);
  });

  it('splits a folder by channel set, the largest set keeping the folder name', () => {
    const w = ws();
    addIngested(w, [
      {
        folder: 'F',
        samples: [sample('a', 'a.fcs', ['X']), sample('b', 'b.fcs'), sample('c', 'c.fcs')],
      },
    ]);
    expect(w.groups.map((g) => [g.name, g.sampleIds, g.channels])).toEqual([
      ['F', ['b', 'c'], ['FSC-A', 'FL1-A']],
      ['F (channel set 2)', ['a'], ['X']],
    ]);
  });

  it('re-links samples already in the workspace instead of adding them again', () => {
    const w = ws();
    addIngested(w, [{ folder: 'F', samples: [sample('a', 'a.fcs')] }]);
    const { relinked, firstNewGroup } = addIngested(w, [{ folder: 'F', samples: [sample('a', 'a.fcs')] }]);
    expect(relinked).toEqual(['a']);
    expect(firstNewGroup).toBeNull();
    expect(w.groups).toHaveLength(1);
  });

  it('reads the plate well from keywords or the file name', () => {
    const w = ws();
    addIngested(w, [
      {
        folder: 'F',
        samples: [sample('a', 'Specimen_001_B3.fcs'), sample('b', 'x.fcs', undefined, { $WELLID: 'C4' })],
      },
    ]);
    expect(w.samples.a!.well).toBe('B03');
    expect(w.samples.b!.well).toBe('C04');
  });
});
