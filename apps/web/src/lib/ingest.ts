import { type Sample, newGroup } from '@flowmeris/model';
import { pool } from '../engine-client/pool.ts';
import { toast, useStore } from '../state/store.ts';
import { newPlot } from './defaults.ts';

export interface InputFile {
  file: File;
  /** Path relative to the chosen folder, including the folder name. */
  path: string;
}

const FCS_RE = /\.(fcs|lmd)$/i;

/** Collect files from a drag-and-drop DataTransfer, recursing into folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<InputFile[]> {
  const out: InputFile[] = [];
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
    if (e.isFile) {
      const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: prefix + file.name });
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const c of batch) await walk(c, `${prefix}${e.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

export function filesFromInput(list: FileList): InputFile[] {
  return Array.from(list).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

function folderOf(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Ungrouped files';
}

/**
 * Ingest FCS files. Files are grouped by their folder; each folder becomes a
 * group sharing one analysis pipeline. Samples already in the workspace (same
 * SHA-256 and dataset) are re-linked rather than duplicated.
 */
export async function ingestFiles(files: InputFile[]): Promise<void> {
  const fcs = files.filter((f) => FCS_RE.test(f.file.name));
  const { setUi } = useStore.getState();
  if (fcs.length === 0) {
    toast('No .fcs or .lmd files found in the selection.');
    return;
  }
  const progress = {
    total: fcs.length,
    done: 0,
    current: '',
    errors: [] as { file: string; message: string }[],
  };
  setUi({ ingest: { ...progress } });
  const results: { folder: string; samples: Sample[] }[] = [];
  let cursor = 0;
  const workerLoop = async () => {
    while (cursor < fcs.length) {
      const f = fcs[cursor++]!;
      progress.current = f.path;
      setUi({ ingest: { ...progress, errors: [...progress.errors] } });
      try {
        const r = await pool.ingest(f.file, f.path);
        results.push({ folder: folderOf(f.path), samples: r.samples });
      } catch (e) {
        progress.errors.push({ file: f.path, message: e instanceof Error ? e.message : String(e) });
      }
      progress.done++;
      setUi({ ingest: { ...progress, errors: [...progress.errors] } });
    }
  };
  await Promise.all(Array.from({ length: pool.size }, workerLoop));

  const relinked: string[] = [];
  let firstNewGroup: string | null = null;
  useStore.getState().mutate('Add FCS files', (ws) => {
    const byFolder = new Map<string, Sample[]>();
    for (const r of results.sort((a, b) => a.folder.localeCompare(b.folder))) {
      for (const s of r.samples) {
        if (ws.samples[s.id]) {
          relinked.push(s.id);
          continue;
        }
        ws.samples[s.id] = s;
        if (!byFolder.has(r.folder)) byFolder.set(r.folder, []);
        byFolder.get(r.folder)!.push(s);
      }
    }
    for (const [folder, samples] of byFolder) {
      samples.sort(
        (a, b) =>
          a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }) ||
          a.datasetIndex - b.datasetIndex,
      );
      // Group by identical channel ($PnN) lists; mismatching samples form their own group.
      const sets = new Map<string, Sample[]>();
      for (const s of samples) {
        const key = s.channels.map((c) => c.pnn).join('\u0001');
        if (!sets.has(key)) sets.set(key, []);
        sets.get(key)!.push(s);
      }
      let k = 0;
      for (const list of [...sets.values()].sort((a, b) => b.length - a.length)) {
        const name = k === 0 ? folder : `${folder} (channel set ${k + 1})`;
        const g = newGroup(
          name,
          list.map((s) => s.id),
          list[0]!.channels.map((c) => c.pnn),
        );
        ws.groups.push(g);
        newPlot(ws, g, 'root');
        firstNewGroup ??= g.id;
        k++;
      }
    }
  });
  const missing = { ...useStore.getState().ui.missing };
  for (const id of relinked) delete missing[id];
  const st = useStore.getState();
  const g = firstNewGroup ? st.ws.groups.find((x) => x.id === firstNewGroup) : undefined;
  setUi({
    ingest: progress.errors.length ? { ...progress } : null,
    missing,
    ...(g
      ? {
          groupId: g.id,
          sampleId: g.sampleIds[0] ?? null,
          popId: 'root',
          plotId: g.plots[0]?.id ?? null,
          view: 'gate',
        }
      : {}),
  });
  const parts = [`${results.reduce((a, r) => a + r.samples.length, 0)} sample(s) loaded`];
  if (relinked.length) parts.push(`${relinked.length} re-linked`);
  if (progress.errors.length) parts.push(`${progress.errors.length} file(s) failed`);
  toast(parts.join(' · '));
}

/** After restoring a workspace, find samples whose decoded data is not in browser storage. */
export async function checkMissing(): Promise<void> {
  await pool.whenReady();
  const ws = useStore.getState().ws;
  const missing: Record<string, true> = {};
  await Promise.all(
    Object.keys(ws.samples).map(async (id) => {
      if (!(await pool.hasSample(id))) missing[id] = true;
    }),
  );
  useStore.getState().setUi({ missing });
}
