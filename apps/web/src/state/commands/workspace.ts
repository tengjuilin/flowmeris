import { loadWorkspace, newWorkspace } from '@flowmeris/model';
import { download, safeName } from '../../lib/download.ts';
import { workspaceToFile } from '../persist.ts';
import { APP_INFO, timestampName, toast, useStore } from '../store.ts';
import { checkMissing } from './ingest.ts';

/** Commands on the whole workspace: save it as a file, open one, start a new one. */

/** Download the workspace as `<name>.flowmeris.json` (the analysis only; FCS data are not included). */
export function saveWorkspaceFile() {
  const ws = useStore.getState().ws;
  download(`${safeName(ws.name)}.flowmeris.json`, workspaceToFile(ws));
}

/**
 * Open a saved workspace file in place of the current one, then report the samples whose FCS data must
 * be added again (they are re-linked by SHA-256 when their folder is added).
 */
export async function openWorkspaceFile(f: File) {
  try {
    const w = loadWorkspace(JSON.parse(await f.text()));
    useStore.getState().setWorkspace(w);
    await checkMissing();
    const n = Object.keys(useStore.getState().status.missing).length;
    toast(
      n
        ? `Workspace opened. ${n} sample(s) need their FCS files: add the folder(s) again to re-link by SHA-256.`
        : 'Workspace opened.',
    );
  } catch (err) {
    toast(`Could not open workspace: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Replace the workspace with a new, empty one named after the current time. */
export function startNewWorkspace() {
  useStore.getState().setWorkspace(newWorkspace(timestampName(), APP_INFO));
}
