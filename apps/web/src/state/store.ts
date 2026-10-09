import type { AnalysisContext } from '@flowmeris/engine';
import { type Group, type Workspace, newWorkspace } from '@flowmeris/model';
import { type Patch, applyPatches, enablePatches, produce, produceWithPatches } from 'immer';
import { useMemo } from 'react';
import { create } from 'zustand';
import { gridCarry } from '../lib/gridCarry.ts';
import { displayNames } from '../lib/names.ts';

enablePatches();

export const APP_INFO = { version: __APP_VERSION__, commit: __APP_COMMIT__, kernels: 'ts-1' };

export type Tool = 'select' | 'rect' | 'range' | 'split' | 'ellipse' | 'polygon' | 'quadrant' | 'spider';
export type View =
  | 'gate'
  | 'plot'
  | 'tiles'
  | 'ridge'
  | 'path'
  | 'metadata'
  | 'stats'
  | 'charts'
  | 'compensation'
  | 'samples';

export const VIEW_LABELS: Record<View, string> = {
  gate: 'Gate',
  plot: 'Plot',
  tiles: 'Tiles',
  path: 'Gating path',
  metadata: 'Metadata',
  stats: 'Statistics',
  ridge: 'Ridge',
  charts: 'Charts',
  compensation: 'Compensation',
  samples: 'Samples',
};

export interface IngestProgress {
  total: number;
  done: number;
  current: string;
  errors: { file: string; message: string }[];
}

interface UiState {
  groupId: string | null;
  sampleId: string | null;
  popId: string;
  plotId: string | null;
  view: View;
  tool: Tool;
  /** Whether gate edits change the group template or only the current sample (override). */
  editScope: 'template' | 'sample';
  selectedGateId: string | null;
  /** Active reference-plot tab of the Gate view. */
  refPlotId: string | null;
  /** Active (gateable) cell of the Plot view's grid. */
  gridCellId: string | null;
  /** Whether the Tiles view's settings panel is shown. */
  tilesSettings: boolean;
  /** Tiles per row picked with the Tiles view's slider (kept while other views are shown). */
  tilesColumns: number;
  /** Plots per row picked with the Gating path view's slider (kept while other views are shown). */
  pathColumns: number;
  /** Layout of the Gating path view: the path to the selected population, or the whole tree. */
  pathMode: 'path' | 'tree';
  /** Plot size (px) picked with the slider of the Gating path view's tree (sized freely, not by columns). */
  treePlotSize: number;
  /** Height (px) of the Gating path view's populations panel. */
  pathPanelHeight: number;
  /** Whether the Plot view's settings panel (for its selected grid plot) is shown. */
  gridSettings: boolean;
  missing: Record<string, true>;
  /** Samples left out of the Tiles, Ridge and Statistics views (unchecked in the sidebar). */
  excluded: Record<string, true>;
  ingest: IngestProgress | null;
  toast: { text: string; action?: { label: string; run: () => void } } | null;
}

/** Where the user is: the tab and what it shows. Back and Forward return to one. */
export interface NavLocation {
  view: View;
  groupId: string | null;
  sampleId: string | null;
  popId: string;
  plotId: string | null;
  gridCellId: string | null;
}

interface History {
  label: string;
  redo: Patch[];
  undo: Patch[];
  merge?: { key: string; at: number };
}

interface Store {
  ws: Workspace;
  ui: UiState;
  past: History[];
  future: History[];
  /** Tab history: locations left by switching tabs, for Back, and those left by Back, for Forward. */
  nav: { back: NavLocation[]; forward: NavLocation[] };
  /** Return to the location before the last tab switch (dir -1), or redo one undone by Back (dir 1). */
  navigate: (dir: -1 | 1) => void;
  /**
   * Apply an undoable change to the workspace document. Changes sharing a
   * `merge` key less than a second apart (slider drags, colour picking,
   * typing) collapse into one undo step.
   */
  mutate: (label: string, fn: (ws: Workspace) => void, merge?: string) => void;
  /** Change the workspace without an undo step, for bookkeeping the user did not ask for (e.g. a view's plot made on first visit). */
  mutateQuiet: (fn: (ws: Workspace) => void) => void;
  undo: () => void;
  redo: () => void;
  setWorkspace: (ws: Workspace) => void;
  setUi: (patch: Partial<UiState>) => void;
}

/** Default workspace name: the local date and time it was opened, ISO 8601 (YYYY-MM-DDTHH:mm:ss). */
export function timestampName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const VIEW_KEY = 'flowmeris.view';
const VIEWS: readonly View[] = [
  'gate',
  'plot',
  'tiles',
  'ridge',
  'path',
  'metadata',
  'stats',
  'charts',
  'compensation',
  'samples',
];

/** The view open before the last page reload, so a refresh stays on the same tab. */
function savedView(): View {
  try {
    const v = sessionStorage.getItem(VIEW_KEY) as View | null;
    return v && VIEWS.includes(v) ? v : 'gate';
  } catch {
    return 'gate';
  }
}

const PATH_MODE_KEY = 'flowmeris.pathMode';

/** The Gating path view's layout before the last page reload. */
function savedPathMode(): 'path' | 'tree' {
  try {
    return sessionStorage.getItem(PATH_MODE_KEY) === 'tree' ? 'tree' : 'path';
  } catch {
    return 'path';
  }
}

export const useStore = create<Store>((set, get) => ({
  ws: newWorkspace(timestampName(), APP_INFO),
  ui: {
    groupId: null,
    sampleId: null,
    popId: 'root',
    plotId: null,
    view: savedView(),
    tool: 'select',
    editScope: 'template',
    selectedGateId: null,
    refPlotId: null,
    gridCellId: null,
    tilesSettings: false,
    tilesColumns: 5,
    pathColumns: 4,
    pathMode: savedPathMode(),
    treePlotSize: 280,
    pathPanelHeight: 200,
    gridSettings: false,
    missing: {},
    excluded: {},
    ingest: null,
    toast: null,
  },
  past: [],
  future: [],
  nav: { back: [], forward: [] },
  navigate(dir) {
    const { nav, ws, ui } = get();
    const from = dir < 0 ? nav.back : nav.forward;
    const to = from[from.length - 1];
    if (!to) return;
    const here = locationOf(ui);
    const rest = from.slice(0, -1);
    const g = ws.groups.find((x) => x.id === to.groupId);
    // A location whose group or sample was removed since falls back to what still exists.
    const loc: NavLocation = g
      ? {
          ...to,
          sampleId: to.sampleId && g.sampleIds.includes(to.sampleId) ? to.sampleId : (g.sampleIds[0] ?? null),
          plotId: g.plots.some((p) => p.id === to.plotId) ? to.plotId : null,
        }
      : { ...here, view: to.view };
    navigating = true;
    set((s) => ({
      ui: { ...s.ui, ...loc, selectedGateId: null },
      nav:
        dir < 0
          ? { back: rest, forward: [...nav.forward, here] }
          : { back: [...nav.back, here], forward: rest },
    }));
    navigating = false;
  },
  mutate(label, fn, merge) {
    const before = get().ws;
    let [next, redo, undo] = produceWithPatches(before, (draft) => {
      fn(draft as Workspace);
      (draft as Workspace).modifiedAt = new Date().toISOString();
    });
    if (redo.length === 0) return;
    // A grid plot's changed settings, made to the other grid plots too while the group carries them.
    const carry = gridCarry(before, next);
    if (carry) {
      const [carried, r, u] = produceWithPatches(next, (draft) => void carry(draft as Workspace));
      next = carried;
      redo = [...redo, ...r];
      undo = [...u, ...undo];
    }
    const now = Date.now();
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (merge && last?.merge?.key === merge && now - last.merge.at < 1000 && s.future.length === 0) {
        const merged = {
          label,
          redo: [...last.redo, ...redo],
          undo: [...undo, ...last.undo],
          merge: { key: merge, at: now },
        };
        return { ws: next, past: [...s.past.slice(0, -1), merged] };
      }
      const h: History = merge
        ? { label, redo, undo, merge: { key: merge, at: now } }
        : { label, redo, undo };
      return { ws: next, past: [...s.past.slice(-199), h], future: [] };
    });
  },
  mutateQuiet(fn) {
    set((s) => ({ ws: produce(s.ws, (draft) => void fn(draft as Workspace)) }));
  },
  undo() {
    const { past, ws } = get();
    const h = past[past.length - 1];
    if (!h) return;
    set((s) => ({ ws: applyPatches(ws, h.undo), past: s.past.slice(0, -1), future: [h, ...s.future] }));
  },
  redo() {
    const { future, ws } = get();
    const h = future[0];
    if (!h) return;
    set((s) => ({ ws: applyPatches(ws, h.redo), future: s.future.slice(1), past: [...s.past, h] }));
  },
  setWorkspace(ws) {
    set((s) => ({
      ws,
      past: [],
      future: [],
      nav: { back: [], forward: [] },
      ui: {
        ...s.ui,
        groupId: ws.groups[0]?.id ?? null,
        sampleId: ws.groups[0]?.sampleIds[0] ?? null,
        popId: 'root',
        plotId: null,
        selectedGateId: null,
        refPlotId: null,
        gridCellId: null,
        excluded: {},
      },
    }));
  },
  setUi(patch) {
    set((s) => ({ ui: { ...s.ui, ...patch } }));
  },
}));

/** Set while Back or Forward moves, so the tab switch it makes is not recorded as a new one. */
let navigating = false;

function locationOf(ui: UiState): NavLocation {
  const { view, groupId, sampleId, popId, plotId, gridCellId } = ui;
  return { view, groupId, sampleId, popId, plotId, gridCellId };
}

useStore.subscribe((s, prev) => {
  if (s.ui.pathMode !== prev.ui.pathMode) {
    try {
      sessionStorage.setItem(PATH_MODE_KEY, s.ui.pathMode);
    } catch {}
  }
  if (s.ui.view === prev.ui.view) return;
  if (!navigating) {
    // A tab switch, by a tab or by a button that opens a sample in another tab: remember where it left from.
    // Changes within a tab (another sample or population) are not steps of their own.
    const back = [...s.nav.back.slice(-99), locationOf(prev.ui)];
    useStore.setState({ nav: { back, forward: [] } });
  }
  try {
    sessionStorage.setItem(VIEW_KEY, s.ui.view);
  } catch {}
});

export function useGroup(): Group | undefined {
  return useStore((s) => s.ws.groups.find((g) => g.id === s.ui.groupId));
}

/** Short display names of a group's samples (lib/names.ts). */
export function useSampleNames(g: Group | undefined): Record<string, string> {
  const samples = useStore((s) => s.ws.samples);
  return useMemo(
    () => (g ? displayNames(g.sampleIds.flatMap((id) => (samples[id] ? [samples[id]] : []))) : {}),
    [g, samples],
  );
}

/** The group's samples that are checked for display, in group order. */
export function useSelectedSampleIds(g: Group | undefined): string[] {
  const excluded = useStore((s) => s.ui.excluded);
  return useMemo(() => (g ? g.sampleIds.filter((id) => !excluded[id]) : []), [g, excluded]);
}

export function contextFor(ws: Workspace, g: Group): AnalysisContext {
  return { group: g, transforms: ws.transforms, compMatrices: ws.compMatrices };
}

export function toast(text: string, action?: { label: string; run: () => void }) {
  useStore.getState().setUi({ toast: action ? { text, action } : { text } });
  const t = useStore.getState().ui.toast;
  setTimeout(() => {
    if (useStore.getState().ui.toast === t) useStore.getState().setUi({ toast: null });
  }, 6000);
}
