import type { SampleData, StorageAdapter } from '@flowmeris/model';

/**
 * Origin Private File System storage for decoded sample columns (browser only).
 *
 * Layout: /flowmeris/samples/<sampleId>/meta.json + col_<i>.bin, one file per
 * channel so a plot reads only the channels it needs: loadSample reads the
 * metadata and each column is read on first use. Column files hold the
 * stored (pre-linearisation) values as little-endian Float32 or Float64.
 */

interface Meta {
  version: 1;
  sampleId: string;
  sha256: string;
  datasetIndex: number;
  eventCount: number;
  channels: SampleData['channels'];
  keywords: Record<string, string>;
  dtypes: ('f32' | 'f64')[];
}

type Dir = FileSystemDirectoryHandle;

async function samplesDir(create: boolean): Promise<Dir> {
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle('flowmeris', { create });
  return app.getDirectoryHandle('samples', { create });
}

async function writeFile(dir: Dir, name: string, data: ArrayBuffer | Uint8Array | string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const anyFh = fh as FileSystemFileHandle & {
    createWritable?: () => Promise<FileSystemWritableFileStream>;
    createSyncAccessHandle?: () => Promise<{
      truncate(n: number): void;
      write(b: Uint8Array, o: { at: number }): number;
      flush(): void;
      close(): void;
    }>;
  };
  if (typeof anyFh.createWritable === 'function') {
    const w = await anyFh.createWritable();
    await w.write(bytes);
    await w.close();
    return;
  }
  if (typeof anyFh.createSyncAccessHandle === 'function') {
    const h = await anyFh.createSyncAccessHandle();
    try {
      h.truncate(0);
      h.write(bytes, { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    return;
  }
  throw new Error('OPFS writes are not supported in this browser');
}

async function readFile(dir: Dir, name: string): Promise<ArrayBuffer> {
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).arrayBuffer();
}

export class OpfsStorage implements StorageAdapter {
  /** True if OPFS is usable (not available in some private-browsing modes). */
  static async available(): Promise<boolean> {
    try {
      if (!navigator.storage?.getDirectory) return false;
      const d = await samplesDir(true);
      // Unique name: several workers probe concurrently, and OPFS write handles are exclusive.
      const probe = `.probe-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
      await writeFile(d, probe, 'ok');
      await d.removeEntry(probe);
      return true;
    } catch {
      return false;
    }
  }

  async save(s: SampleData): Promise<void> {
    const dir = await (await samplesDir(true)).getDirectoryHandle(s.sampleId, { create: true });
    if (s.columns.includes(null)) throw new Error(`Sample ${s.sampleId} must be fully loaded to be saved`);
    const dtypes = s.columns.map((c) => (c instanceof Float32Array ? 'f32' : 'f64')) as Meta['dtypes'];
    for (let i = 0; i < s.columns.length; i++) {
      const c = s.columns[i]!;
      await writeFile(dir, `col_${i}.bin`, new Uint8Array(c.buffer, c.byteOffset, c.byteLength));
    }
    const meta: Meta = {
      version: 1,
      sampleId: s.sampleId,
      sha256: s.sha256,
      datasetIndex: s.datasetIndex,
      eventCount: s.eventCount,
      channels: s.channels,
      keywords: s.keywords,
      dtypes,
    };
    // meta.json last: its presence marks a complete write.
    await writeFile(dir, 'meta.json', JSON.stringify(meta));
  }

  async has(sampleId: string): Promise<boolean> {
    try {
      const dir = await (await samplesDir(false)).getDirectoryHandle(sampleId);
      await dir.getFileHandle('meta.json');
      return true;
    } catch {
      return false;
    }
  }

  async loadSample(sampleId: string): Promise<SampleData> {
    let dir: Dir;
    try {
      dir = await (await samplesDir(false)).getDirectoryHandle(sampleId);
    } catch {
      throw new Error(`Sample data for ${sampleId} is not in browser storage; re-add the original FCS file.`);
    }
    const meta = JSON.parse(new TextDecoder().decode(await readFile(dir, 'meta.json'))) as Meta;
    const loadColumn = async (i: number) => {
      const buf = await readFile(dir, `col_${i}.bin`);
      return meta.dtypes[i] === 'f32' ? new Float32Array(buf) : new Float64Array(buf);
    };
    return {
      sampleId: meta.sampleId,
      sha256: meta.sha256,
      datasetIndex: meta.datasetIndex,
      eventCount: meta.eventCount,
      channels: meta.channels,
      keywords: meta.keywords,
      columns: meta.dtypes.map(() => null),
      loadColumn,
    };
  }

  async remove(sampleId: string): Promise<void> {
    try {
      await (await samplesDir(false)).removeEntry(sampleId, { recursive: true });
    } catch {
      /* already gone */
    }
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    try {
      const d = await samplesDir(false);
      for await (const [name] of (d as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries())
        out.push(name);
    } catch {
      /* empty */
    }
    return out;
  }
}
