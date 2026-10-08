import type { PlotFigure, PlotSpec } from '@flowmeris/model';
import { useState } from 'react';
import { DEFAULT_FIGURE } from '../lib/figure.ts';
import { useGroup, useStore } from '../state/store.ts';
import {
  AxisEditor,
  GateEditor,
  NumInput,
  type Panel,
  ResetIcon,
  Section,
  StyleEditor,
} from './Inspector.tsx';
import { PlotKindSelect, usePlotForPopulation } from './PlotPanel.tsx';
import { FontSelect, TextStyleEditor, TicksEditor } from './RidgeInspector.tsx';

type GateTab = 'figure' | 'axis' | 'text';
const GATE_TABS: { id: GateTab; label: string }[] = [
  { id: 'figure', label: 'Figure' },
  { id: 'axis', label: 'Axis' },
  { id: 'text', label: 'Text' },
];
const TAB_KEY = 'flowmeris.gatePanelTab';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function loadTab(): GateTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t && GATE_TABS.some((x) => x.id === t)) return t as GateTab;
  } catch {}
  return 'figure';
}

/** The Gate view's settings: the selected gate, then Figure / Axis / Text tabs of collapsible cards. */
export function Inspector() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  const mutate = useStore((s) => s.mutate);
  const [tab, setTabState] = useState<GateTab>(loadTab);
  // Every card starts open; collapsing one lasts for the session.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const panel: Panel = {
    isOpen: (id) => !closed[id],
    toggle: (id) => setClosed((c) => ({ ...c, [id]: !c[id] })),
  };
  if (!group || !plot) return <aside className="inspector" />;
  const setTab = (t: GateTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };
  const fig = plot.style.figure ?? DEFAULT_FIGURE;
  /** Edit the plot's figure options, creating them on first edit. Edits sharing `merge` coalesce into one undo step. */
  const edit = (label: string, fn: (f: PlotFigure, p: PlotSpec) => void, merge?: string) =>
    mutate(
      label,
      (w) => {
        const p = w.groups.find((x) => x.id === group.id)?.plots.find((x) => x.id === plot.id);
        if (!p) return;
        p.style.figure ??= structuredClone(DEFAULT_FIGURE);
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
    changed: keys.some((k) => !same(fig[k], DEFAULT_FIGURE[k])),
    onReset: () =>
      edit(`Reset ${title}`, (f) => {
        for (const k of keys) {
          const d = DEFAULT_FIGURE[k];
          if (d === undefined) delete f[k];
          else (f as Record<string, unknown>)[k] = structuredClone(d);
        }
      }),
  });
  const card = (id: string) => ({ open: panel.isOpen(id), onToggle: () => panel.toggle(id) });
  const is2d = plot.kind !== 'histogram' && !!plot.y;

  return (
    <aside className="inspector ridge-inspector" aria-label="Gate settings">
      <div className="ridge-inspector-head">
        <div className="tabs ridge-tabs" role="tablist" aria-label="Gate settings">
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
      </div>
      <GateEditor panel={panel} />
      <div id="gate-tabpanel" role="tabpanel" aria-labelledby={`gate-tab-${tab}`}>
        {tab === 'figure' && (
          <>
            <Section id="plotType" title="Plot type" {...card('plotType')}>
              <PlotKindSelect group={group} plot={plot} />
            </Section>
            <StyleEditor plot={plot} panel={panel} />
            <Section
              id="plotTitle"
              title="Plot title"
              {...resetOf(['title'], 'plot title')}
              {...card('plotTitle')}
            >
              <label className="field">
                Title
                <input
                  type="text"
                  value={fig.title ?? ''}
                  placeholder="None"
                  onChange={(e) => set('title', e.target.value || undefined, 'Plot title', 'title')}
                />
              </label>
            </Section>
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
              <div className="ridge-actions">
                <button
                  type="button"
                  title="Swap the X and Y axes"
                  onClick={() =>
                    edit('Swap axes', (f, p) => {
                      if (!p.y) return;
                      [p.x, p.y] = [p.y, p.x];
                      [f.xTicks, f.yTicks] = [f.yTicks, f.xTicks];
                      [f.xTitle, f.yTitle] = [f.yTitle, f.xTitle];
                      for (const k of ['xTicks', 'yTicks', 'xTitle', 'yTitle'] as const)
                        if (f[k] === undefined) delete f[k];
                    })
                  }
                >
                  ⇄ Swap X and Y
                </button>
              </div>
            )}
            <AxisEditor which="x" plot={plot} panel={panel} />
            {is2d && <AxisEditor which="y" plot={plot} panel={panel} />}
            <Section
              id="ticks"
              title="Ticks"
              {...resetOf(['axisColor', 'showTickLabels', 'xTicks', 'yTicks'], 'ticks')}
              {...card('ticks')}
            >
              <label className="field inline">
                Axis color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Axis color"
                    value={fig.axisColor ?? '#c8c8c8'}
                    onChange={(e) => set('axisColor', e.target.value, 'Axis color', 'axisColor')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={!fig.axisColor}
                    aria-label="Reset axis color to the theme's"
                    title={fig.axisColor ? "Reset axis color to the theme's" : 'Axis color is the default'}
                    onClick={() => set('axisColor', undefined, 'Axis color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </label>
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
            <Section
              id="axisTitles"
              title="Axis titles"
              {...resetOf(['xTitle', 'yTitle'], 'axis titles')}
              {...card('axisTitles')}
            >
              <label className="field" title="Leave empty for the default; type a space for no title">
                X axis title
                <input
                  type="text"
                  value={fig.xTitle ?? ''}
                  placeholder="Marker :: channel"
                  onChange={(e) => set('xTitle', e.target.value || undefined, 'X axis title', 'xTitle')}
                />
              </label>
              {is2d && (
                <label className="field" title="Leave empty for the default; type a space for no title">
                  Y axis title
                  <input
                    type="text"
                    value={fig.yTitle ?? ''}
                    placeholder="Marker :: channel"
                    onChange={(e) => set('yTitle', e.target.value || undefined, 'Y axis title', 'yTitle')}
                  />
                </label>
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
