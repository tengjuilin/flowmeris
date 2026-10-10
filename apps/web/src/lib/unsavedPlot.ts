import type { Group, PlotSpec, Workspace } from '@flowmeris/model';
import { newId } from '@flowmeris/model';
import { Immer } from 'immer';
import { jsonClone } from './json.ts';
import { populationPlot } from './plotFactories.ts';

/**
 * The Gate view's unsaved plot. Opening a population shows a plot without adding it to the workspace:
 * the plot a population gets when it has none (`populationPlot`), or a Gating path plot built from a
 * gate's axes. The first edit made in the Gate view that changes the plot, or a gate drawn on it, saves
 * it in that edit's undo step (`settleUnsaved`, run by the store's `mutate`).
 */

/** Builds unsaved plots on a copy of the workspace, leaving the workspace given unfrozen. */
const builder = new Immer({ autoFreeze: false });

/** The id the unsaved plot has until it is saved. */
export const UNSAVED_PLOT_ID = 'plt_unsaved';

/** What the Gate view shows: the population, the plot picked, and an unsaved plot set for it. */
export interface GateSelection {
  popId: string;
  plotId: string | null;
  unsavedPlot: PlotSpec | null;
}

/** The Gate view's plot and whether it is saved. */
export interface GatePlot {
  plot: PlotSpec;
  saved: boolean;
  /** The workspace with what building an unsaved plot registers (transforms, axis defaults). */
  ws: Workspace;
}

/**
 * The Gate view's plot of population `sel.popId`: the saved plot `sel.plotId`; else the unsaved plot set
 * for the population, when it was picked or the population has no saved plot; else the population's
 * first saved plot; else, for an existing population, the plot it gets when it has none.
 */
export function gateViewPlot(ws: Workspace, g: Group, sel: GateSelection): GatePlot | undefined {
  const own = g.plots.filter((p) => p.population === sel.popId);
  const picked = own.find((p) => p.id === sel.plotId);
  if (picked) return { plot: picked, saved: true, ws };
  const unsaved = sel.unsavedPlot?.population === sel.popId ? sel.unsavedPlot : null;
  if (unsaved && (sel.plotId === UNSAVED_PLOT_ID || own.length === 0))
    return { plot: unsaved, saved: false, ws };
  if (own[0]) return { plot: own[0], saved: true, ws };
  if (!g.template.populations[sel.popId]) return undefined;
  let plot: PlotSpec | undefined;
  const next = builder.produce(ws, (w) => {
    const gg = w.groups.find((x) => x.id === g.id)!;
    // A plain copy: the plot holds parts of the draft (its axes).
    plot = { ...jsonClone(populationPlot(w, gg, sel.popId)), id: UNSAVED_PLOT_ID };
  });
  return { plot: plot!, saved: false, ws: next };
}

/** What on a plot an edit can change besides the plot itself: its gates, their overrides and labels. */
function footprint(g: Group, popId: string): string {
  const gates = Object.values(g.template.gates).filter((x) => x.parentPop === popId);
  const ids = new Set(gates.map((x) => x.id));
  const labels = Object.values(g.template.populations)
    .filter((p) => p.gate && ids.has(p.gate))
    .map((p) => [p.id, p.labelOffset]);
  return JSON.stringify([gates, labels, g.overrides.filter((o) => ids.has(o.gateId))]);
}

/**
 * Put the unsaved plot `shown.plot` in group `shown.groupId` of the workspace draft `ws`, so an edit can
 * find it by its id. Returns what `settleUnsaved` needs (call inside `mutate`).
 */
export function addUnsaved(ws: Workspace, shown: { groupId: string; plot: PlotSpec; ws: Workspace }) {
  const g = ws.groups.find((x) => x.id === shown.groupId);
  if (!g) return null;
  const { groupId, plot, ws: built } = shown;
  // What building the plot registered, which the workspace does not have yet.
  const transforms = Object.entries(built.transforms).filter(([id]) => !ws.transforms[id]);
  const builtGroup = built.groups.find((x) => x.id === groupId);
  const axisDefaults = Object.entries(builtGroup?.axisDefaults ?? {}).filter(([ch]) => !g.axisDefaults[ch]);
  g.plots.push(structuredClone(plot));
  return {
    groupId,
    registered: structuredClone({ transforms, axisDefaults }),
    plot: JSON.stringify(plot),
    gates: footprint(g, plot.population),
  };
}

/**
 * After an edit on a draft given the unsaved plot (`addUnsaved`): when the edit changed the plot, or a
 * gate drawn on it (its geometry, overrides or label), the plot stays with a new id, which is returned,
 * with the transforms and axis defaults building it registered; otherwise it is taken out again and null
 * returned (call inside `mutate`).
 */
export function settleUnsaved(
  ws: Workspace,
  added: NonNullable<ReturnType<typeof addUnsaved>>,
): string | null {
  const g = ws.groups.find((x) => x.id === added.groupId);
  const i = g ? g.plots.findIndex((p) => p.id === UNSAVED_PLOT_ID) : -1;
  if (!g || i < 0) return null;
  const plot = g.plots[i]!;
  if (JSON.stringify(plot) === added.plot && footprint(g, plot.population) === added.gates) {
    g.plots.splice(i, 1);
    return null;
  }
  for (const [id, t] of added.registered.transforms) ws.transforms[id] ??= t;
  for (const [ch, a] of added.registered.axisDefaults) g.axisDefaults[ch] ??= a;
  plot.id = newId('plt_');
  return plot.id;
}
