import type { Group, PlotFigure, PlotSpec } from '@flowmeris/model';
import { DEFAULT_FIGURE, TILE_FIGURE } from '../../lib/figure.ts';
import type { PlotCard } from '../../lib/panelSpecs.ts';
import type { CardOf } from '../../lib/settingsPanel.ts';
import { type PlotTarget, plotsOf } from '../../state/commands/plots.ts';
import { useStore } from '../../state/store.ts';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What every tab of the plot settings panel gets: the plot it edits and the panel's open cards. */
export interface TabProps {
  group: Group;
  plot: PlotSpec;
  /** Which plots the panel edits: the Gate view's, the Tiles' or a Plot grid cell. */
  target: PlotTarget;
  /** Card `id`'s props. */
  card: CardOf<PlotCard>;
  fx: FigureEdits;
}

export type FigureEdits = ReturnType<typeof figureEdits>;

/**
 * Edits of `plot`'s figure options (title, fonts, ticks, text styles). Tiles and grid plots default to
 * smaller text. The figure is created from the defaults on first edit.
 */
export function figureEdits(group: Group, plot: PlotSpec, target: PlotTarget) {
  const mutate = useStore.getState().mutate;
  const defFig = target === 'gate' ? DEFAULT_FIGURE : TILE_FIGURE;
  const fig = plot.style.figure ?? defFig;
  /** Edits sharing `merge` coalesce into one undo step. */
  const edit = (label: string, fn: (f: PlotFigure, p: PlotSpec) => void, merge?: string) =>
    mutate(
      label,
      (w) => {
        const g = w.groups.find((x) => x.id === group.id);
        const p = g && plotsOf(g, target).find((x) => x.id === plot.id);
        if (!g || !p) return;
        p.style.figure ??= structuredClone(defFig);
        fn(p.style.figure, p);
      },
      merge && `figure:${plot.id}:${merge}`,
    );
  const set = <K extends keyof PlotFigure>(k: K, v: PlotFigure[K], label: string, merge?: string) =>
    edit(
      label,
      (f) => {
        if (v === undefined) delete f[k];
        else f[k] = v;
      },
      merge,
    );
  /** Reset props for a card whose settings are the figure `keys`. */
  const resetOf = (keys: (keyof PlotFigure)[], title: string) => ({
    changed: keys.some((k) => !same(fig[k], defFig[k])),
    onReset: () =>
      edit(`Reset ${title}`, (f) => {
        for (const k of keys) {
          const d = defFig[k];
          if (d === undefined) delete f[k];
          else (f as Record<string, unknown>)[k] = structuredClone(d);
        }
      }),
  });
  return { fig, edit, set, resetOf };
}
