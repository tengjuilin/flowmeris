import { useRef, useState } from 'react';
import { HoverMenu } from '../components/ui/HoverMenu.tsx';
import {
  AddIcon,
  ExportIcon,
  FileIcon,
  FolderIcon,
  GearIcon,
  GitHubIcon,
  HelpIcon,
  ImportIcon,
  RedoIcon,
  UndoIcon,
} from '../components/ui/icons.tsx';
import { getPool } from '../engine-client/pool.ts';
import { SettingsDialog } from '../features/settings/index.ts';
import { DATA_FILE_ACCEPT } from '../lib/files.ts';
import { filesFromInput } from '../lib/ingest.ts';
import { keyHint } from '../lib/settings/index.ts';
import { ingestFiles } from '../state/commands/ingest.ts';
import { openWorkspaceFile, saveWorkspaceFile, startNewWorkspace } from '../state/commands/workspace.ts';
import { useSettings } from '../state/settings.ts';
import { useStore } from '../state/store.ts';

/**
 * The app header: the Workspace and Add menus, workspace name, undo and redo, and at the right the
 * Settings dialog and the links to the source code and the docs.
 */

/** Hidden file inputs for adding a folder or files, with functions that open their pickers. */
function useIngestPickers() {
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputs = (
    <>
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
  return {
    inputs,
    addFolder: () => dirInput.current?.click(),
    addFiles: () => fileInput.current?.click(),
  };
}

/** "Add folder…" and "Add files…" buttons of the start page. */
export function FolderButtons() {
  const { inputs, addFolder, addFiles } = useIngestPickers();
  return (
    <>
      <button type="button" className="primary" onClick={addFolder} title={FOLDER_TITLE}>
        Add folder…
      </button>
      <button type="button" onClick={addFiles}>
        Add files…
      </button>
      {inputs}
    </>
  );
}

const FOLDER_TITLE = 'Each folder becomes a group sharing one analysis';
export const REPO_URL = 'https://github.com/tengjuilin/flowmeris';

export function Header() {
  const ws = useStore((s) => s.ws);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const mutate = useStore((s) => s.mutate);
  const importRef = useRef<HTMLInputElement>(null);
  const { inputs, addFolder, addFiles } = useIngestPickers();
  const keys = useSettings((s) => s.hotkeys);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      <button
        type="button"
        className="icon"
        aria-label="Undo"
        onClick={undo}
        disabled={past.length === 0}
        title={past.length ? `Undo: ${past[past.length - 1]!.label}${keyHint(keys, 'undo')}` : 'Undo'}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="icon"
        aria-label="Redo"
        onClick={redo}
        disabled={future.length === 0}
        title={future.length ? `Redo: ${future[0]!.label}${keyHint(keys, 'redo')}` : 'Redo'}
      >
        <RedoIcon />
      </button>
      <HoverMenu
        label="Workspace"
        items={[
          {
            label: 'New',
            icon: <AddIcon />,
            title: 'Start a new, empty workspace',
            onSelect: () => {
              if (
                confirm(
                  'Start a new, empty workspace? The current one stays in your browser history only until replaced; save it first if needed.',
                )
              )
                startNewWorkspace();
            },
          },
          {
            label: 'Export',
            icon: <ExportIcon />,
            title:
              'Save the analysis (gates, transforms, compensation, statistics) as a JSON file. FCS data are not included.',
            onSelect: saveWorkspaceFile,
          },
          {
            label: 'Import',
            icon: <ImportIcon />,
            title: 'Open a saved workspace (JSON)',
            onSelect: () => importRef.current?.click(),
          },
        ]}
      />
      <HoverMenu
        label="Add"
        items={[
          { label: 'Folder', icon: <FolderIcon />, title: FOLDER_TITLE, onSelect: addFolder },
          { label: 'Files', icon: <FileIcon />, title: 'Add FCS files to the workspace', onSelect: addFiles },
        ]}
      />
      <div className="spacer" />
      <input
        className="ws-name"
        aria-label="Workspace name"
        value={ws.name}
        onChange={(e) => mutate('Rename workspace', (w) => void (w.name = e.target.value))}
      />
      <div className="spacer" />
      <button
        type="button"
        className="icon header-icon"
        aria-label="App settings"
        title="App settings: default appearance and hotkeys"
        aria-haspopup="dialog"
        onClick={() => setSettingsOpen(true)}
      >
        <GearIcon />
      </button>
      <a
        className="button icon"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub"
        title="Source code on GitHub"
      >
        <GitHubIcon />
      </a>
      <a className="button icon" href="../" target="_blank" rel="noreferrer" aria-label="Docs" title="Docs">
        <HelpIcon />
      </a>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {inputs}
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
