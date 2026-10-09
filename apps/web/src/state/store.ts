import type { AnalysisContext } from '@flowmeris/engine';
import { type Group, type Workspace, newWorkspace } from '@flowmeris/model';
import { type Patch, applyPatches, enablePatches, produce, produceWithPatches } from 'immer';
import { useMemo } from 'react';
import { create } from 'zustand';
import { gridCarry } from '../lib/gridCarry.ts';
import { displayNames } from '../lib/names.ts';
import { readSession, writeSession } from './prefs.ts';

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

/** Where the user is and what is selected. */
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
  /** Variable selected in the Metadata view (open in its panel, coloured on the plate map). */
  metaVarId: string | null;
  /** Wells selected on the plate map. */
  plateSel: string[];
  /** Samples left out of the Tiles, Ridge and Statistics views (unchecked in the sidebar). */
  excluded: Record<string, true>;
}

/** Layout choices of the views: settings panels shown, plot sizes, modes. */
interface ViewPrefs {
  /** Whether the Tiles view's settings panel is shown. */
  tilesSettings: boolean;
  /** Tile plot size (px) picked with the Tiles view's slider; the tiles per row follow the width. */
  tilesPlotSize: number;
  /** Plot size (px) picked with the slider of the Gating path view's path (as many steps per row as fit). */
  pathPlotSize: number;
  /** Layout of the Gating path view: the path to the selected population, or the whole tree. */
  pathMode: 'path' | 'tree';
  /** Plot size (px) picked with the slider of the Gating path view's tree. */
  treePlotSize: number;
  /** Height (px) of the Gating path view's populations panel. */
  pathPanelHeight: number;
  /** Whether the Plot view's settings panel (for its selected grid plot) is shown. */
  gridSettings: boolean;
  /** Whether the Metadata view's settings panel is shown. */
  metaSettings: boolean;
  /** Layout of the Metadata view: the sample table or the plate map. */
  metaMode: 'table' | 'plate';
}

/** What the app reports: samples without data, file loading progress, the message shown. */
interface StatusState {
  /** Samples whose decoded data is not in browser storage. */
  missing: Record<string, true>;
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
  views: ViewPrefs;
  status: StatusState;
  past: History[];
  future: History[];
  /** Tab history: locations left by switching tabs, for Back, and those left by Back, for Forward. */
  nav: { back: NavLocation[]; forward: NavLocation[] };
  /** Return to the location before the last tab switch (dir -1), or redo one undone by Back (dir 1). */
  navigate: (dir: -1 | 1) => void;
  /**
   * Apply an undoable change to the workspace document. Changes sharing a
   * `merge` key less than a second apart (slider drags, colour picking,
   * typing) collapse into one undo step. The rules in AFTER_EDIT then run on the result.
   */
  mutate: (label: string, fn: (ws: Workspace) => void, merge?: string) => void;
  /** Change the workspace without an undo step, for bookkeeping the user did not ask for (e.g. a view's plot made on first visit). */
  mutateQuiet: (fn: (ws: Workspace) => void) => void;
  undo: () => void;
  redo: () => void;
  setWorkspace: (ws: Workspace) => void;
  /** Change the UI state. Switching `view` records the location left for Back. */
  setUi: (patch: Partial<UiState>) => void;
  setViews: (patch: Partial<ViewPrefs>) => void;
  setStatus: (patch: Partial<StatusState>) => void;
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
const PATH_MODE_KEY = 'flowmeris.pathMode';

/**
 * Rules applied after every workspace edit, in order: each sees the workspace before and after the edit
 * and may return a further change, made in the same undo step. Then the edit time is stamped.
 */
const AFTER_EDIT: ((before: Workspace, after: Workspace) => ((w: Workspace) => void) | null)[] = [
  // A grid plot's changed settings, made to the other grid plots too while the group carries them.
  gridCarry,
];

export const useStore = create<Store>((set, get) => ({
  ws: newWorkspace(timestampName(), APP_INFO),
  ui: {
    groupId: null,
    sampleId: null,
    popId: 'root',
    plotId: null,
    // A page reload stays on the same tab (and, in `views`, the same Gating path layout).
    view: readSession(VIEW_KEY, VIEWS, 'gate'),
    tool: 'select',
    editScope: 'template',
    selectedGateId: null,
    refPlotId: null,
    gridCellId: null,
    metaVarId: null,
    plateSel: [],
    excluded: {},
  },
  views: {
    tilesSettings: false,
    tilesPlotSize: 260,
    pathPlotSize: 240,
    pathMode: readSession(PATH_MODE_KEY, ['path', 'tree'] as const, 'path'),
    treePlotSize: 280,
    pathPanelHeight: 200,
    gridSettings: false,
    metaSettings: true,
    metaMode: 'table',
  },
  status: { missing: {}, ingest: null, toast: null },
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
    set((s) => ({
      ui: { ...s.ui, ...loc, selectedGateId: null },
      nav:
        dir < 0
          ? { back: rest, forward: [...nav.forward, here] }
          : { back: [...nav.back, here], forward: rest },
    }));
    writeSession(VIEW_KEY, loc.view);
  },
  mutate(label, fn, merge) {
    const before = get().ws;
    let [next, redo, undo] = produceWithPatches(before, (draft) => void fn(draft as Workspace));
    // A change that changes nothing is no undo step (stamped only once the edit is known to change something).
    if (redo.length === 0) return;
    for (const rule of AFTER_EDIT) {
      const more = rule(before, next);
      if (!more) continue;
      const [after, r, u] = produceWithPatches(next, (draft) => void more(draft as Workspace));
      next = after;
      redo = [...redo, ...r];
      undo = [...u, ...undo];
    }
    {
      const [stamped, r, u] = produceWithPatches(next, (draft) => {
        (draft as Workspace).modifiedAt = new Date().toISOString();
      });
      next = stamped;
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
    const prev = get().ui;
    const ui = { ...prev, ...patch };
    // A tab switch, by a tab or by a button that opens a sample in another tab, is a step Back returns
    // from. Changes within a tab (another sample or population) are not steps of their own.
    const switched = ui.view !== prev.view;
    set((s) => ({
      ui,
      ...(switched && { nav: { back: [...s.nav.back.slice(-99), locationOf(prev)], forward: [] } }),
    }));
    if (switched) writeSession(VIEW_KEY, ui.view);
  },
  setViews(patch) {
    const prev = get().views.pathMode;
    set((s) => ({ views: { ...s.views, ...patch } }));
    if (patch.pathMode && patch.pathMode !== prev) writeSession(PATH_MODE_KEY, patch.pathMode);
  },
  setStatus(patch) {
    set((s) => ({ status: { ...s.status, ...patch } }));
  },
}));

function locationOf(ui: UiState): NavLocation {
  const { view, groupId, sampleId, popId, plotId, gridCellId } = ui;
  return { view, groupId, sampleId, popId, plotId, gridCellId };
}

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

/**
 * `mutate` on one group: `fn` gets the group's draft and the workspace draft. Nothing happens when the
 * group no longer exists.
 */
export function mutateGroup(
  groupId: string,
  label: string,
  fn: (g: Group, ws: Workspace) => void,
  merge?: string,
) {
  useStore.getState().mutate(
    label,
    (ws) => {
      const g = ws.groups.find((x) => x.id === groupId);
      if (g) fn(g, ws);
    },
    merge,
  );
}

export function contextFor(ws: Workspace, g: Group): AnalysisContext {
  return { group: g, transforms: ws.transforms, compMatrices: ws.compMatrices };
}

export function toast(text: string, action?: { label: string; run: () => void }) {
  useStore.getState().setStatus({ toast: action ? { text, action } : { text } });
  const t = useStore.getState().status.toast;
  setTimeout(() => {
    if (useStore.getState().status.toast === t) useStore.getState().setStatus({ toast: null });
  }, 6000);
}
