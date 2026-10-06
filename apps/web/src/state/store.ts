import type { AnalysisContext } from '@flowmeris/engine';
import { type Group, type Workspace, newWorkspace } from '@flowmeris/model';
import { type Patch, applyPatches, enablePatches, produceWithPatches } from 'immer';
import { create } from 'zustand';

enablePatches();

export const APP_INFO = { version: __APP_VERSION__, commit: __APP_COMMIT__, kernels: 'ts-1' };

export type Tool = 'select' | 'rect' | 'range' | 'ellipse' | 'polygon' | 'quadrant' | 'spider';
export type View = 'plot' | 'tiles' | 'ridge' | 'stats' | 'compensation' | 'samples';

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
  missing: Record<string, true>;
  ingest: IngestProgress | null;
  toast: { text: string; action?: { label: string; run: () => void } } | null;
}

interface History {
  label: string;
  redo: Patch[];
  undo: Patch[];
}

interface Store {
  ws: Workspace;
  ui: UiState;
  past: History[];
  future: History[];
  /** Apply an undoable change to the workspace document. */
  mutate: (label: string, fn: (ws: Workspace) => void) => void;
  undo: () => void;
  redo: () => void;
  setWorkspace: (ws: Workspace) => void;
  setUi: (patch: Partial<UiState>) => void;
}

export const useStore = create<Store>((set, get) => ({
  ws: newWorkspace('Untitled workspace', APP_INFO),
  ui: {
    groupId: null,
    sampleId: null,
    popId: 'root',
    plotId: null,
    view: 'plot',
    tool: 'select',
    editScope: 'template',
    selectedGateId: null,
    missing: {},
    ingest: null,
    toast: null,
  },
  past: [],
  future: [],
  mutate(label, fn) {
    const [next, redo, undo] = produceWithPatches(get().ws, (draft) => {
      fn(draft as Workspace);
      (draft as Workspace).modifiedAt = new Date().toISOString();
    });
    if (redo.length === 0) return;
    set((s) => ({ ws: next, past: [...s.past.slice(-199), { label, redo, undo }], future: [] }));
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
      ui: {
        ...s.ui,
        groupId: ws.groups[0]?.id ?? null,
        sampleId: ws.groups[0]?.sampleIds[0] ?? null,
        popId: 'root',
        plotId: null,
        selectedGateId: null,
      },
    }));
  },
  setUi(patch) {
    set((s) => ({ ui: { ...s.ui, ...patch } }));
  },
}));

export function useGroup(): Group | undefined {
  return useStore((s) => s.ws.groups.find((g) => g.id === s.ui.groupId));
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
