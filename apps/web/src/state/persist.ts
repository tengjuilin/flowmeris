import { type Workspace, canonicalJson, loadWorkspace } from '@flowmeris/model';
import { openDB } from 'idb';
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

let timer: ReturnType<typeof setTimeout> | null = null;
let last: Workspace | null = null;

export function startAutosave() {
  useStore.subscribe((s) => {
    if (s.ws === last) return;
    last = s.ws;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(s.ws), 1000);
  });
}

async function save(ws: Workspace) {
  try {
    const db = await DB;
    await db.put('workspace', ws, 'current');
    await db.add('snapshots', { at: new Date().toISOString(), ws });
    const keys = await db.getAllKeys('snapshots');
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) await db.delete('snapshots', k);
  } catch (e) {
    console.warn('Autosave failed', e);
  }
}

/** Workspace file (canonical JSON, pretty-printed for diffs). */
export function workspaceToFile(ws: Workspace): Blob {
  const pretty = JSON.stringify(JSON.parse(canonicalJson(ws)), null, 1);
  return new Blob([pretty], { type: 'application/json' });
}
