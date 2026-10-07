import {
  type AxisSpec,
  type Group,
  type RidgeCombine,
  RidgeCombineSchema,
  type RidgeLayout,
  type RidgeStyle,
  RidgeStyleSchema,
  type Workspace,
  newId,
} from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { formatLinear } from '@flowmeris/transforms';
import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { defaultAxis } from '../lib/defaults.ts';
import { type RidgeRow, applyOrder, comboRows, selectRidges } from '../lib/ridge.ts';
import { useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';
import { GroupPicker, toggleIds } from './GroupPicker.tsx';
import { NumInput } from './Inspector.tsx';
import { usePlotForPopulation } from './PlotPanel.tsx';

export const DEFAULT_RIDGE_STYLE: RidgeStyle = RidgeStyleSchema.parse({});
export const DEFAULT_RIDGE_COMBINE: RidgeCombine = RidgeCombineSchema.parse({});
/** A copy of `c` that is safe to take of an Immer draft (`structuredClone` cannot clone one). */
const copyCombine = (c: RidgeCombine): RidgeCombine => ({
  ...c,
  by: [...c.by],
  hidden: [...c.hidden],
  exclude: [...c.exclude],
});
export const DEFAULT_OVERLAP = 0.6;

export const FONT_STACKS: Record<RidgeStyle['fontFamily'], string> = {
  sans: 'Inter, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
};

export function ridgeColor(style: RidgeStyle, ridgeId: string, index: number): string {
  return (
    style.sampleColors[ridgeId] ??
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
  // While following, the group's shared replicate settings apply to every population.
  const follow = group?.ridgeFollow ?? true;
  const combine =
    (follow ? group?.ridgeCombine : layout?.combine) ?? group?.ridgeCombine ?? DEFAULT_RIDGE_COMBINE;
  const ws = useStore((s) => s.ws);
  const overlap = layout?.overlap ?? DEFAULT_OVERLAP;
  const ch = layout?.axis.channel ?? plot?.x.channel ?? group?.channels[0] ?? '';

  // The displayed axis follows the Gate view's axis for this channel, so scale edits there carry over.
  const axis: AxisSpec | null = useMemo(() => {
    if (!group) return null;
    if (plot && plot.x.channel === ch) return plot.x;
    if (plot?.y && plot.y.channel === ch) return plot.y;
    return group.axisDefaults[ch] ?? null;
  }, [group, plot, ch]);

  // Ridges of the checked samples, in display order. `allIds` also covers unchecked samples, so a
  // reorder keeps the slots of ridges hidden by the sidebar selection. `groups` are the combined
  // ridges with all their replicates, including those hidden or excluded in the Replicates card.
  const { rows, allIds, groups } = useMemo(() => {
    if (!group) return { rows: [] as RidgeRow[], allIds: [] as string[], groups: [] as RidgeRow[] };
    const all: RidgeRow[] = combine.enabled
      ? comboRows(ws, group.sampleIds, combine.by)
      : group.sampleIds.map((id) => ({
          id,
          label: names[id] ?? ws.samples[id]?.fileName ?? id,
          sampleIds: [id],
        }));
    const allIds = applyOrder(
      all.map((r) => r.id),
      style.order,
    );
    const vis = new Set(shown);
    const inOrder = (rs: RidgeRow[]) => {
      const byId = new Map(rs.map((r) => [r.id, r]));
      return allIds.flatMap((id) => byId.get(id) ?? []);
    };
    if (!combine.enabled) return { rows: inOrder(all.filter((r) => vis.has(r.id))), allIds, groups: [] };
    const groups = inOrder(comboRows(ws, shown, combine.by));
    return { rows: selectRidges(groups, combine.hidden, combine.exclude), allIds, groups };
  }, [group, combine, style.order, shown, names, ws]);

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
            combine: copyCombine(g.ridgeCombine),
          };
          fn(l, w, g);
          g.layouts.push(l);
        },
        merge && `ridge:${group.id}:${popId}:${merge}`,
      );
    },
    [group, popId, ch, mutate],
  );

  return { group, plot, layout, style, combine, follow, overlap, ch, axis, rows, allIds, groups, update };
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

export function TicksEditor({
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
  const { group, layout, style, combine, overlap, rows, allIds, update } = useRidge();
  const ordered = rows.map((r) => r.id);
  const labels = Object.fromEntries(rows.map((r) => [r.id, r.label]));
  const current = new Set(allIds);
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  /** Click selects one row; ⌘/Ctrl toggles; Shift extends from the last clicked row. */
  const select = (id: string, e: MouseEvent) => {
    if (e.shiftKey && anchor.current && ordered.includes(anchor.current)) {
      const a = ordered.indexOf(anchor.current);
      const b = ordered.indexOf(id);
      setSelected(new Set(ordered.slice(Math.min(a, b), Math.max(a, b) + 1)));
      return;
    }
    anchor.current = id;
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      setSelected(next);
    } else setSelected(new Set([id]));
  };
  /** Rows a colour edit or reset applies to: the whole selection if this row is part of it. */
  const targets = (id: string) => (selected.has(id) ? ordered.filter((x) => selected.has(x)) : [id]);

  /** Move `ids` next to `target`; hidden samples keep their slots. */
  const moveTo = (ids: string[], target: string, after: boolean) => {
    const moving = new Set(ids);
    if (moving.has(target)) return;
    const rest = ordered.filter((x) => !moving.has(x));
    const at = rest.indexOf(target) + (after ? 1 : 0);
    const next = [...rest.slice(0, at), ...ordered.filter((x) => moving.has(x)), ...rest.slice(at)];
    const vis = new Set(ordered);
    let k = 0;
    const full = allIds.map((id) => (vis.has(id) ? next[k++]! : id));
    update('Reorder ridges', (l) => {
      l.style.order = [...full, ...l.style.order.filter((id) => !current.has(id))];
    });
  };

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
        <legend>{combine.enabled ? 'Combined ridges' : 'Samples'}</legend>
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
        <ol className="ridge-samples" onDragLeave={() => setDrop(null)}>
          {ordered.map((id, i) => {
            const custom = style.sampleColors[id] !== undefined;
            const isSel = selected.has(id);
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: row selection is a pointer convenience; every control inside stays keyboard-operable
              <li
                key={id}
                className={[
                  isSel ? 'selected' : '',
                  dragIds?.includes(id) ? 'dragging' : '',
                  drop?.id === id ? (drop.after ? 'drop-after' : 'drop-before') : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('input, button')) return;
                  select(id, e);
                }}
                onDragOver={(e) => {
                  if (!dragIds) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > r.top + r.height / 2;
                  if (drop?.id !== id || drop.after !== after) setDrop({ id, after });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIds && drop) moveTo(dragIds, drop.id, drop.after);
                  setDragIds(null);
                  setDrop(null);
                }}
              >
                <span
                  className="ridge-grip"
                  draggable
                  title="Drag to reorder; click to select (⌘/Ctrl-click to add, Shift-click for a range)"
                  aria-label={`Drag ${labels[id] ?? id} to reorder`}
                  onDragStart={(e) => {
                    const ids = isSel ? ordered.filter((x) => selected.has(x)) : [id];
                    if (!isSel) {
                      setSelected(new Set([id]));
                      anchor.current = id;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', ids.join(','));
                    const row = e.currentTarget.parentElement;
                    if (row) e.dataTransfer.setDragImage(row, 8, 8);
                    setDragIds(ids);
                  }}
                  onDragEnd={() => {
                    setDragIds(null);
                    setDrop(null);
                  }}
                >
                  ⠿
                </span>
                <input
                  type="color"
                  className={custom ? 'custom' : ''}
                  value={ridgeColor(style, id, i)}
                  title={
                    isSel && selected.size > 1
                      ? `Set colour of ${selected.size} selected ridges`
                      : custom
                        ? 'Custom colour'
                        : 'Colour from the ridge settings; pick to override'
                  }
                  aria-label={`Colour of ${labels[id] ?? id}`}
                  onChange={(e) => {
                    const ids = targets(id);
                    const v = e.target.value;
                    update(
                      'Ridge colour',
                      (l) => {
                        for (const x of ids) l.style.sampleColors[x] = v;
                      },
                      `color:${ids.join(',')}`,
                    );
                  }}
                />
                <input
                  type="text"
                  value={style.sampleLabels[id] ?? ''}
                  placeholder={labels[id] ?? id}
                  aria-label={`Label of ${labels[id] ?? id}`}
                  onChange={(e) =>
                    update(
                      'Ridge label',
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
                    aria-label={`Reset colour of ${labels[id] ?? id}`}
                    onClick={() => {
                      const ids = targets(id);
                      update('Reset ridge colour', (l) => {
                        for (const x of ids) delete l.style.sampleColors[x];
                      });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {selected.size > 1 && (
          <p className="small muted">{selected.size} selected — a colour change applies to all of them.</p>
        )}
        <div className="ridge-actions">
          <button
            type="button"
            onClick={() =>
              update('Reverse ridge order', (l) => {
                l.style.order = [...allIds].reverse().concat(l.style.order.filter((id) => !current.has(id)));
              })
            }
          >
            Reverse
          </button>
          <button
            type="button"
            disabled={!style.order.some((id) => current.has(id))}
            onClick={() =>
              set(
                'order',
                style.order.filter((id) => !current.has(id)),
                'Reset ridge order',
              )
            }
          >
            Reset order
          </button>
          <button
            type="button"
            disabled={!Object.keys(style.sampleColors).some((id) => current.has(id))}
            onClick={() =>
              set(
                'sampleColors',
                Object.fromEntries(Object.entries(style.sampleColors).filter(([id]) => !current.has(id))),
                'Reset ridge colours',
              )
            }
          >
            Reset colours
          </button>
          <button
            type="button"
            disabled={!Object.keys(style.sampleLabels).some((id) => current.has(id))}
            onClick={() =>
              set(
                'sampleLabels',
                Object.fromEntries(Object.entries(style.sampleLabels).filter(([id]) => !current.has(id))),
                'Reset ridge labels',
              )
            }
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

/** Card below the population tree: combine replicate samples into one ridge per combination of variables. */
export function RidgeCombinePanel() {
  const variables = useStore((s) => s.ws.variables);
  const { group, combine, follow, groups, update } = useRidge();
  const names = useSampleNames(group);
  if (!group) return null;
  const edit = (label: string, fn: (c: RidgeCombine) => void) =>
    update(label, (l, _w, g) => fn(g.ridgeFollow ? g.ridgeCombine : l.combine));
  // Following adopts the current population's settings for all; unfollowing gives each its own copy.
  const setFollow = (on: boolean) =>
    update(
      on ? 'Replicate settings follow the population' : 'Replicate settings per population',
      (l, _w, g) => {
        g.ridgeFollow = on;
        if (on) g.ridgeCombine = copyCombine(l.combine);
        else for (const x of g.layouts) if (x.kind === 'ridge') x.combine = copyCombine(g.ridgeCombine);
      },
    );
  const singles = groups.filter((r) => r.sampleIds.length === 1).length;
  return (
    <section className="ridge-combine" aria-label="Replicates">
      <div className="pane-title">Replicates</div>
      <label
        className="field check"
        title="Keep the same replicate settings when you switch to another population"
      >
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        Same settings for all populations
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={combine.enabled}
          onChange={(e) => edit('Toggle combined replicates', (c) => void (c.enabled = e.target.checked))}
        />
        Combine replicates
      </label>
      {variables.length === 0 ? (
        <p className="muted small">
          Add sample variables (condition, dose…) in the Metadata tab; samples sharing their values are
          combined into one ridge.
        </p>
      ) : (
        <div className="ridge-combine-by">
          <span className="muted small">Samples sharing</span>
          {variables.map((v) => (
            <label key={v.id} className="field check">
              <input
                type="checkbox"
                checked={combine.by.includes(v.id)}
                onChange={(e) =>
                  edit('Change replicate grouping', (c) => {
                    c.by = e.target.checked
                      ? variables.map((x) => x.id).filter((id) => id === v.id || c.by.includes(id))
                      : c.by.filter((x) => x !== v.id);
                    c.enabled = true;
                  })
                }
              />
              {v.name}
            </label>
          ))}
        </div>
      )}
      <label className="field">
        Combine by
        <select
          value={combine.method}
          disabled={!combine.enabled}
          onChange={(e) =>
            edit(
              'Replicate combining method',
              (c) => void (c.method = e.target.value as RidgeCombine['method']),
            )
          }
        >
          <option value="mean">Average of replicate curves</option>
          <option value="pool">Pooled events</option>
        </select>
      </label>
      <p className="muted small">
        {combine.method === 'mean'
          ? 'Each replicate is normalised to unit area and the curves averaged: every replicate weighs the same.'
          : 'All replicates’ events are counted together: replicates with more events weigh more.'}
      </p>
      {combine.method === 'mean' && (
        <label className="field">
          Spread band
          <select
            value={combine.band}
            disabled={!combine.enabled}
            onChange={(e) =>
              edit('Replicate spread band', (c) => void (c.band = e.target.value as RidgeCombine['band']))
            }
          >
            <option value="none">None</option>
            <option value="sd">± SD</option>
            <option value="sem">± SEM</option>
          </select>
        </label>
      )}
      {combine.enabled && (
        <>
          <GroupPicker
            groups={groups.map((r) => ({
              id: r.id,
              label: r.label,
              members: r.sampleIds.map((id) => ({ id, label: names[id] ?? id })),
            }))}
            hidden={new Set(combine.hidden)}
            excluded={new Set(combine.exclude)}
            onShow={(ids, on) =>
              edit(on ? 'Show combined ridge' : 'Hide combined ridge', (c) => {
                c.hidden = toggleIds(c.hidden, ids, !on);
              })
            }
            onInclude={(ids, on) =>
              edit(on ? 'Include replicate' : 'Exclude replicate', (c) => {
                c.exclude = toggleIds(c.exclude, ids, !on);
              })
            }
            onShowAll={() =>
              edit('Show all combined ridges', (c) => {
                const ids = new Set(groups.flatMap((r) => [r.id, ...r.sampleIds]));
                c.hidden = c.hidden.filter((id) => !ids.has(id));
                c.exclude = c.exclude.filter((id) => !ids.has(id));
              })
            }
          />
          {singles > 0 && singles === groups.length && (
            <p className="muted small">No two checked samples share these values, so nothing is combined.</p>
          )}
        </>
      )}
    </section>
  );
}
