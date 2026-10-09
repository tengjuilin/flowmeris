import { type Sample, type Workspace, newGroup } from '@flowmeris/model';
import { wellFromSample } from '@flowmeris/table';
import { newPlot } from './defaults.ts';

/**
 * Turning dropped or chosen files into groups. The store command that runs the workers and updates
 * the UI is state/commands/ingest.ts `ingestFiles`.
 */

export interface InputFile {
  file: File;
  /** Path relative to the chosen folder, including the folder name. */
  path: string;
}

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

/** The folder a file was chosen from (its path without the file name), or "Ungrouped files". */
export function folderOf(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Ungrouped files';
}

/** The samples parsed from one file, and the folder it came from. */
export interface IngestedFile {
  folder: string;
  samples: Sample[];
}

/**
 * Add ingested samples to the workspace, in place (call inside `mutate`). Samples already in the
 * workspace (same id: SHA-256 and dataset) are re-linked rather than duplicated. New samples are
 * grouped by folder, then by identical channel ($PnN) lists: the largest set takes the folder's name,
 * the others become "<folder> (channel set n)". Each new group gets a Gate view plot of all events.
 * Sorts `results` by folder.
 */
export function addIngested(
  ws: Workspace,
  results: IngestedFile[],
): { relinked: string[]; firstNewGroup: string | null } {
  const relinked: string[] = [];
  let firstNewGroup: string | null = null;
  const byFolder = new Map<string, Sample[]>();
  for (const r of results.sort((a, b) => a.folder.localeCompare(b.folder))) {
    for (const s of r.samples) {
      if (ws.samples[s.id]) {
        relinked.push(s.id);
        continue;
      }
      const well = wellFromSample(s);
      ws.samples[s.id] = well ? { ...s, well } : s;
      if (!byFolder.has(r.folder)) byFolder.set(r.folder, []);
      byFolder.get(r.folder)!.push(ws.samples[s.id]!);
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
  return { relinked, firstNewGroup };
}
