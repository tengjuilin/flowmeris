import type { SampleData } from '@flowmeris/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpfsStorage } from './index.ts';

/**
 * An in-memory stand-in for the OPFS handles OpfsStorage uses. A file handle writes through
 * `createWritable` (main thread) or, with `syncOnly`, only through `createSyncAccessHandle` (workers
 * in browsers without writable streams).
 */
class FakeFile {
  bytes = new Uint8Array(0);
  constructor(private syncOnly: boolean) {}
  get createWritable() {
    if (this.syncOnly) return undefined;
    return async () => {
      const parts: Uint8Array[] = [];
      return {
        write: async (b: Uint8Array) => void parts.push(b.slice()),
        close: async () => {
          this.bytes = new Uint8Array(parts.flatMap((p) => [...p]));
        },
      };
    };
  }
  get createSyncAccessHandle() {
    if (!this.syncOnly) return undefined;
    return async () => ({
      truncate: (n: number) => {
        this.bytes = this.bytes.slice(0, n);
      },
      write: (b: Uint8Array, { at }: { at: number }) => {
        const out = new Uint8Array(Math.max(this.bytes.length, at + b.length));
        out.set(this.bytes);
        out.set(b, at);
        this.bytes = out;
        return b.length;
      },
      flush: () => {},
      close: () => {},
    });
  }
  async getFile() {
    const copy = this.bytes.slice();
    return { arrayBuffer: async () => copy.buffer };
  }
}

const notFound = (name: string) => Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' });

class FakeDir {
  entriesMap = new Map<string, FakeDir | FakeFile>();
  constructor(private syncOnly = false) {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.entriesMap.get(name);
    if (!d && opts?.create) this.entriesMap.set(name, (d = new FakeDir(this.syncOnly)));
    if (!(d instanceof FakeDir)) throw notFound(name);
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let f = this.entriesMap.get(name);
    if (!f && opts?.create) this.entriesMap.set(name, (f = new FakeFile(this.syncOnly)));
    if (!(f instanceof FakeFile)) throw notFound(name);
    return f;
  }
  async removeEntry(name: string, opts?: { recursive?: boolean }) {
    const e = this.entriesMap.get(name);
    if (!e) throw notFound(name);
    if (e instanceof FakeDir && e.entriesMap.size > 0 && !opts?.recursive) throw new Error('not empty');
    this.entriesMap.delete(name);
  }
  async *entries(): AsyncIterable<[string, unknown]> {
    yield* this.entriesMap.entries();
  }
}

function useOpfs(root: FakeDir | null) {
  vi.stubGlobal('navigator', { storage: root ? { getDirectory: async () => root } : {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sample = (over: Partial<SampleData> = {}): SampleData => ({
  sampleId: 's1',
  sha256: 'abc',
  datasetIndex: 0,
  eventCount: 3,
  channels: [
    { pnn: 'FSC-A', scaling: { logDecades: 0, logOffset: 0, range: 1024, gain: 1, timestep: 1 } },
    { pnn: 'FL1-A', scaling: { logDecades: 4, logOffset: 1, range: 1024, gain: 1, timestep: 1 } },
  ],
  columns: [Float32Array.of(1, 2.5, 3), Float64Array.of(0.1, 1e300, -4)],
  keywords: { $TOT: '3' },
  ...over,
});

describe('OpfsStorage', () => {
  it.each([
    ['writable streams', false],
    ['sync access handles', true],
  ])('saves a sample and reads it back column by column (%s)', async (_, syncOnly) => {
    useOpfs(new FakeDir(syncOnly));
    const st = new OpfsStorage();
    expect(await st.has('s1')).toBe(false);
    await st.save(sample());
    expect(await st.has('s1')).toBe(true);
    expect(await st.list()).toEqual(['s1']);

    const s = await st.loadSample('s1');
    const { columns, loadColumn, ...meta } = s;
    const { columns: _c, ...want } = sample();
    expect(meta).toEqual(want);
    // Columns are read on first use, with their stored precision.
    expect(columns).toEqual([null, null]);
    expect(await loadColumn!(0)).toEqual(Float32Array.of(1, 2.5, 3));
    expect(await loadColumn!(1)).toEqual(Float64Array.of(0.1, 1e300, -4));
  });

  it('overwrites a sample saved again', async () => {
    useOpfs(new FakeDir(true));
    const st = new OpfsStorage();
    await st.save(sample({ columns: [Float32Array.of(9, 9, 9, 9), Float64Array.of(9, 9, 9, 9)] }));
    await st.save(sample());
    expect(await (await st.loadSample('s1')).loadColumn!(0)).toEqual(Float32Array.of(1, 2.5, 3));
  });

  it('refuses to save a sample whose columns are not all loaded', async () => {
    useOpfs(new FakeDir());
    await expect(
      new OpfsStorage().save(sample({ columns: [Float32Array.of(1, 2, 3), null] })),
    ).rejects.toThrow('must be fully loaded');
  });

  it('counts a sample without meta.json (an interrupted save) as missing', async () => {
    const root = new FakeDir();
    useOpfs(root);
    const st = new OpfsStorage();
    await st.save(sample());
    const dir = await (
      await (await root.getDirectoryHandle('flowmeris')).getDirectoryHandle('samples')
    ).getDirectoryHandle('s1');
    await dir.removeEntry('meta.json');
    expect(await st.has('s1')).toBe(false);
  });

  it('removes a sample, and says to re-add the file when one is not stored', async () => {
    useOpfs(new FakeDir());
    const st = new OpfsStorage();
    await st.save(sample());
    await st.remove('s1');
    await st.remove('s1');
    expect(await st.list()).toEqual([]);
    await expect(st.loadSample('s1')).rejects.toThrow('re-add the original FCS file');
  });

  it('lists nothing before anything is stored', async () => {
    useOpfs(new FakeDir());
    expect(await new OpfsStorage().list()).toEqual([]);
  });

  it('is available only when OPFS can be written, and leaves no probe file behind', async () => {
    const root = new FakeDir();
    useOpfs(root);
    expect(await OpfsStorage.available()).toBe(true);
    const samples = await (await root.getDirectoryHandle('flowmeris')).getDirectoryHandle('samples');
    expect(samples.entriesMap.size).toBe(0);

    useOpfs(null);
    expect(await OpfsStorage.available()).toBe(false);

    // Neither kind of write handle (e.g. Safari's main thread).
    const noWrites = new FakeDir(true);
    useOpfs(noWrites);
    vi.spyOn(FakeFile.prototype, 'createSyncAccessHandle', 'get').mockReturnValue(undefined);
    expect(await OpfsStorage.available()).toBe(false);
  });
});
