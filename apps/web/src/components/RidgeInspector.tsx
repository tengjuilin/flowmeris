import {
  type AxisSpec,
  type Group,
  type RidgeLayout,
  type RidgeStyle,
  RidgeStyleSchema,
  type Workspace,
  newId,
} from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { formatLinear } from '@flowmeris/transforms';
import { useCallback, useMemo, useState } from 'react';
import { defaultAxis } from '../lib/defaults.ts';
import { useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';
import { NumInput } from './Inspector.tsx';
import { usePlotForPopulation } from './PlotPanel.tsx';

export const DEFAULT_RIDGE_STYLE: RidgeStyle = RidgeStyleSchema.parse({});
export const DEFAULT_OVERLAP = 0.6;

export const FONT_STACKS: Record<RidgeStyle['fontFamily'], string> = {
  sans: 'Inter, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
};

/** All of the group's samples in ridge order: `style.order` first, the rest in group order. */
function orderedSampleIds(g: Group, style: RidgeStyle): string[] {
  const inGroup = new Set(g.sampleIds);
  const head = style.order.filter((id) => inGroup.has(id));
  const seen = new Set(head);
  return [...head, ...g.sampleIds.filter((id) => !seen.has(id))];
}

export function ridgeColor(style: RidgeStyle, sampleId: string, index: number): string {
  return (
    style.sampleColors[sampleId] ??
    (style.colorMode === 'palette' ? CATEGORICAL[index % CATEGORICAL.length]! : style.color)
  );
}

/** The ridge layout of the current group and population, with defaults when none is saved yet. */
export function useRidge() {
  const popId = useStore((s) => s.ui.popId);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  const plot = usePlotForPopulation();
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const layout = group?.layouts.find((l): l is RidgeLayout => l.kind === 'ridge' && l.population === popId);
  const style = layout?.style ?? DEFAULT_RIDGE_STYLE;
  const overlap = layout?.overlap ?? DEFAULT_OVERLAP;
  const ch = layout?.axis.channel ?? plot?.x.channel ?? group?.channels[0] ?? '';

  // The displayed axis follows the Gate view's axis for this channel, so scale edits there carry over.
  const axis: AxisSpec | null = useMemo(() => {
    if (!group) return null;
    if (plot && plot.x.channel === ch) return plot.x;
    if (plot?.y && plot.y.channel === ch) return plot.y;
    return group.axisDefaults[ch] ?? null;
  }, [group, plot, ch]);

  const ordered = useMemo(() => {
    if (!group) return [];
    const vis = new Set(shown);
    return orderedSampleIds(group, style).filter((id) => vis.has(id));
  }, [group, style, shown]);

  /** Edit the saved layout, creating it on first edit. Edits sharing `merge` coalesce into one undo step. */
  const update = useCallback(
    (label: string, fn: (l: RidgeLayout, w: Workspace, g: Group) => void, merge?: string) => {
      if (!group) return;
      mutate(
        label,
        (w) => {
          const g = w.groups.find((x) => x.id === group.id)!;
          const existing = g.layouts.find(
            (l): l is RidgeLayout => l.kind === 'ridge' && l.population === popId,
          );
          if (existing) return fn(existing, w, g);
          const l: RidgeLayout = {
            kind: 'ridge',
            id: newId('lay_'),
            population: popId,
            axis: { ...defaultAxis(w, g, ch) },
            overlap: DEFAULT_OVERLAP,
            norm: 'mode',
            style: structuredClone(DEFAULT_RIDGE_STYLE),
          };
          fn(l, w, g);
          g.layouts.push(l);
        },
        merge && `ridge:${group.id}:${popId}:${merge}`,
      );
    },
    [group, popId, ch, mutate],
  );

  return { group, plot, layout, style, overlap, ch, axis, ordered, names, update };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function formatTicks(ticks: RidgeStyle['ticks']): string {
  return (ticks ?? [])
    .map((t) => (t.label === undefined ? String(t.value) : `${t.value} = ${t.label}`))
    .join('\n');
}

/** One tick per line or comma: `1000` or `1000 = 1k`. Returns null on a malformed entry. */
function parseTicks(text: string): RidgeStyle['ticks'] | null {
  const out: NonNullable<RidgeStyle['ticks']> = [];
  for (const raw of text.split(/[\n,]/)) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    const value = Number((eq < 0 ? part : part.slice(0, eq)).trim());
    if (!Number.isFinite(value)) return null;
    out.push(eq < 0 ? { value } : { value, label: part.slice(eq + 1).trim() });
  }
  return out;
}

function TicksEditor({
  ticks,
  onCommit,
}: { ticks: RidgeStyle['ticks']; onCommit: (t: RidgeStyle['ticks']) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  return (
    <label
      className="field"
      title="Tick marks in data units, one per line: 1000 or 1000 = 1k. Empty = automatic."
    >
      Custom ticks
      <textarea
        rows={3}
        placeholder={'Automatic\ne.g. 0\n1000 = 1k\n10000 = 10k'}
        value={text ?? formatTicks(ticks)}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onBlur={() => {
          if (text === null) return;
          const t = parseTicks(text);
          if (!t) return setBad(true);
          onCommit(t.length ? t : undefined);
          setText(null);
        }}
      />
      {bad && (
        <span className="field-error small">
          Each entry must be a number, optionally followed by “= label”.
        </span>
      )}
    </label>
  );
}

export function RidgeInspector() {
  const { group, layout, style, overlap, ordered, names, update } = useRidge();
  if (!group) return null;
  const set = <K extends keyof RidgeStyle>(key: K, value: RidgeStyle[K], label: string, merge?: string) =>
    update(
      label,
      (l) => {
        if (value === undefined) delete l.style[key];
        else l.style[key] = value;
      },
      merge,
    );
  const move = (id: string, dir: -1 | 1) =>
    update('Reorder ridges', (l) => {
      const full = orderedSampleIds(group, l.style);
      const j = ordered.indexOf(id);
      const other = ordered[j + dir];
      if (other === undefined) return;
      const a = full.indexOf(id);
      const b = full.indexOf(other);
      full[a] = other;
      full[b] = id;
      l.style.order = full;
    });

  return (
    <aside className="inspector ridge-inspector" aria-label="Ridge plot settings">
      <fieldset>
        <legend>Ridges</legend>
        <label className="field">
          Colour
          <select
            value={style.colorMode}
            onChange={(e) => set('colorMode', e.target.value as RidgeStyle['colorMode'], 'Ridge colour mode')}
          >
            <option value="single">Single colour</option>
            <option value="palette">Categorical palette</option>
          </select>
        </label>
        {style.colorMode === 'single' && (
          <label className="field">
            Fill colour
            <input
              type="color"
              value={style.color}
              onChange={(e) => set('color', e.target.value, 'Ridge colour', 'color')}
            />
          </label>
        )}
        <label className="field">
          Fill opacity · {Math.round(style.fillOpacity * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.fillOpacity}
            onChange={(e) => set('fillOpacity', Number(e.target.value), 'Ridge opacity', 'opacity')}
          />
        </label>
        <div className="grid2">
          <label className="field">
            Outline
            <input
              type="color"
              value={style.strokeColor ?? '#ffffff'}
              disabled={style.strokeColor === undefined}
              onChange={(e) => set('strokeColor', e.target.value, 'Ridge outline colour', 'stroke')}
            />
          </label>
          <NumInput
            label="Outline width"
            step={0.25}
            value={style.strokeWidth}
            onCommit={(v) => set('strokeWidth', clamp(v, 0, 10), 'Ridge outline width')}
          />
        </div>
        <label className="field check">
          <input
            type="checkbox"
            checked={style.strokeColor === undefined}
            onChange={(e) =>
              set('strokeColor', e.target.checked ? undefined : '#000000', 'Ridge outline colour')
            }
          />
          Outline matches background
        </label>
        <label className="field">
          Overlap · {Math.round(overlap * 100)}%
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={overlap}
            onChange={(e) =>
              update(
                'Ridge overlap',
                (l) => {
                  l.overlap = Number(e.target.value);
                },
                'overlap',
              )
            }
          />
        </label>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={style.rowHeight === undefined}
              onChange={(e) => set('rowHeight', e.target.checked ? undefined : 40, 'Ridge row height')}
            />
            Auto row height
          </label>
          {style.rowHeight !== undefined && (
            <NumInput
              label="Row height (px)"
              step={1}
              value={style.rowHeight}
              onCommit={(v) => set('rowHeight', clamp(v, 8, 400), 'Ridge row height')}
            />
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Samples</legend>
        <label className="field check">
          <input
            type="checkbox"
            checked={style.showLabels}
            onChange={(e) => set('showLabels', e.target.checked, 'Ridge labels')}
          />
          Show labels
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={style.showCounts}
            disabled={!style.showLabels}
            onChange={(e) => set('showCounts', e.target.checked, 'Ridge event counts')}
          />
          Show event counts (n)
        </label>
        <div className="grid2">
          <NumInput
            label="Label size (px)"
            step={0.5}
            value={style.labelFontSize}
            onCommit={(v) => set('labelFontSize', clamp(v, 4, 48), 'Ridge label size')}
          />
          <NumInput
            label="Label width (px)"
            step={10}
            value={style.labelWidth}
            onCommit={(v) => set('labelWidth', clamp(v, 0, 1000), 'Ridge label width')}
          />
        </div>
        <ol className="ridge-samples">
          {ordered.map((id, i) => {
            const custom = style.sampleColors[id] !== undefined;
            return (
              <li key={id}>
                <span className="ridge-move">
                  <button
                    type="button"
                    className="icon"
                    disabled={i === 0}
                    aria-label={`Move ${names[id] ?? id} up`}
                    onClick={() => move(id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="icon"
                    disabled={i === ordered.length - 1}
                    aria-label={`Move ${names[id] ?? id} down`}
                    onClick={() => move(id, 1)}
                  >
                    ▼
                  </button>
                </span>
                <input
                  type="color"
                  className={custom ? 'custom' : ''}
                  value={ridgeColor(style, id, i)}
                  title={custom ? 'Custom colour' : 'Colour from the ridge settings; pick to override'}
                  aria-label={`Colour of ${names[id] ?? id}`}
                  onChange={(e) =>
                    update(
                      'Ridge sample colour',
                      (l) => {
                        l.style.sampleColors[id] = e.target.value;
                      },
                      `color:${id}`,
                    )
                  }
                />
                <input
                  type="text"
                  value={style.sampleLabels[id] ?? ''}
                  placeholder={names[id] ?? id}
                  aria-label={`Label of ${names[id] ?? id}`}
                  onChange={(e) =>
                    update(
                      'Ridge sample label',
                      (l) => {
                        if (e.target.value) l.style.sampleLabels[id] = e.target.value;
                        else delete l.style.sampleLabels[id];
                      },
                      `label:${id}`,
                    )
                  }
                />
                {custom && (
                  <button
                    type="button"
                    className="icon"
                    title="Reset colour"
                    aria-label={`Reset colour of ${names[id] ?? id}`}
                    onClick={() =>
                      update('Reset ridge sample colour', (l) => {
                        delete l.style.sampleColors[id];
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <div className="ridge-actions">
          <button
            type="button"
            onClick={() =>
              update('Reverse ridge order', (l) => {
                l.style.order = orderedSampleIds(group, l.style).reverse();
              })
            }
          >
            Reverse
          </button>
          <button
            type="button"
            disabled={!style.order.length}
            onClick={() => set('order', [], 'Reset ridge order')}
          >
            Reset order
          </button>
          <button
            type="button"
            disabled={!Object.keys(style.sampleColors).length}
            onClick={() => set('sampleColors', {}, 'Reset ridge colours')}
          >
            Reset colours
          </button>
          <button
            type="button"
            disabled={!Object.keys(style.sampleLabels).length}
            onClick={() => set('sampleLabels', {}, 'Reset ridge labels')}
          >
            Reset labels
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>X axis</legend>
        <label className="field check">
          <input
            type="checkbox"
            checked={style.showTickLabels}
            onChange={(e) => set('showTickLabels', e.target.checked, 'Ridge tick labels')}
          />
          Show tick labels
        </label>
        <NumInput
          label="Tick label size (px)"
          step={0.5}
          value={style.tickFontSize}
          onCommit={(v) => set('tickFontSize', clamp(v, 4, 48), 'Ridge tick label size')}
        />
        <TicksEditor ticks={style.ticks} onCommit={(t) => set('ticks', t, 'Ridge ticks')} />
        <label className="field" title="Leave empty for the default; type a space for no title">
          Axis title
          <input
            type="text"
            value={style.axisTitle ?? ''}
            placeholder="Marker :: channel"
            onChange={(e) => set('axisTitle', e.target.value || undefined, 'Ridge axis title', 'title')}
          />
        </label>
        <NumInput
          label="Title size (px)"
          step={0.5}
          value={style.titleFontSize}
          onCommit={(v) => set('titleFontSize', clamp(v, 4, 48), 'Ridge title size')}
        />
      </fieldset>

      <fieldset>
        <legend>Figure</legend>
        <label className="field">
          Font
          <select
            value={style.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value as RidgeStyle['fontFamily'], 'Ridge font')}
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={style.width === undefined}
              onChange={(e) => set('width', e.target.checked ? undefined : 800, 'Ridge plot width')}
            />
            Fit width
          </label>
          {style.width !== undefined && (
            <NumInput
              label="Width (px)"
              step={10}
              value={style.width}
              onCommit={(v) => set('width', clamp(v, 300, 10000), 'Ridge plot width')}
            />
          )}
        </div>
        <button
          type="button"
          disabled={!layout}
          onClick={() =>
            update('Reset ridge settings', (l) => {
              l.style = structuredClone(DEFAULT_RIDGE_STYLE);
              l.overlap = DEFAULT_OVERLAP;
            })
          }
        >
          Reset all settings
        </button>
      </fieldset>
    </aside>
  );
}
