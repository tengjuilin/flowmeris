import { type Workspace, canonicalJson, loadWorkspace } from '@flowmeris/model';
import { openDB } from 'idb';
import type { SaveState } from '../lib/saveStatus.ts';
import { useStore } from './store.ts';

/**
 * Autosave (IndexedDB): the current workspace, debounced 1 s, plus a ring of
 * the last 20 snapshots for crash recovery.
 */

const DB = openDB('flowmeris', 1, {
  upgrade(db) {
    db.createObjectStore('workspace');
    db.createObjectStore('snapshots', { autoIncrement: true });
  },
});

export async function loadAutosave(): Promise<Workspace | null> {
  try {
    const raw = await (await DB).get('workspace', 'current');
    return raw ? loadWorkspace(raw) : null;
  } catch (e) {
    console.warn('Autosave could not be restored', e);
    return null;
  }
}

/** Snapshots kept. */
const SNAPSHOTS = 20;

let timer: ReturnType<typeof setTimeout> | null = null;
let last: Workspace | null = null;

/** Reports the autosave's state (`status.save`, shown in the header), keeping the last save's time. */
function report(state: SaveState['state'], error?: string) {
  const st = useStore.getState();
  const at = state === 'saved' ? Date.now() : st.status.save.at;
  st.setStatus({ save: { state, at, ...(error ? { error } : {}) } });
}

export function startAutosave() {
  useStore.subscribe((s) => {
    if (s.ws === last) return;
    last = s.ws;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(s.ws), 1000);
    if (s.status.save.state !== 'unsaved') report('unsaved');
  });
}

async function save(ws: Workspace) {
  report('saving');
  try {
    const db = await DB;
    // One transaction: the workspace, a new snapshot, and the snapshots older than the last 20 dropped
    // with one range delete (keys ascend, so they are the ones below the 20th newest).
    const tx = db.transaction(['workspace', 'snapshots'], 'readwrite');
    const snapshots = tx.objectStore('snapshots');
    // Requests run in order, so the keys include the new snapshot's.
    const [, , keys] = await Promise.all([
      tx.objectStore('workspace').put(ws, 'current'),
      snapshots.add({ at: new Date().toISOString(), ws }),
      snapshots.getAllKeys(),
    ]);
    const oldestKept = keys[keys.length - SNAPSHOTS];
    await Promise.all([
      oldestKept !== undefined && snapshots.delete(IDBKeyRange.upperBound(oldestKept, true)),
      tx.done,
    ]);
    // A change made while writing waits for its own save.
    report(useStore.getState().ws === ws ? 'saved' : 'unsaved');
  } catch (e) {
    console.warn('Autosave failed', e);
    report('failed', e instanceof Error ? e.message : String(e));
  }
}

/** Workspace file (canonical JSON, pretty-printed for diffs). */
export function workspaceToFile(ws: Workspace): Blob {
  const pretty = JSON.stringify(JSON.parse(canonicalJson(ws)), null, 1);
  return new Blob([pretty], { type: 'application/json' });
}
