import { loadWorkspace, newWorkspace } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { ChartsView } from './components/ChartsView.tsx';
import { CompensationView, SamplesView } from './components/CompensationView.tsx';
import { GatingPathView } from './components/GatingPathView.tsx';
import { RidgeView, TilesView } from './components/GroupViews.tsx';
import { Inspector } from './components/Inspector.tsx';
import { MetadataView } from './components/MetadataView.tsx';
import { PlotGridView } from './components/PlotGridView.tsx';
import { PlotPanel, drill } from './components/PlotPanel.tsx';
import { PopulationTree } from './components/PopulationTree.tsx';
import { RefPlots } from './components/RefPlots.tsx';
import { RidgeCombinePanel, RidgeInspector } from './components/RidgeInspector.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { StatsView } from './components/StatsView.tsx';
import { pool } from './engine-client/pool.ts';
import { download, safeName } from './lib/download.ts';
import { checkMissing, filesFromDrop, filesFromInput, ingestFiles } from './lib/ingest.ts';
import { workspaceToFile } from './state/persist.ts';
import { APP_INFO, type Tool, type View, timestampName, toast, useGroup, useStore } from './state/store.ts';

const VIEWS: { id: View; label: string }[] = [
  { id: 'gate', label: 'Gate' },
  { id: 'plot', label: 'Plot' },
  { id: 'tiles', label: 'Tiles' },
  { id: 'path', label: 'Gating path' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'stats', label: 'Statistics' },
  { id: 'ridge', label: 'Ridge' },
  { id: 'charts', label: 'Charts' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'samples', label: 'Samples' },
];

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'rect',
  e: 'ellipse',
  p: 'polygon',
  q: 'quadrant',
  s: 'spider',
  h: 'range',
};

function FolderButtons() {
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
        accept=".fcs,.lmd,.FCS,.LMD"
        onChange={(e) => {
          if (e.target.files) void ingestFiles(filesFromInput(e.target.files));
          e.target.value = '';
        }}
        data-testid="file-input"
      />
    </>
  );
}

function Header() {
  const ws = useStore((s) => s.ws);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const mutate = useStore((s) => s.mutate);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <header className="app-header">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          ●
        </span>
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
        onClick={() => download(`${safeName(ws.name)}.flowmeris.json`, workspaceToFile(ws))}
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
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const w = loadWorkspace(JSON.parse(await f.text()));
            setWorkspace(w);
            await checkMissing();
            const n = Object.keys(useStore.getState().ui.missing).length;
            toast(
              n
                ? `Workspace opened. ${n} sample(s) need their FCS files: add the folder(s) again to re-link by SHA-256.`
                : 'Workspace opened.',
            );
          } catch (err) {
            toast(`Could not open workspace: ${err instanceof Error ? err.message : String(err)}`);
          }
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
            setWorkspace(newWorkspace(timestampName(), APP_INFO));
        }}
      >
        New
      </button>
      <a className="button" href="../" target="_blank" rel="noreferrer">
        Docs
      </a>
      {!pool.opfs && (
        <span
          className="badge warn"
          title="The browser's private file storage (OPFS) is unavailable, e.g. in a private window: event data are kept in memory and must be re-added after a reload."
        >
          memory only
        </span>
      )}
      <span
        className="privacy"
        title="All parsing, gating and statistics run in this browser tab. Files are never uploaded."
      >
        🔒 local only
      </span>
    </header>
  );
}

function Welcome() {
  return (
    <div className="welcome">
      <h1>Flow cytometry analysis, in your browser</h1>
      <p>
        Drop a folder of <code>.fcs</code> files here (or use <strong>Add folder…</strong>). Each folder
        becomes a <em>group</em> whose gates, plots and statistics apply to every file in it. Files are parsed
        locally and never uploaded.
      </p>
      <ol>
        <li>Gate on the first sample: rectangle, ellipse, polygon, quadrant, spider or range gates.</li>
        <li>Double-click a gate to drill into that population and keep gating.</li>
        <li>
          Check every sample in <strong>Tiles</strong> and <strong>Ridge</strong> views; adjust individual
          samples with “This sample only”.
        </li>
        <li>Export statistics (CSV), plots (SVG/PNG), gates (Gating-ML 2.0) and the workspace.</li>
      </ol>
      <div className="row">
        <FolderButtons />
      </div>
      <p className="muted small">
        Flowmeris {APP_INFO.version} ({APP_INFO.commit}). Methods are documented with references and validated
        against FlowKit and the ISAC Gating-ML 2.0 compliance suite.
      </p>
    </div>
  );
}

/** Only OS file/folder drags count; in-app drags (e.g. reordering) carry text only. */
const hasFiles = (dt: DataTransfer) => Array.from(dt.types).includes('Files');

export function App() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const ws = useStore((s) => s.ws);
  const group = useGroup();
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!ui.groupId && ws.groups[0]) {
      setUi({ groupId: ws.groups[0].id, sampleId: ws.groups[0].sampleIds[0] ?? null });
    }
  }, [ui.groupId, ws.groups, setUi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      const view = useStore.getState().ui.view;
      if (tool && (view === 'gate' || view === 'plot')) setUi({ tool });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setUi]);

  return (
    <div
      className={`app${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={async (e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setDragOver(false);
        void ingestFiles(await filesFromDrop(e.dataTransfer));
      }}
    >
      <Header />
      {ws.groups.length === 0 ? (
        <Welcome />
      ) : (
        <div className="main">
          <Sidebar />
          <section className="center">
            <div className="tabs" role="tablist">
              {VIEWS.map((v) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={ui.view === v.id}
                  key={v.id}
                  className={ui.view === v.id ? 'on' : ''}
                  onClick={() => {
                    setUi({ view: v.id });
                    if (v.id === 'gate' && group) drill(ui.popId);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="view">
              {ui.view === 'gate' && (
                <div className="plot-layout">
                  <PlotPanel />
                  <div className="plot-side">
                    <PopulationTree />
                    <RefPlots />
                  </div>
                </div>
              )}
              {ui.view === 'plot' && <PlotGridView />}
              {ui.view === 'tiles' && <TilesView />}
              {ui.view === 'ridge' && (
                <div className="plot-layout">
                  <RidgeView />
                  <div className="plot-side">
                    <PopulationTree />
                    <RidgeCombinePanel />
                  </div>
                </div>
              )}
              {ui.view === 'path' && <GatingPathView />}
              {ui.view === 'metadata' && <MetadataView />}
              {ui.view === 'stats' && <StatsView />}
              {ui.view === 'charts' && <ChartsView />}
              {ui.view === 'compensation' && <CompensationView />}
              {ui.view === 'samples' && <SamplesView />}
            </div>
          </section>
          {ui.view === 'gate' && <Inspector />}
          {ui.view === 'ridge' && <RidgeInspector />}
        </div>
      )}
      {ui.ingest && (
        <output className="ingest">
          {ui.ingest.done < ui.ingest.total ? (
            <>
              Reading {ui.ingest.done + 1}/{ui.ingest.total}:{' '}
              <span className="mono">{ui.ingest.current}</span>
              <progress max={ui.ingest.total} value={ui.ingest.done} />
            </>
          ) : (
            <>
              <strong>{ui.ingest.errors.length} file(s) could not be read:</strong>
              <ul>
                {ui.ingest.errors.map((e) => (
                  <li key={e.file}>
                    <span className="mono">{e.file}</span>: {e.message}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setUi({ ingest: null })}>
                Dismiss
              </button>
            </>
          )}
        </output>
      )}
      {ui.toast && (
        <output className="toast">
          {ui.toast.text}
          {ui.toast.action && (
            <button
              type="button"
              onClick={() => {
                ui.toast?.action?.run();
                setUi({ toast: null });
              }}
            >
              {ui.toast.action.label}
            </button>
          )}
        </output>
      )}
    </div>
  );
}
