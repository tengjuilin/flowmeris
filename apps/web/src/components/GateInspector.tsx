import type { Group, PlotFigure, PlotSpec } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { factoryAxis } from '../lib/axisDefaults.ts';
import { DEFAULT_STYLE } from '../lib/figure.ts';
import {
  DEFAULT_FIGURE,
  PANEL_FIGURE_KEYS,
  TILE_FIGURE,
  TILE_STYLE,
  applyToPairs,
  applyToPopulations,
  axesKey,
  carryToPopulation,
  isDefaultStyle,
  pairAtDefaults,
  pairsMatch,
  plotAtDefaults,
  populationsMatch,
  resetCurrentStyle,
  resetPairStyles,
  resetPlotStyles,
  resetStyleKeys,
  setPairStyles,
  styleKeysAtDefaults,
  withAxesChange,
} from '../lib/figure.ts';
import { gateMatchesAxes } from '../lib/geometry.ts';
import { clearCellOverlay } from '../state/commands/grid.ts';
import { type PlotTarget, targetEdit, plotsOf as targetPlots } from '../state/commands/plots.ts';
import { useRememberedTab } from '../state/prefs.ts';
import { useGroup, useStore } from '../state/store.ts';
import {
  ActionRow,
  ApplyIcon,
  AxisEditor,
  GateEditor,
  NumInput,
  type Panel,
  ResetIcon,
  Section,
  StyleEditor,
} from './Inspector.tsx';
import { CellOverlayFields, CellSourceFields } from './PlotGridView.tsx';
import { PlotKindSelect, usePlotForPopulation, useTilePlot } from './PlotPanel.tsx';
import { FontSelect, TextStyleEditor, TicksEditor } from './RidgeInspector.tsx';

type GateTab = 'settings' | 'gate' | 'figure' | 'axis' | 'text';
const GATE_TABS: { id: GateTab; label: string }[] = [
  { id: 'figure', label: 'Figure' },
  { id: 'axis', label: 'Axis' },
  { id: 'text', label: 'Text' },
  { id: 'gate', label: 'Gate' },
  { id: 'settings', label: 'Settings' },
];
const TAB_KEYS: Record<PlotTarget, string> = {
  gate: 'flowmeris.gatePanelTab',
  tiles: 'flowmeris.tilesPanelTab',
  grid: 'flowmeris.gridPanelTab',
};
const NAMES: Record<PlotTarget, string> = { gate: 'Gate', tiles: 'Tiles', grid: 'Plot' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The Gate view's settings: Figure / Axis / Text / Gate / Settings tabs of collapsible cards. With `target`
 * 'tiles' or 'grid', the same panel for the Tiles view or the Plot view's selected grid plot, editing only
 * those plots (never the Gate view's).
 */
export function Inspector({ target = 'gate' }: { target?: PlotTarget }) {
  const tiles = target === 'tiles';
  const grid = target === 'grid';
  const group = useGroup();
  const gatePlot = usePlotForPopulation();
  const tilePlot = useTilePlot(tiles ? group : undefined);
  const cellId = useStore((s) => s.ui.gridCellId);
  const gridPlot = grid ? group?.grid.cells.find((c) => c?.id === cellId) : undefined;
  const plot: PlotSpec | undefined = tiles ? tilePlot : grid ? (gridPlot ?? undefined) : gatePlot;
  /** The plots this panel edits: the group's Tiles plots, grid plots or Gate-view plots. */
  const plotsOf = (g: Group) => targetPlots(g, target);
  const follow = (g: Group) => (tiles ? g.tilePlotStyleFollow : g.plotStyleFollow);
  /** Defaults of the plots this panel edits: Tiles and grid plots start with smaller text. */
  const defStyle = target === 'gate' ? DEFAULT_STYLE : TILE_STYLE;
  const defFig = target === 'gate' ? DEFAULT_FIGURE : TILE_FIGURE;
  const plotEdit = (g: Group, p: PlotSpec) =>
    target === 'gate' ? undefined : targetEdit(g.id, p.id, target);
  const mutate = useStore((s) => s.mutate);
  const [tab, setTab] = useRememberedTab<GateTab>(
    TAB_KEYS[target],
    GATE_TABS.map((t) => t.id),
    'figure',
  );
  // Every card starts open; collapsing one lasts for the session.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const panel: Panel = {
    isOpen: (id) => !closed[id],
    toggle: (id) => setClosed((c) => ({ ...c, [id]: !c[id] })),
  };
  // While settings are carried across populations, the population opened next takes the settings of
  // the one left (keeping its own title, ticks and axis titles).
  const last = useRef<{ groupId: string; plotId: string } | null>(null);
  useEffect(() => {
    if (!group || !plot) return;
    const prev = last.current;
    last.current = { groupId: group.id, plotId: plot.id };
    if (grid || !prev || prev.groupId !== group.id || prev.plotId === plot.id || !follow(group)) return;
    const from = plotsOf(group).find((p) => p.id === prev.plotId);
    if (!from || !carryToPopulation(structuredClone(from), structuredClone(plot))) return;
    mutate('Carry settings to population', (w) => {
      const g = w.groups.find((x) => x.id === group.id);
      const src = g && plotsOf(g).find((p) => p.id === prev.plotId);
      const dst = g && plotsOf(g).find((p) => p.id === plot.id);
      if (src && dst) carryToPopulation(src, dst);
    });
  }, [group?.id, plot?.id]);
  if (!group || !plot)
    return (
      <aside className="inspector ridge-inspector" aria-label={`${NAMES[target]} settings`}>
        {grid && group && <p className="muted small">Select a plot in the grid to change its settings.</p>}
      </aside>
    );
  const fig = plot.style.figure ?? defFig;
  /** Edit the plot's figure options, creating them on first edit. Edits sharing `merge` coalesce into one undo step. */
  const edit = (label: string, fn: (f: PlotFigure, p: PlotSpec) => void, merge?: string) =>
    mutate(
      label,
      (w) => {
        const g = w.groups.find((x) => x.id === group.id);
        const p = g && plotsOf(g).find((x) => x.id === plot.id);
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
  const titleReset = (k: 'xTitle' | 'yTitle') => ({
    changed: fig[k] !== undefined,
    reset: () => fig[k] !== undefined && set(k, undefined, 'Reset axis title'),
  });
  const titleField = (k: 'xTitle' | 'yTitle', label: string) => (
    <label className="field short-text" title="Leave empty for the default; type a space for no title">
      Title
      <input
        type="text"
        aria-label={label}
        value={fig[k] ?? ''}
        placeholder="Marker :: channel"
        onChange={(e) => set(k, e.target.value || undefined, label, k)}
      />
    </label>
  );
  const card = (id: string) => ({ open: panel.isOpen(id), onToggle: () => panel.toggle(id) });
  const is2d = plot.kind !== 'histogram' && !!plot.y;
  // The gates drawn on this plot (this population, on these axes), in the order they were made.
  const gates = Object.values(group.template.gates).filter(
    (g) => g.parentPop === plot.population && gateMatchesAxes(g, plot.x, is2d ? plot.y : undefined),
  );

  return (
    <aside className="inspector ridge-inspector" aria-label={`${NAMES[target]} settings`}>
      <div className="ridge-inspector-head">
        <div className="tabs ridge-tabs" role="tablist" aria-label={`${NAMES[target]} settings`}>
          {GATE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`gate-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="gate-tabpanel"
              className={tab === t.id ? 'on' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ridge-inspector-global">
          <span className="field">Reset this panel</span>
          <button
            type="button"
            className="icon reset-all"
            title="Reset the settings in this panel for this plot"
            aria-label="Reset the settings in this panel"
            disabled={panelAtDefaults(tab, plot, group, target)}
            onClick={() =>
              mutate(`Reset ${tab} settings`, (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                const p = g && plotsOf(g).find((x) => x.id === plot.id);
                if (g && p) resetPanel(tab, p, g, w, target);
              })
            }
          >
            <ResetIcon />
          </button>
        </div>
      </div>
      <div id="gate-tabpanel" role="tabpanel" aria-labelledby={`gate-tab-${tab}`}>
        {tab === 'settings' && grid && (
          <>
            <Section id="apply" title="Apply settings" {...card('apply')}>
              <ActionRow
                label="Apply same settings for all grid plots"
                title="Give every plot in the grid this plot's settings now (each keeps its title, ticks and axis titles)"
                icon={<ApplyIcon />}
                disabled={populationsMatch(plotsOf(group), plot.id)}
                onClick={() =>
                  mutate('Apply settings to all grid plots', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    if (g) applyToPopulations(plotsOf(g), plot.id);
                  })
                }
              />
              <label
                className="field check"
                title="On: a setting you change on a grid plot changes on every grid plot too; only that setting (each keeps its title, ticks and axis titles; an axis scale and range go to plots showing the same channel). Nothing changes when you tick it."
              >
                <input
                  type="checkbox"
                  checked={group.gridStyleFollow}
                  onChange={(e) => {
                    const on = e.target.checked;
                    mutate(on ? 'Carry settings to all grid plots' : 'Settings per grid plot', (w) => {
                      const g = w.groups.find((x) => x.id === group.id);
                      if (g) g.gridStyleFollow = on;
                    });
                  }}
                />
                Carry settings to all grid plots
              </label>
            </Section>
            <Section id="resetAll" title="Reset settings" {...card('resetAll')}>
              <ActionRow
                label="All settings in this plot"
                title="Reset the settings of this grid plot"
                icon={<ResetIcon />}
                disabled={plotAtDefaults(plot, defStyle)}
                onClick={() =>
                  mutate('Reset the settings of this grid plot', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (p) resetPlotStyles(p, defStyle);
                  })
                }
              />
              <ActionRow
                label="All grid plots"
                title="Reset the settings of every plot in the grid"
                icon={<ResetIcon />}
                disabled={plotsOf(group).every((x) => plotAtDefaults(x, defStyle))}
                onClick={() =>
                  mutate('Reset the settings of every grid plot', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    if (g) for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
                  })
                }
              />
            </Section>
          </>
        )}
        {tab === 'settings' && !grid && (
          <>
            <Section id="apply" title="Apply settings" {...card('apply')}>
              <ActionRow
                label="Apply same settings for all populations"
                title="Give every population's plot this plot's settings now (each keeps its title, ticks and axis titles)"
                icon={<ApplyIcon />}
                disabled={populationsMatch(plotsOf(group), plot.id)}
                onClick={() =>
                  mutate('Apply settings to all populations', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) applyToPopulations(plotsOf(g), p.id);
                  })
                }
              />
              <ActionRow
                label="Apply same settings for all plots"
                title="Give every X/Y channel pair of this population these settings now"
                icon={<ApplyIcon />}
                disabled={pairsMatch(plot)}
                onClick={() =>
                  mutate('Apply settings to all plots', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) applyToPairs(p);
                  })
                }
              />
              <label
                className="field check"
                title="On: the population you open next takes the settings of the one you leave (each keeps its title, ticks and axis titles). Nothing changes when you tick it."
              >
                <input
                  type="checkbox"
                  checked={follow(group)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    mutate(on ? 'Carry settings to populations' : 'Settings per population', (w) => {
                      const g = w.groups.find((x) => x.id === group.id);
                      if (!g) return;
                      if (tiles) g.tilePlotStyleFollow = on;
                      else g.plotStyleFollow = on;
                    });
                  }}
                />
                Carry settings to next populations
              </label>
              <label
                className="field check"
                title="On: the X/Y channel pair you switch to next takes the settings in use. Off: each pair keeps its own. Nothing changes when you tick it."
              >
                <input
                  type="checkbox"
                  checked={plot.styleFollow !== false}
                  onChange={(e) => {
                    const on = e.target.checked;
                    mutate(on ? 'Carry settings to plots' : 'Settings per channel pair', (w) => {
                      const g = w.groups.find((x) => x.id === group.id);
                      const p = g && plotsOf(g).find((x) => x.id === plot.id);
                      if (p) setPairStyles(p, !on);
                    });
                  }}
                />
                Carry settings to next plots
              </label>
            </Section>
            <Section id="resetAll" title="Reset settings" {...card('resetAll')}>
              <ActionRow
                label="All settings in this plot"
                title="Reset the settings of this plot (this population, these X/Y channels)"
                icon={<ResetIcon />}
                disabled={isDefaultStyle(plot.style, defStyle)}
                onClick={() =>
                  mutate('Reset the settings of this plot', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) resetCurrentStyle(p, defStyle);
                  })
                }
              />
              <ActionRow
                label="All plots of this population"
                title="Reset the settings of every plot of this population"
                icon={<ResetIcon />}
                disabled={plotAtDefaults(plot, defStyle)}
                onClick={() =>
                  mutate('Reset the settings of every plot of this population', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) resetPlotStyles(p, defStyle);
                  })
                }
              />
              <ActionRow
                label="All populations in this plot"
                title="Reset the settings of this X/Y channel pair in every population"
                icon={<ResetIcon />}
                disabled={pairAtDefaults(plotsOf(group), axesKey(plot), defStyle)}
                onClick={() =>
                  mutate('Reset the settings of this X/Y channel pair in every population', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) resetPairStyles(plotsOf(g), axesKey(p), defStyle);
                  })
                }
              />
              <ActionRow
                label="All plots in all populations"
                title="Reset the settings of every plot in every population"
                icon={<ResetIcon />}
                disabled={plotsOf(group).every((x) => plotAtDefaults(x, defStyle))}
                onClick={() =>
                  mutate('Reset the settings of every plot in every population', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    const p = g && plotsOf(g).find((x) => x.id === plot.id);
                    if (g && p) for (const x of plotsOf(g)) resetPlotStyles(x, defStyle);
                  })
                }
              />
            </Section>
          </>
        )}
        {tab === 'gate' &&
          (gates.length ? (
            gates.map((g) => <GateEditor key={g.id} gateId={g.id} panel={panel} />)
          ) : (
            <p className="muted small">
              No gates on this plot yet. Draw one with the tools above the{' '}
              {tiles ? 'tiles' : grid ? 'grid' : 'plot'}.
            </p>
          ))}
        {tab === 'figure' && (
          <>
            <Section id="plot" title="Plot" {...resetOf(['title'], 'plot title')} {...card('plot')}>
              <PlotKindSelect group={group} plot={plot} edit={plotEdit(group, plot)} label="Plot type" />
              <label className="field short-text">
                Plot title
                <input
                  type="text"
                  value={fig.title ?? ''}
                  placeholder="None"
                  onChange={(e) => set('title', e.target.value || undefined, 'Plot title', 'title')}
                />
              </label>
              {grid && gridPlot && <CellSourceFields group={group} cell={gridPlot} />}
            </Section>
            {grid && gridPlot && (
              <Section
                id="overlay"
                title="Sample overlay"
                changed={gridPlot.overlay.length > 0}
                onReset={() => clearCellOverlay(group.id, gridPlot.id)}
                {...card('overlay')}
              >
                <CellOverlayFields group={group} cell={gridPlot} />
              </Section>
            )}
            <StyleEditor target={target} plot={plot} panel={panel} />
            <Section
              id="baseFont"
              title="Base font"
              {...resetOf(
                [
                  'fontFamily',
                  'fontColor',
                  'fontSize',
                  'titleFontSize',
                  'tickFontSize',
                  'axisTitleFontSize',
                  'gateFontSize',
                ],
                'base font',
              )}
              {...card('baseFont')}
            >
              <FontSelect
                label="Base font"
                value={fig.fontFamily}
                onChange={(v) => set('fontFamily', v ?? DEFAULT_FIGURE.fontFamily, 'Plot font')}
              />
              <label className="field inline">
                Base font color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    value={fig.fontColor}
                    onChange={(e) => set('fontColor', e.target.value, 'Plot font color', 'fontColor')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={fig.fontColor === DEFAULT_FIGURE.fontColor}
                    aria-label="Reset base font color to black"
                    title={
                      fig.fontColor === DEFAULT_FIGURE.fontColor
                        ? 'Base font color is the default'
                        : 'Reset base font color to black'
                    }
                    onClick={() => set('fontColor', DEFAULT_FIGURE.fontColor, 'Plot font color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </label>
              <NumInput
                live
                label="Base font size (px)"
                step={0.5}
                title="Scales the title, tick, axis title and gate label sizes together"
                value={fig.fontSize}
                onCommit={(v) => {
                  const next = clamp(v, 4, 48);
                  if (next === fig.fontSize) return;
                  const k = next / fig.fontSize;
                  const scaled = (x: number) => clamp(Math.round(x * k * 2) / 2, 4, 48);
                  edit(
                    'Plot base font size',
                    (f) => {
                      f.fontSize = next;
                      f.titleFontSize = scaled(f.titleFontSize);
                      f.tickFontSize = scaled(f.tickFontSize);
                      f.axisTitleFontSize = scaled(f.axisTitleFontSize);
                      f.gateFontSize = scaled(f.gateFontSize);
                    },
                    'fontSize',
                  );
                }}
              />
            </Section>
          </>
        )}
        {tab === 'axis' && (
          <>
            {is2d && (
              <div className="side-export swap-axes">
                <button
                  type="button"
                  title="Swap the X and Y axes"
                  onClick={() =>
                    edit('Swap axes', (f, p) => {
                      if (!p.y) return;
                      // Settings saved for the swapped pair come back as they were; otherwise swap the per-axis ones.
                      if (withAxesChange(p, () => void ([p.x, p.y] = [p.y!, p.x]))) return;
                      [f.xTicks, f.yTicks] = [f.yTicks, f.xTicks];
                      [f.xTitle, f.yTitle] = [f.yTitle, f.xTitle];
                      for (const k of ['xTicks', 'yTicks', 'xTitle', 'yTitle'] as const)
                        if (f[k] === undefined) delete f[k];
                    })
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M2.5 5h10M10 2.5 12.5 5 10 7.5M13.5 11h-10M6 8.5 3.5 11 6 13.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Swap X and Y
                </button>
              </div>
            )}
            <AxisEditor target={target} which="x" plot={plot} panel={panel} extra={titleReset('xTitle')}>
              {titleField('xTitle', 'X axis title')}
            </AxisEditor>
            {is2d && (
              <AxisEditor target={target} which="y" plot={plot} panel={panel} extra={titleReset('yTitle')}>
                {titleField('yTitle', 'Y axis title')}
              </AxisEditor>
            )}
            <Section
              id="ticks"
              title="Ticks and spine"
              {...resetOf(
                [
                  'axisColor',
                  'tickWidth',
                  'spineColor',
                  'spineWidth',
                  'boxAspect',
                  'showTickLabels',
                  'xTicks',
                  'yTicks',
                ],
                'ticks and spine',
              )}
              {...card('ticks')}
            >
              <label className="field inline">
                Tick color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Tick color"
                    value={fig.axisColor ?? '#c8c8c8'}
                    onChange={(e) => set('axisColor', e.target.value, 'Tick color', 'axisColor')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={!fig.axisColor}
                    aria-label="Reset tick color to the theme's"
                    title={fig.axisColor ? "Reset tick color to the theme's" : 'Tick color is the default'}
                    onClick={() => set('axisColor', undefined, 'Tick color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </label>
              <NumInput
                live
                label="Tick width (px)"
                step={0.25}
                value={fig.tickWidth}
                onCommit={(v) => set('tickWidth', clamp(v, 0, 10), 'Tick width', 'tickWidth')}
              />
              <label className="field inline">
                Spine color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Spine color"
                    value={fig.spineColor ?? '#c8c8c8'}
                    onChange={(e) => set('spineColor', e.target.value, 'Spine color', 'spineColor')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={!fig.spineColor}
                    aria-label="Reset spine color to the theme's"
                    title={fig.spineColor ? "Reset spine color to the theme's" : 'Spine color is the default'}
                    onClick={() => set('spineColor', undefined, 'Spine color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </label>
              <NumInput
                live
                label="Spine width (px)"
                step={0.25}
                value={fig.spineWidth}
                onCommit={(v) => set('spineWidth', clamp(v, 0, 10), 'Spine width', 'spineWidth')}
              />
              <label className="field check">
                <input
                  type="checkbox"
                  checked={fig.boxAspect === undefined}
                  onChange={(e) => set('boxAspect', e.target.checked ? undefined : 1, 'Box aspect ratio')}
                />
                Free box aspect ratio
              </label>
              {fig.boxAspect !== undefined && (
                <div className="sub-option">
                  <NumInput
                    live
                    label="Box width ÷ height"
                    step={0.1}
                    value={fig.boxAspect}
                    onCommit={(v) => set('boxAspect', clamp(v, 0.2, 10), 'Box aspect ratio', 'boxAspect')}
                  />
                </div>
              )}
              <label className="field check">
                <input
                  type="checkbox"
                  checked={fig.showTickLabels}
                  onChange={(e) => set('showTickLabels', e.target.checked, 'Tick labels')}
                />
                Show tick labels
              </label>
              <div className="ridge-pane-title">X axis</div>
              <TicksEditor ticks={fig.xTicks} onCommit={(t) => set('xTicks', t, 'X ticks')} />
              {is2d && (
                <>
                  <div className="ridge-pane-title">Y axis</div>
                  <TicksEditor ticks={fig.yTicks} onCommit={(t) => set('yTicks', t, 'Y ticks')} />
                </>
              )}
            </Section>
          </>
        )}
        {tab === 'text' && (
          <>
            <Section
              id="titleText"
              title="Plot title"
              {...resetOf(['titleText', 'titleFontSize'], 'plot title text')}
              {...card('titleText')}
            >
              <TextStyleEditor
                label="Plot title"
                value={fig.titleText}
                base={fig.fontFamily}
                baseColor={fig.fontColor}
                onChange={(t) => set('titleText', t, 'Plot title text')}
                size={fig.titleFontSize}
                onSize={(v) => set('titleFontSize', v, 'Plot title size')}
              />
            </Section>
            <Section
              id="tickText"
              title="Tick labels"
              {...resetOf(['tickText', 'tickFontSize'], 'tick label text')}
              {...card('tickText')}
            >
              <TextStyleEditor
                label="Tick labels"
                value={fig.tickText}
                base={fig.fontFamily}
                baseColor={fig.fontColor}
                onChange={(t) => set('tickText', t, 'Tick label text')}
                size={fig.tickFontSize}
                onSize={(v) => set('tickFontSize', v, 'Tick label size')}
              />
            </Section>
            <Section
              id="axisTitleText"
              title="Axis titles"
              {...resetOf(['axisTitleText', 'axisTitleFontSize'], 'axis title text')}
              {...card('axisTitleText')}
            >
              <TextStyleEditor
                label="Axis titles"
                value={fig.axisTitleText}
                base={fig.fontFamily}
                baseColor={fig.fontColor}
                onChange={(t) => set('axisTitleText', t, 'Axis title text')}
                size={fig.axisTitleFontSize}
                onSize={(v) => set('axisTitleFontSize', v, 'Axis title size')}
              />
            </Section>
            <Section
              id="gateText"
              title="Gate labels"
              {...resetOf(['gateText', 'gateFontSize'], 'gate label text')}
              {...card('gateText')}
            >
              <TextStyleEditor
                label="Gate labels"
                value={fig.gateText}
                base={fig.fontFamily}
                baseColor={fig.fontColor}
                onChange={(t) => set('gateText', t, 'Gate label text')}
                size={fig.gateFontSize}
                onSize={(v) => set('gateFontSize', v, 'Gate label size')}
              />
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

const axisAtFactory = (p: PlotSpec, g: Group, ws: Parameters<typeof factoryAxis>[0]) =>
  [p.x, p.y].every((a) => {
    if (!a) return true;
    const f = factoryAxis(ws, g, a.channel);
    return a.transform === f.transform && a.range[0] === f.range[0] && a.range[1] === f.range[1];
  });

/** Whether the settings of tab `tab` are at the defaults for plot `p` of `target`. */
function panelAtDefaults(tab: GateTab, p: PlotSpec, g: Group, target: PlotTarget): boolean {
  if (tab === 'settings' || tab === 'gate') return true;
  const gate = target === 'gate';
  const at = styleKeysAtDefaults(
    p.style,
    PANEL_FIGURE_KEYS[tab],
    tab === 'figure' ? (gate ? DEFAULT_STYLE : TILE_STYLE) : null,
    gate ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  return tab === 'axis' ? at && axisAtFactory(p, g, useStore.getState().ws) : at;
}

/** Reset the settings of tab `tab` for plot `p` (inside a mutation); only a Gate-view plot's scales become the channel's defaults. */
function resetPanel(
  tab: GateTab,
  p: PlotSpec,
  g: Group,
  w: Parameters<typeof factoryAxis>[0],
  target: PlotTarget,
) {
  if (tab === 'settings' || tab === 'gate') return;
  const gate = target === 'gate';
  resetStyleKeys(
    p.style,
    PANEL_FIGURE_KEYS[tab],
    tab === 'figure' ? (gate ? DEFAULT_STYLE : TILE_STYLE) : null,
    gate ? DEFAULT_FIGURE : TILE_FIGURE,
  );
  if (tab !== 'axis') return;
  // The axes' scale and range, as each axis card's own reset does.
  for (const a of [p.x, p.y]) {
    if (!a) continue;
    const f = factoryAxis(w, g, a.channel);
    a.transform = f.transform;
    a.range = [...f.range];
    if (gate) g.axisDefaults[a.channel] = { ...a };
  }
}
