import { useRef } from 'react';
import { getPool } from '../engine-client/pool.ts';
import { DATA_FILE_ACCEPT } from '../lib/files.ts';
import { filesFromInput } from '../lib/ingest.ts';
import { ingestFiles } from '../state/commands/ingest.ts';
import { openWorkspaceFile, saveWorkspaceFile, startNewWorkspace } from '../state/commands/workspace.ts';
import { useStore } from '../state/store.ts';

/** The app header: workspace name, adding files, undo and redo, saving and opening workspaces. */

/** "Add folder…" and "Add files…" buttons with their hidden file inputs. */
export function FolderButtons() {
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="primary"
        onClick={() => dirInput.current?.click()}
        title="Each folder becomes a group sharing one analysis"
      >
        Add folder…
      </button>
      <button type="button" onClick={() => fileInput.current?.click()}>
        Add files…
      </button>
      <input
        ref={dirInput}
        type="file"
        hidden
        multiple
        // @ts-expect-error non-standard but widely supported folder selection
        webkitdirectory=""
        onChange={(e) => {
          if (e.target.files) void ingestFiles(filesFromInput(e.target.files));
          e.target.value = '';
        }}
        data-testid="folder-input"
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={DATA_FILE_ACCEPT}
        onChange={(e) => {
          if (e.target.files) void ingestFiles(filesFromInput(e.target.files));
          e.target.value = '';
        }}
        data-testid="file-input"
      />
    </>
  );
}

export function Header() {
  const ws = useStore((s) => s.ws);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const mutate = useStore((s) => s.mutate);
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <header className="app-header">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="11" cy="19" r="6" fill="#2a78d6" />
          <circle cx="21" cy="12" r="5" fill="#eb6834" />
          <circle cx="22" cy="23" r="3" fill="#1baf7a" />
        </svg>
        Flowmeris
      </div>
      <input
        className="ws-name"
        aria-label="Workspace name"
        value={ws.name}
        onChange={(e) => mutate('Rename workspace', (w) => void (w.name = e.target.value))}
      />
      <FolderButtons />
      <div className="spacer" />
      <button
        type="button"
        onClick={undo}
        disabled={past.length === 0}
        title={past.length ? `Undo: ${past[past.length - 1]!.label} (⌘Z)` : 'Undo'}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={future.length === 0}
        title={future.length ? `Redo: ${future[0]!.label} (⇧⌘Z)` : 'Redo'}
      >
        Redo
      </button>
      <button
        type="button"
        onClick={saveWorkspaceFile}
        title="Save the analysis (gates, transforms, compensation, statistics) as a JSON file. FCS data are not included."
      >
        Save workspace
      </button>
      <button type="button" onClick={() => importRef.current?.click()}>
        Open workspace…
      </button>
      <input
        ref={importRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void openWorkspaceFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => {
          if (
            confirm(
              'Start a new, empty workspace? The current one stays in your browser history only until replaced; save it first if needed.',
            )
          )
            startNewWorkspace();
        }}
      >
        New
      </button>
      <a className="button" href="../" target="_blank" rel="noreferrer">
        Docs
      </a>
      {!getPool().opfs && (
        <span
          className="badge warn"
          title="The browser's private file storage (OPFS) is unavailable, e.g. in a private window: event data are kept in memory and must be re-added after a reload."
        >
          memory only
        </span>
      )}
    </header>
  );
}
