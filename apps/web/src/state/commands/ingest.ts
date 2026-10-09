import { pool } from '../../engine-client/pool.ts';
import { DATA_FILE_RE } from '../../lib/files.ts';
import { type IngestedFile, type InputFile, addIngested, folderOf } from '../../lib/ingest.ts';
import { toast, useStore } from '../store.ts';

/**
 * Ingest FCS files. Files are grouped by their folder; each folder becomes a
 * group sharing one analysis pipeline. Samples already in the workspace (same
 * SHA-256 and dataset) are re-linked rather than duplicated.
 */
export async function ingestFiles(files: InputFile[]): Promise<void> {
  const fcs = files.filter((f) => DATA_FILE_RE.test(f.file.name));
  const { setUi, setStatus } = useStore.getState();
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
  setStatus({ ingest: { ...progress } });
  const results: IngestedFile[] = [];
  let cursor = 0;
  const workerLoop = async () => {
    while (cursor < fcs.length) {
      const f = fcs[cursor++]!;
      progress.current = f.path;
      setStatus({ ingest: { ...progress, errors: [...progress.errors] } });
      try {
        const r = await pool.ingest(f.file, f.path);
        results.push({ folder: folderOf(f.path), samples: r.samples });
      } catch (e) {
        progress.errors.push({ file: f.path, message: e instanceof Error ? e.message : String(e) });
      }
      progress.done++;
      setStatus({ ingest: { ...progress, errors: [...progress.errors] } });
    }
  };
  await Promise.all(Array.from({ length: pool.size }, workerLoop));

  let added: ReturnType<typeof addIngested> = { relinked: [], firstNewGroup: null };
  useStore.getState().mutate('Add FCS files', (ws) => {
    added = addIngested(ws, results);
  });
  const { relinked, firstNewGroup } = added;
  const missing = { ...useStore.getState().status.missing };
  for (const id of relinked) delete missing[id];
  const st = useStore.getState();
  const g = firstNewGroup ? st.ws.groups.find((x) => x.id === firstNewGroup) : undefined;
  setStatus({ ingest: progress.errors.length ? { ...progress } : null, missing });
  setUi({
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
  useStore.getState().setStatus({ missing });
}
