import { loadWorkspace, newWorkspace } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { ChartsView } from './components/ChartsView.tsx';
import { CompensationView, SamplesView } from './components/CompensationView.tsx';
import { Inspector } from './components/GateInspector.tsx';
import { GatingPathView } from './components/GatingPathView.tsx';
import { RidgeExportCard, RidgeView, TilesView } from './components/GroupViews.tsx';
import { SettingsIcon } from './components/Inspector.tsx';
import { MetadataView } from './components/MetadataView.tsx';
import { PlotGridView } from './components/PlotGridView.tsx';
import { GateExportCard, GateToolbar, PlotPanel, drill } from './components/PlotPanel.tsx';
import { PopulationTree } from './components/PopulationTree.tsx';
import { RefPlots } from './components/RefPlots.tsx';
import { RidgeCombinePanel, RidgeInspector } from './components/RidgeInspector.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { StatsInspector, StatsView } from './components/StatsView.tsx';
import { pool } from './engine-client/pool.ts';
import { download, safeName } from './lib/download.ts';
import { checkMissing, filesFromDrop, filesFromInput, ingestFiles } from './lib/ingest.ts';
import { workspaceToFile } from './state/persist.ts';
import {
  APP_INFO,
  type NavLocation,
  type Tool,
  VIEW_LABELS,
  type View,
  timestampName,
  toast,
  useGroup,
  useStore,
} from './state/store.ts';

const VIEWS: { id: View; label: string }[] = (
  [
    'metadata',
    'gate',
    'plot',
    'tiles',
    'path',
    'stats',
    'ridge',
    'charts',
    'compensation',
    'samples',
  ] as const
).map((id) => ({ id, label: VIEW_LABELS[id] }));

/** A chevron pointing left (Back) or right (Forward). */
function NavIcon({ dir }: { dir: -1 | 1 }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={dir < 0 ? 'M9 2.5 4.5 7 9 11.5' : 'M5 2.5 9.5 7 5 11.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Back and Forward through the tabs visited, like a browser's. */
function NavButtons() {
  const nav = useStore((s) => s.nav);
  const navigate = useStore((s) => s.navigate);
  const label = (l: NavLocation | undefined) => (l ? ` to ${VIEW_LABELS[l.view]}` : '');
  return (
    <div className="nav-buttons">
      <button
        type="button"
        className="icon"
        title={`Back${label(nav.back[nav.back.length - 1])} (Alt+←)`}
        aria-label="Back"
        disabled={nav.back.length === 0}
        onClick={() => navigate(-1)}
      >
        <NavIcon dir={-1} />
      </button>
      <button
        type="button"
        className="icon"
        title={`Forward${label(nav.forward[nav.forward.length - 1])} (Alt+→)`}
        aria-label="Forward"
        disabled={nav.forward.length === 0}
        onClick={() => navigate(1)}
      >
        <NavIcon dir={1} />
      </button>
    </div>
  );
}

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  r: 'rect',
  e: 'ellipse',
  p: 'polygon',
  q: 'quadrant',
  s: 'spider',
  h: 'range',
  b: 'split',
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
  // On narrow windows the settings panel is a drawer opened from the Settings button.
  const [drawer, setDrawer] = useState(false);
  const hasInspector = ui.view === 'gate' || ui.view === 'ridge' || ui.view === 'stats';
  // The Tiles and Plot views' settings panels are shown and hidden from their own toolbars.
  const tilesPanel = (ui.view === 'tiles' && ui.tilesSettings) || (ui.view === 'plot' && ui.gridSettings);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

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
      if (e.altKey && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        useStore.getState().navigate(e.key === 'ArrowLeft' ? -1 : 1);
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
            <div className="tabs-bar">
              <NavButtons />
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
              {hasInspector && (
                <button
                  type="button"
                  className="settings-toggle"
                  aria-expanded={drawer}
                  aria-label="Settings"
                  title="Settings"
                  onClick={() => setDrawer((d) => !d)}
                >
                  <SettingsIcon />
                </button>
              )}
            </div>
            <div className="view">
              {ui.view === 'gate' && (
                <div className="gate-view">
                  <GateToolbar />
                  <div className="plot-layout">
                    <PlotPanel />
                    <div className="plot-side">
                      <GateExportCard />
                      <PopulationTree />
                      <RefPlots />
                    </div>
                  </div>
                </div>
              )}
              {ui.view === 'plot' && <PlotGridView />}
              {ui.view === 'tiles' && <TilesView />}
              {ui.view === 'ridge' && (
                <div className="plot-layout">
                  <RidgeView />
                  <div className="plot-side">
                    <RidgeExportCard />
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
          {(hasInspector || tilesPanel) && (
            <>
              <button
                type="button"
                className="drawer-scrim"
                aria-label="Close settings"
                tabIndex={-1}
                data-open={tilesPanel || drawer}
                onClick={() =>
                  tilesPanel
                    ? setUi(ui.view === 'plot' ? { gridSettings: false } : { tilesSettings: false })
                    : setDrawer(false)
                }
              />
              <div className="inspector-drawer" data-open={tilesPanel || drawer}>
                {ui.view === 'gate' ? (
                  <Inspector />
                ) : ui.view === 'tiles' ? (
                  <Inspector key="tiles" target="tiles" />
                ) : ui.view === 'plot' ? (
                  <Inspector key="grid" target="grid" />
                ) : ui.view === 'stats' ? (
                  <StatsInspector />
                ) : (
                  <RidgeInspector />
                )}
              </div>
            </>
          )}
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
