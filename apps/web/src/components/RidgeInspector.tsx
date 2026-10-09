import {
  type AxisSpec,
  type Group,
  type RidgeCombine,
  RidgeCombineSchema,
  type RidgeLayout,
  type RidgeStyle,
  type TextStyle,
  type Workspace,
  newId,
} from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import {
  type CSSProperties,
  type ComponentProps,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defaultChannels, factoryAxis } from '../lib/axisDefaults.ts';
import { FONT_GROUPS, FONT_STACKS, fontStack } from '../lib/figure.ts';
import { sameJson } from '../lib/json.ts';
import { type RidgeRow, applyOrder, comboRows, selectRidges } from '../lib/ridgeRows.ts';
import {
  DEFAULT_OVERLAP,
  DEFAULT_RIDGE_STYLE,
  allRidgesAtDefaults,
  applyRidgeToChannels,
  applyRidgeToPopulations,
  carryRidge,
  isDefaultRidge,
  resetAllRidges,
  resetRidgeChannel,
  resetRidgeCurrent,
  resetRidgeLayout,
  ridgeAtDefaults,
  ridgeChannelAtDefaults,
  ridgeChannelsMatch,
  ridgePopulationsMatch,
  setRidgeChannelStyles,
  withRidgeChannel,
} from '../lib/ridgeStyle.ts';
import { usePanelState } from '../state/prefs.ts';
import { useGroup, useSampleNames, useSelectedSampleIds, useStore } from '../state/store.ts';
import { GroupPicker, toggleIds } from './GroupPicker.tsx';
import { ActionRow, ApplyIcon, AxisFields, NumInput, ResetIcon, Section } from './Inspector.tsx';

/** A number input that updates the plot as you type. */
const LiveNum = (p: ComponentProps<typeof NumInput>) => <NumInput live {...p} />;

export { DEFAULT_OVERLAP, DEFAULT_RIDGE_STYLE };
export const DEFAULT_RIDGE_COMBINE: RidgeCombine = RidgeCombineSchema.parse({});
/** A copy of `c` that is safe to take of an Immer draft (`structuredClone` cannot clone one). */
const copyCombine = (c: RidgeCombine): RidgeCombine => ({
  ...c,
  by: [...c.by],
  hidden: [...c.hidden],
  exclude: [...c.exclude],
});

export { FONT_GROUPS, FONT_STACKS, fontStack };

/** SVG text styling for `t`, falling back to the figure's font family. */
export function textCss(t: TextStyle, base: RidgeStyle['fontFamily'], baseColor: string): CSSProperties {
  return {
    fontFamily: fontStack(t.fontFamily ?? base),
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    textDecoration: t.underline ? 'underline' : 'none',
    fill: t.color ?? baseColor,
  };
}

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
  const names = useSampleNames(group);
  const shown = useSelectedSampleIds(group);
  const layout = group?.layouts.find((l): l is RidgeLayout => l.kind === 'ridge' && l.population === popId);
  const style: RidgeStyle = layout?.style ?? DEFAULT_RIDGE_STYLE;
  // While following, the group's shared replicate settings apply to every population.
  const follow = group?.ridgeFollow ?? true;
  const combine =
    (follow ? group?.ridgeCombine : layout?.combine) ?? group?.ridgeCombine ?? DEFAULT_RIDGE_COMBINE;
  const ws = useStore((s) => s.ws);
  const overlap = layout?.overlap ?? DEFAULT_OVERLAP;
  const ch = layout?.axis.channel ?? (group ? defaultChannels(ws, group)[0] : '');

  // The ridge plot owns its axis (channel, scale and range): it is seeded from the channel's
  // built-in default when the layout is created and never follows the Gate view afterwards.
  const axis: AxisSpec | null = layout?.axis ?? null;

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
            axis: factoryAxis(w, g, ch),
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

  return {
    group,
    layout,
    style,
    combine,
    follow,
    overlap,
    ch,
    axis,
    rows,
    allIds,
    groups,
    update,
  };
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

const CUSTOM_FONT = '__custom';

/** A font picker: the app's font list, or the name of any font installed on this computer. */
export function FontSelect({
  label,
  value,
  onChange,
  inherit,
  bare,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  /** Offer "same as the figure" (value undefined), naming the figure's font. */
  inherit?: string;
  /** No visible caption: `label` becomes the select's accessible name. */
  bare?: boolean;
}) {
  const custom = value !== undefined && !(value in FONT_STACKS);
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null) {
      const t = text.trim();
      if (t) onChange(t);
      setText(null);
    }
  };
  return (
    <>
      <label className={bare ? 'tt-font' : 'field'}>
        {!bare && label}
        <select
          aria-label={bare ? label : undefined}
          value={custom ? CUSTOM_FONT : (value ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : v === CUSTOM_FONT ? 'Helvetica Neue' : v);
          }}
        >
          {inherit !== undefined && (
            <option value="">{bare ? inherit : `Same as figure (${inherit})`}</option>
          )}
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_FONT}>Other installed font…</option>
        </select>
      </label>
      {custom && (
        <label
          className={bare ? 'field tt-wide' : 'field'}
          title="Used if the font is installed on the computer that views or exports the figure"
        >
          Font name
          <input
            type="text"
            value={text ?? value}
            placeholder="e.g. Futura"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      )}
    </>
  );
}

const ALIGNS: { id: RidgeStyle['labelAlign']; name: string; lines: number[] }[] = [
  { id: 'start', name: 'Align left', lines: [0, 0, 0, 0] },
  { id: 'middle', name: 'Center', lines: [2, 0, 2, 0] },
  { id: 'end', name: 'Align right', lines: [4, 0, 4, 0] },
];

/** Four text lines, long and short alternating, aligned left, centred or right. */
function AlignIcon({ lines }: { lines: number[] }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      {lines.map((x, i) => (
        <rect key={i} x={x} y={i * 3} width={i % 2 ? 14 : 10} height="1.5" fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * A word-processor style toolbar for one kind of text: font and size on one row, then
 * bold / italic / underline, color and (for ridge labels) alignment on the next.
 */
export function TextStyleEditor({
  label,
  value,
  base,
  baseColor,
  onChange,
  size,
  onSize,
  align,
  onAlign,
}: {
  label: string;
  value: TextStyle;
  base: string;
  baseColor: string;
  onChange: (t: TextStyle) => void;
  size: number;
  onSize: (v: number) => void;
  align?: RidgeStyle['labelAlign'];
  onAlign?: (a: RidgeStyle['labelAlign']) => void;
}) {
  const [sizeText, setSizeText] = useState<string | null>(null);
  const toggle = (k: 'bold' | 'italic' | 'underline', glyph: string, name: string, css: CSSProperties) => (
    <button
      type="button"
      className={value[k] ? 'on' : ''}
      aria-pressed={value[k]}
      title={name}
      aria-label={`${name} ${label.toLowerCase()}`}
      style={css}
      onClick={() => onChange({ ...value, [k]: !value[k] })}
    >
      {glyph}
    </button>
  );
  const ink = value.color ?? baseColor;
  return (
    <div className="text-toolbar">
      <div className="tt-row">
        <FontSelect
          bare
          label={`${label} font`}
          value={value.fontFamily}
          inherit={FONT_GROUPS.flatMap((g) => g.fonts).find((f) => f.id === base)?.label ?? base}
          onChange={(fontFamily) => onChange({ ...value, fontFamily })}
        />
        <input
          type="number"
          className="tt-size"
          step={0.5}
          title="Font size (px)"
          aria-label={`${label} size (px)`}
          value={sizeText ?? String(size)}
          onChange={(e) => {
            setSizeText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onSize(clamp(v, 4, 48));
          }}
          onBlur={() => setSizeText(null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          type="button"
          className="tt-btn"
          title="Larger"
          aria-label={`Larger ${label.toLowerCase()}`}
          onClick={() => onSize(clamp(Math.floor(size) + 1, 4, 48))}
        >
          A<sup>+</sup>
        </button>
        <button
          type="button"
          className="tt-btn small-a"
          title="Smaller"
          aria-label={`Smaller ${label.toLowerCase()}`}
          onClick={() => onSize(clamp(Math.ceil(size) - 1, 4, 48))}
        >
          A<sup>−</sup>
        </button>
      </div>
      <div className="tt-row">
        <div className="seg">
          {toggle('bold', 'B', 'Bold', { fontWeight: 700 })}
          {toggle('italic', 'I', 'Italic', { fontStyle: 'italic', fontFamily: 'Georgia, serif' })}
          {toggle('underline', 'U', 'Underline', { textDecoration: 'underline' })}
        </div>
        <span className="tt-sep" aria-hidden="true" />
        <label className="tt-btn tt-color" title="Text color">
          <span style={{ color: ink }}>A</span>
          <span className="tt-bar" style={{ background: ink }} />
          <input
            type="color"
            aria-label={`${label} color`}
            value={ink}
            onChange={(e) => onChange({ ...value, color: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="reset-btn"
          title="Reset color to the base font color"
          aria-label={`Reset ${label.toLowerCase()} color`}
          disabled={!value.color}
          onClick={() => onChange({ ...value, color: undefined })}
        >
          <ResetIcon />
        </button>
        {align && onAlign && (
          <>
            <span className="tt-sep" aria-hidden="true" />
            <div className="seg">
              {ALIGNS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={align === x.id ? 'on' : ''}
                  aria-pressed={align === x.id}
                  title={x.name}
                  aria-label={x.name}
                  onClick={() => onAlign(x.id)}
                >
                  <AlignIcon lines={x.lines} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type RidgeTab = 'sample' | 'axis' | 'text' | 'figure' | 'settings';
type SectionId =
  | 'apply'
  | 'resetAll'
  | 'ridgeStyle'
  | 'scale'
  | 'ticks'
  | 'title'
  | 'labels'
  | 'labelText'
  | 'tickText'
  | 'titleText'
  | 'layout'
  | 'histogram'
  | 'baseFont';

const RIDGE_TABS: { id: RidgeTab; label: string }[] = [
  { id: 'figure', label: 'Figure' },
  { id: 'sample', label: 'Sample' },
  { id: 'axis', label: 'Axis' },
  { id: 'text', label: 'Text' },
  { id: 'settings', label: 'Settings' },
];

/** The first section of each tab, and the Settings tab's cards, start open (the Sample tab has no sections). */
const DEFAULT_OPEN: Partial<Record<SectionId, boolean>> = {
  apply: true,
  resetAll: true,
  ridgeStyle: true,
  scale: true,
  labels: true,
  labelText: true,
};

/** The style keys of each card, for the card's reset and its tab's "Reset this panel". */
const STYLE_KEYS: (keyof RidgeStyle)[] = ['colorMode', 'color', 'fillOpacity', 'strokeColor', 'strokeWidth'];
const LABEL_KEYS: (keyof RidgeStyle)[] = [
  'showLabels',
  'showCounts',
  'countOnNewLine',
  'labelWidth',
  'labelOverflow',
];
const LAYOUT_KEYS: (keyof RidgeStyle)[] = ['rowHeight', 'width', 'aspect'];
const HIST_KEYS: (keyof RidgeStyle)[] = ['bins', 'smoothing'];
const FONT_KEYS: (keyof RidgeStyle)[] = [
  'fontFamily',
  'fontColor',
  'fontSize',
  'labelFontSize',
  'tickFontSize',
  'titleFontSize',
];
const TICK_KEYS: (keyof RidgeStyle)[] = ['axisColor', 'baselineColor', 'showTickLabels', 'ticks'];
const TITLE_KEYS: (keyof RidgeStyle)[] = ['axisTitle'];
const LABEL_TEXT_KEYS: (keyof RidgeStyle)[] = ['labelText', 'labelFontSize', 'labelAlign'];
const TICK_TEXT_KEYS: (keyof RidgeStyle)[] = ['tickText', 'tickFontSize'];
const TITLE_TEXT_KEYS: (keyof RidgeStyle)[] = ['titleText', 'titleFontSize'];
/** The style keys each tab's "Reset this panel" resets (the Axis tab also resets the scale, the Sample tab its rows). */
const PANEL_KEYS: Record<'figure' | 'axis' | 'text', (keyof RidgeStyle)[]> = {
  figure: [...STYLE_KEYS, ...LABEL_KEYS, ...LAYOUT_KEYS, ...HIST_KEYS, ...FONT_KEYS],
  axis: [...TICK_KEYS, ...TITLE_KEYS],
  text: [...LABEL_TEXT_KEYS, ...TICK_TEXT_KEYS, ...TITLE_TEXT_KEYS],
};
/** The Sample tab's per-row settings. */
const ROW_KEYS = ['order', 'sampleColors', 'sampleLabels'] as const;

/** Reverse: two arrows pointing opposite ways, up and down. */
function ReverseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13V3M2.5 5.5L5 3l2.5 2.5" />
      <path d="M11 3v10M8.5 10.5L11 13l2.5-2.5" />
    </svg>
  );
}

/** A slider for a 0–`max` fraction, with a percentage box beside it for typing an exact value. */
function PercentSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="field slider-field">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="unit-input">
        <input
          type="number"
          min={0}
          max={Math.round(max * 100)}
          step={5}
          aria-label={`${label} (%)`}
          value={text ?? String(Math.round(value * 100))}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(clamp(v / 100, 0, max));
          }}
          onBlur={() => setText(null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        %
      </span>
    </div>
  );
}

const PANEL_KEY = 'flowmeris.ridgePanel';

export function RidgeInspector() {
  const popId = useStore((s) => s.ui.popId);
  const { group, layout, style, combine, overlap, axis, rows, allIds, update } = useRidge();
  const mutate = useStore((s) => s.mutate);
  const ordered = rows.map((r) => r.id);
  const labels = Object.fromEntries(rows.map((r) => [r.id, r.label]));
  const current = new Set(allIds);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  // The last tab and open sections, remembered in this browser.
  const { tab, open, setTab, toggle } = usePanelState<RidgeTab, SectionId>(
    PANEL_KEY,
    RIDGE_TABS.map((t) => t.id),
    { tab: 'figure', open: DEFAULT_OPEN },
    { apply: true, resetAll: true },
  );
  // While settings are carried across populations, the population opened next takes the ridge settings
  // of the one left (keeping its own ticks and axis title).
  const last = useRef<{ groupId: string; popId: string; layoutId: string } | null>(null);
  useEffect(() => {
    if (!group || !layout) return;
    const prev = last.current;
    last.current = { groupId: group.id, popId, layoutId: layout.id };
    if (!prev || prev.groupId !== group.id || prev.popId === popId || !group.ridgeStyleFollow) return;
    const from = group.layouts.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === prev.layoutId);
    if (!from || !carryRidge(structuredClone(from), structuredClone(layout))) return;
    mutate('Carry ridge settings to population', (w) => {
      const ls = w.groups.find((x) => x.id === group.id)?.layouts;
      const src = ls?.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === prev.layoutId);
      const dst = ls?.find((l): l is RidgeLayout => l.kind === 'ridge' && l.id === layout.id);
      if (src && dst) carryRidge(src, dst);
    });
  }, [group?.id, popId, layout?.id]);
  if (!group) return null;
  const set = <K extends keyof RidgeStyle>(key: K, value: RidgeStyle[K], label: string, merge?: string) =>
    update(
      label,
      (l) => {
        if (value === undefined) delete l.style[key];
        else l.style[key] = value;
      },
      merge ?? `style:${key}`,
    );

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
  /** Rows a color edit or reset applies to: the whole selection if this row is part of it. */
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

  /** Reset props for a section whose settings are the style `keys` (and the overlap, if `withOverlap`). */
  const resetOf = (keys: (keyof RidgeStyle)[], title: string, withOverlap = false) => ({
    changed:
      keys.some((k) => !sameJson(style[k], DEFAULT_RIDGE_STYLE[k])) ||
      (withOverlap && overlap !== DEFAULT_OVERLAP),
    onReset: () =>
      update(`Reset ${title}`, (l) => {
        for (const k of keys) {
          const d = DEFAULT_RIDGE_STYLE[k];
          if (d === undefined) delete l.style[k];
          else (l.style as Record<string, unknown>)[k] = structuredClone(d);
        }
        if (withOverlap) l.overlap = DEFAULT_OVERLAP;
      }),
  });
  const ws = useStore((s) => s.ws);
  const factory = axis && group ? factoryAxis(ws, group, axis.channel) : null;
  const axisReset = {
    changed:
      !!axis &&
      !!factory &&
      (axis.transform !== factory.transform ||
        axis.range[0] !== factory.range[0] ||
        axis.range[1] !== factory.range[1]),
    onReset: () =>
      update('Reset axis', (l, w, g) => {
        const f = factoryAxis(w, g, l.axis.channel);
        l.axis.transform = f.transform;
        l.axis.range = [...f.range];
      }),
  };

  /** Edit this population's ridge plot, if it has one. */
  const editLayout = (label: string, fn: (l: RidgeLayout, g: Group) => void) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id);
      const l = g?.layouts.find((x): x is RidgeLayout => x.kind === 'ridge' && x.id === layout?.id);
      if (g && l) fn(l, g);
    });
  // "Reset this panel": the open tab's settings for this ridge plot.
  const rowsAtDefaults = ROW_KEYS.every((k) =>
    k === 'order'
      ? !style.order.some((id) => current.has(id))
      : !Object.keys(style[k]).some((id) => current.has(id)),
  );
  const panelAtDefaults =
    !layout ||
    tab === 'settings' ||
    (tab === 'sample'
      ? rowsAtDefaults
      : !resetOf(PANEL_KEYS[tab], tab, tab === 'figure').changed && (tab !== 'axis' || !axisReset.changed));
  const resetPanel = () =>
    update(`Reset ridge ${tab} settings`, (l, w, g) => {
      if (tab === 'settings') return;
      if (tab === 'sample') {
        l.style.order = l.style.order.filter((id) => !current.has(id));
        for (const k of ['sampleColors', 'sampleLabels'] as const)
          l.style[k] = Object.fromEntries(Object.entries(l.style[k]).filter(([id]) => !current.has(id)));
        return;
      }
      for (const k of PANEL_KEYS[tab]) {
        const d = DEFAULT_RIDGE_STYLE[k];
        if (d === undefined) delete l.style[k];
        else (l.style as Record<string, unknown>)[k] = structuredClone(d);
      }
      if (tab === 'figure') l.overlap = DEFAULT_OVERLAP;
      if (tab === 'axis') {
        const f = factoryAxis(w, g, l.axis.channel);
        l.axis.transform = f.transform;
        l.axis.range = [...f.range];
      }
    });

  return (
    <aside className="inspector ridge-inspector" aria-label="Ridge plot settings">
      <div className="ridge-inspector-head">
        <div className="tabs ridge-tabs" role="tablist" aria-label="Ridge plot settings">
          {RIDGE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`ridge-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="ridge-tabpanel"
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
            title="Reset the settings in this panel for this ridge plot"
            aria-label="Reset the settings in this panel"
            disabled={panelAtDefaults}
            onClick={resetPanel}
          >
            <ResetIcon />
          </button>
        </div>
      </div>
      <div id="ridge-tabpanel" role="tabpanel" aria-labelledby={`ridge-tab-${tab}`}>
        {tab === 'settings' && (
          <>
            <Section id="apply" title="Apply settings" open={!!open.apply} onToggle={() => toggle('apply')}>
              <ActionRow
                label="Apply same settings for all populations"
                title="Give every population's ridge plot this ridge plot's settings now (each keeps its ticks and axis title)"
                icon={<ApplyIcon />}
                disabled={!layout || ridgePopulationsMatch(group, layout.id)}
                onClick={() =>
                  editLayout('Apply ridge settings to all populations', (l, g) =>
                    applyRidgeToPopulations(g, l.id),
                  )
                }
              />
              <ActionRow
                label="Apply same settings for all plots"
                title="Give every axis channel of this population these settings now"
                icon={<ApplyIcon />}
                disabled={!layout || ridgeChannelsMatch(layout)}
                onClick={() =>
                  editLayout('Apply ridge settings to all plots', (l) => applyRidgeToChannels(l))
                }
              />
              <label
                className="field check"
                title="On: the population you open next takes the settings of the one you leave (each keeps its ticks and axis title). Nothing changes when you tick it."
              >
                <input
                  type="checkbox"
                  checked={group.ridgeStyleFollow}
                  onChange={(e) => {
                    const on = e.target.checked;
                    mutate(
                      on ? 'Carry ridge settings to populations' : 'Ridge settings per population',
                      (w) => {
                        const g = w.groups.find((x) => x.id === group.id);
                        if (g) g.ridgeStyleFollow = on;
                      },
                    );
                  }}
                />
                Carry settings to next populations
              </label>
              <label
                className="field check"
                title="On: the axis channel you switch to next takes the settings in use. Off: each channel keeps its own. Nothing changes when you tick it."
              >
                <input
                  type="checkbox"
                  checked={layout?.styleFollow !== false}
                  disabled={!layout}
                  onChange={(e) => {
                    const on = e.target.checked;
                    editLayout(on ? 'Carry ridge settings to plots' : 'Ridge settings per channel', (l) =>
                      setRidgeChannelStyles(l, !on),
                    );
                  }}
                />
                Carry settings to next plots
              </label>
            </Section>
            <Section
              id="resetAll"
              title="Reset settings"
              open={!!open.resetAll}
              onToggle={() => toggle('resetAll')}
            >
              <ActionRow
                label="All settings in this plot"
                title="Reset the settings of this ridge plot (this population, this axis channel)"
                icon={<ResetIcon />}
                disabled={!layout || isDefaultRidge({ style, overlap })}
                onClick={() =>
                  editLayout('Reset the settings of this ridge plot', (l) => resetRidgeCurrent(l))
                }
              />
              <ActionRow
                label="All plots of this population"
                title="Reset the settings of every axis channel of this population"
                icon={<ResetIcon />}
                disabled={!layout || ridgeAtDefaults(layout)}
                onClick={() =>
                  editLayout('Reset the ridge settings of every channel of this population', (l) =>
                    resetRidgeLayout(l),
                  )
                }
              />
              <ActionRow
                label="All populations in this plot"
                title="Reset the settings of this axis channel in every population"
                icon={<ResetIcon />}
                disabled={!layout || ridgeChannelAtDefaults(group, layout.axis.channel)}
                onClick={() =>
                  editLayout('Reset the ridge settings of this channel in every population', (l, g) =>
                    resetRidgeChannel(g, l.axis.channel),
                  )
                }
              />
              <ActionRow
                label="All plots in all populations"
                title="Reset the settings of every ridge plot in every population"
                icon={<ResetIcon />}
                disabled={allRidgesAtDefaults(group)}
                onClick={() =>
                  mutate('Reset every ridge plot', (w) => {
                    const g = w.groups.find((x) => x.id === group.id);
                    if (g) resetAllRidges(g);
                  })
                }
              />
            </Section>
          </>
        )}
        {tab === 'sample' && (
          <>
            <div className="ridge-actions">
              <button
                type="button"
                onClick={() =>
                  update('Reverse ridge order', (l) => {
                    l.style.order = [...allIds]
                      .reverse()
                      .concat(l.style.order.filter((id) => !current.has(id)));
                  })
                }
              >
                <ReverseIcon />
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
                <ResetIcon />
                Order
              </button>
              <button
                type="button"
                disabled={!Object.keys(style.sampleColors).some((id) => current.has(id))}
                onClick={() =>
                  set(
                    'sampleColors',
                    Object.fromEntries(Object.entries(style.sampleColors).filter(([id]) => !current.has(id))),
                    'Reset ridge colors',
                  )
                }
              >
                <ResetIcon />
                Colors
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
                <ResetIcon />
                Labels
              </button>
            </div>
            {selected.size > 1 && (
              <p className="small muted">{selected.size} selected — a color change applies to all of them.</p>
            )}
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
                          ? `Set color of ${selected.size} selected ridges`
                          : custom
                            ? 'Custom color'
                            : 'Color from the ridge settings; pick to override'
                      }
                      aria-label={`Color of ${labels[id] ?? id}`}
                      onChange={(e) => {
                        const ids = targets(id);
                        const v = e.target.value;
                        update(
                          'Ridge color',
                          (l) => {
                            for (const x of ids) l.style.sampleColors[x] = v;
                          },
                          `color:${ids.join(',')}`,
                        );
                      }}
                    />
                    <button
                      type="button"
                      className="reset-btn"
                      disabled={!custom}
                      title="Reset color to the ridge settings"
                      aria-label={`Reset color of ${labels[id] ?? id}`}
                      onClick={() => {
                        const ids = targets(id);
                        update('Reset ridge color', (l) => {
                          for (const x of ids) delete l.style.sampleColors[x];
                        });
                      }}
                    >
                      <ResetIcon />
                    </button>
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
                    <button
                      type="button"
                      className="reset-btn"
                      disabled={style.sampleLabels[id] === undefined}
                      title="Reset label to the sample name"
                      aria-label={`Reset label of ${labels[id] ?? id}`}
                      onClick={() => {
                        const ids = targets(id);
                        update('Reset ridge label', (l) => {
                          for (const x of ids) delete l.style.sampleLabels[x];
                        });
                      }}
                    >
                      <ResetIcon />
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {tab === 'axis' && (
          <>
            <Section
              id="scale"
              {...axisReset}
              title="Scale and range"
              open={!!open.scale}
              onToggle={() => toggle('scale')}
            >
              {axis && group && (
                <label className="field">
                  Channel
                  <select
                    value={axis.channel}
                    onChange={(e) => {
                      const c = e.target.value;
                      update('Ridge channel', (l, w, g) => {
                        withRidgeChannel(l, () => {
                          l.axis = factoryAxis(w, g, c);
                        });
                      });
                    }}
                  >
                    {group.channels.map((c) => {
                      const pns = ws.samples[group.sampleIds[0] ?? '']?.channels.find(
                        (x) => x.pnn === c,
                      )?.pns;
                      return (
                        <option key={c} value={c}>
                          {c}
                          {pns ? ` (${pns})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
              {axis && group && (
                <AxisFields
                  live
                  hideReset
                  axis={axis}
                  population={popId}
                  note="Applies to this ridge plot only."
                  apply={(label, fn) => update(label, (l, w, g) => fn(l.axis, w, g), `axis:${label}`)}
                />
              )}
            </Section>
            <Section
              id="ticks"
              {...resetOf(TICK_KEYS, 'ticks')}
              title="Ticks"
              open={!!open.ticks}
              onToggle={() => toggle('ticks')}
            >
              <div className="field">
                Axis color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Axis color"
                    value={style.axisColor ?? '#9a9994'}
                    onChange={(e) => set('axisColor', e.target.value, 'Ridge axis color', 'axisColor')}
                  />
                  <button
                    type="button"
                    className="icon reset-btn"
                    disabled={style.axisColor === undefined}
                    title="Reset the axis color"
                    aria-label="Reset axis color"
                    onClick={() => set('axisColor', undefined, 'Ridge axis color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </div>
              <div className="field">
                Baseline color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Baseline color"
                    value={style.baselineColor ?? '#d8d7d1'}
                    onChange={(e) =>
                      set('baselineColor', e.target.value, 'Ridge baseline color', 'baselineColor')
                    }
                  />
                  <button
                    type="button"
                    className="icon reset-btn"
                    disabled={style.baselineColor === undefined}
                    title="Reset the baseline color"
                    aria-label="Reset baseline color"
                    onClick={() => set('baselineColor', undefined, 'Ridge baseline color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </div>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={style.showTickLabels}
                  onChange={(e) => set('showTickLabels', e.target.checked, 'Ridge tick labels')}
                />
                Show tick labels
              </label>
              <TicksEditor ticks={style.ticks} onCommit={(t) => set('ticks', t, 'Ridge ticks')} />
            </Section>
            <Section
              id="title"
              {...resetOf(TITLE_KEYS, 'title')}
              title="Title"
              open={!!open.title}
              onToggle={() => toggle('title')}
            >
              <label className="field" title="Leave empty for the default; type a space for no title">
                Axis title
                <input
                  type="text"
                  value={style.axisTitle ?? ''}
                  placeholder="Marker :: channel"
                  onChange={(e) => set('axisTitle', e.target.value || undefined, 'Ridge axis title', 'title')}
                />
              </label>
            </Section>
          </>
        )}
        {tab === 'text' && (
          <>
            <Section
              id="labelText"
              {...resetOf(LABEL_TEXT_KEYS, 'ridge label text')}
              title="Ridge labels"
              open={!!open.labelText}
              onToggle={() => toggle('labelText')}
            >
              <TextStyleEditor
                label="Ridge labels"
                value={style.labelText}
                base={style.fontFamily}
                baseColor={style.fontColor}
                onChange={(t) => set('labelText', t, 'Ridge label text')}
                size={style.labelFontSize}
                onSize={(v) => set('labelFontSize', v, 'Ridge label size')}
                align={style.labelAlign}
                onAlign={(a) => set('labelAlign', a, 'Ridge label alignment')}
              />
            </Section>
            <Section
              id="tickText"
              {...resetOf(TICK_TEXT_KEYS, 'tick label text')}
              title="Tick labels"
              open={!!open.tickText}
              onToggle={() => toggle('tickText')}
            >
              <TextStyleEditor
                label="Tick labels"
                value={style.tickText}
                base={style.fontFamily}
                baseColor={style.fontColor}
                onChange={(t) => set('tickText', t, 'Ridge tick text')}
                size={style.tickFontSize}
                onSize={(v) => set('tickFontSize', v, 'Ridge tick label size')}
              />
            </Section>
            <Section
              id="titleText"
              {...resetOf(TITLE_TEXT_KEYS, 'axis title text')}
              title="Axis title"
              open={!!open.titleText}
              onToggle={() => toggle('titleText')}
            >
              <TextStyleEditor
                label="Axis title"
                value={style.titleText}
                base={style.fontFamily}
                baseColor={style.fontColor}
                onChange={(t) => set('titleText', t, 'Ridge title text')}
                size={style.titleFontSize}
                onSize={(v) => set('titleFontSize', v, 'Ridge title size')}
              />
            </Section>
          </>
        )}
        {tab === 'figure' && (
          <>
            <Section
              id="ridgeStyle"
              {...resetOf(STYLE_KEYS, 'ridge style')}
              title="Ridge style"
              open={!!open.ridgeStyle}
              onToggle={() => toggle('ridgeStyle')}
            >
              <label className="field">
                Color
                <select
                  value={style.colorMode}
                  onChange={(e) =>
                    set('colorMode', e.target.value as RidgeStyle['colorMode'], 'Ridge color mode')
                  }
                >
                  <option value="single">Single color</option>
                  <option value="palette">Categorical palette</option>
                </select>
              </label>
              {style.colorMode === 'single' && (
                <label className="field inline">
                  Fill color
                  <span className="swatch-auto">
                    <input
                      type="color"
                      className="swatch"
                      value={style.color}
                      onChange={(e) => set('color', e.target.value, 'Ridge color', 'color')}
                    />
                    <button
                      type="button"
                      className="reset-btn"
                      disabled={style.color === DEFAULT_RIDGE_STYLE.color}
                      aria-label="Reset fill color to the default"
                      title={
                        style.color === DEFAULT_RIDGE_STYLE.color
                          ? 'Fill color is the default'
                          : 'Reset fill color to the default'
                      }
                      onClick={() => set('color', DEFAULT_RIDGE_STYLE.color, 'Ridge color', 'color')}
                    >
                      <ResetIcon />
                    </button>
                  </span>
                </label>
              )}
              <PercentSlider
                label="Fill opacity"
                value={style.fillOpacity}
                max={1}
                onChange={(v) => set('fillOpacity', v, 'Ridge opacity', 'opacity')}
              />
              <div className="field">
                Outline color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Outline color"
                    title={
                      style.strokeColor === undefined ? 'Matches the background; pick to override' : undefined
                    }
                    value={style.strokeColor ?? '#ffffff'}
                    onChange={(e) => set('strokeColor', e.target.value, 'Ridge outline color', 'stroke')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={style.strokeColor === undefined}
                    aria-label="Reset outline color to match the background"
                    title={
                      style.strokeColor === undefined
                        ? 'Outline already matches the background'
                        : 'Reset outline to match the background'
                    }
                    onClick={() => set('strokeColor', undefined, 'Ridge outline color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </div>
              <div className="grid2">
                <LiveNum
                  label="Outline width"
                  step={0.25}
                  value={style.strokeWidth}
                  onCommit={(v) => set('strokeWidth', clamp(v, 0, 10), 'Ridge outline width')}
                />
              </div>
            </Section>
            <Section
              id="labels"
              {...resetOf(LABEL_KEYS, 'ridge labels')}
              title="Ridge labels"
              open={!!open.labels}
              onToggle={() => toggle('labels')}
            >
              <label className="field check">
                <input
                  type="checkbox"
                  checked={style.showLabels}
                  onChange={(e) => set('showLabels', e.target.checked, 'Ridge labels')}
                />
                Show labels
              </label>
              <label className="field check sub-option">
                <input
                  type="checkbox"
                  checked={style.showCounts}
                  disabled={!style.showLabels}
                  onChange={(e) => set('showCounts', e.target.checked, 'Ridge event counts')}
                />
                Show event counts (n)
              </label>
              <label className="field check sub-option sub-option-2">
                <input
                  type="checkbox"
                  checked={style.countOnNewLine}
                  disabled={!style.showLabels || !style.showCounts}
                  onChange={(e) => set('countOnNewLine', e.target.checked, 'Ridge count on new line')}
                />
                Event count on its own line
              </label>
              <div className="grid2">
                <LiveNum
                  label="Label width (px)"
                  step={10}
                  title={
                    style.labelOverflow === 'widen' ? 'Set automatically to fit the longest label' : undefined
                  }
                  value={style.labelWidth}
                  onCommit={(v) => set('labelWidth', clamp(v, 0, 1000), 'Ridge label width')}
                />
              </div>
              <label className="field" title="What to do with a label wider than the label column">
                Long labels
                <select
                  value={style.labelOverflow}
                  onChange={(e) =>
                    set('labelOverflow', e.target.value as RidgeStyle['labelOverflow'], 'Ridge long labels')
                  }
                >
                  <option value="wrap">Wrap onto more lines</option>
                  <option value="widen">Widen the label column</option>
                </select>
              </label>
            </Section>
            <Section
              id="layout"
              {...resetOf(LAYOUT_KEYS, 'layout', true)}
              title="Layout"
              open={!!open.layout}
              onToggle={() => toggle('layout')}
            >
              <PercentSlider
                label="Overlap"
                value={overlap}
                max={0.9}
                onChange={(v) =>
                  update(
                    'Ridge overlap',
                    (l) => {
                      l.overlap = v;
                    },
                    'overlap',
                  )
                }
              />
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
                  <div className="sub-option">
                    <LiveNum
                      label="Row height (px)"
                      step={1}
                      value={style.rowHeight}
                      onCommit={(v) => set('rowHeight', clamp(v, 8, 400), 'Ridge row height')}
                    />
                  </div>
                )}
              </div>
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
                  <div className="sub-option">
                    <LiveNum
                      label="Width (px)"
                      step={10}
                      value={style.width}
                      onCommit={(v) => set('width', clamp(v, 300, 10000), 'Ridge plot width')}
                    />
                  </div>
                )}
              </div>
              <div className="grid2">
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={style.aspect === undefined}
                    onChange={(e) => set('aspect', e.target.checked ? undefined : 1.5, 'Ridge aspect ratio')}
                  />
                  Free aspect ratio
                </label>
                {style.aspect !== undefined && (
                  <div className="sub-option">
                    <LiveNum
                      label="Width ÷ height"
                      step={0.1}
                      title="Fixes the figure's shape; row height is derived to fit"
                      value={style.aspect}
                      onCommit={(v) => set('aspect', clamp(v, 0.2, 10), 'Ridge aspect ratio')}
                    />
                  </div>
                )}
              </div>
            </Section>
            <Section
              id="histogram"
              {...resetOf(HIST_KEYS, 'histogram')}
              title="Histogram"
              open={!!open.histogram}
              onToggle={() => toggle('histogram')}
            >
              <div className="grid2">
                <LiveNum
                  label="Bins"
                  step={16}
                  title="Histogram bins across the x range"
                  value={style.bins}
                  onCommit={(v) => set('bins', clamp(Math.round(v), 16, 1024), 'Ridge bins')}
                />
                <LiveNum
                  label="Smoothing σ (bins)"
                  step={0.5}
                  title="Gaussian smoothing of each curve; 0 for none"
                  value={style.smoothing}
                  onCommit={(v) => set('smoothing', clamp(v, 0, 20), 'Ridge smoothing')}
                />
              </div>
            </Section>
            <Section
              id="baseFont"
              {...resetOf(FONT_KEYS, 'base font')}
              title="Base font"
              open={!!open.baseFont}
              onToggle={() => toggle('baseFont')}
            >
              <FontSelect
                label="Base font"
                value={style.fontFamily}
                onChange={(v) => set('fontFamily', v ?? 'arial', 'Ridge font')}
              />
              <label className="field inline">
                Base font color
                <span className="swatch-auto">
                  <input
                    type="color"
                    className="swatch"
                    value={style.fontColor}
                    onChange={(e) => set('fontColor', e.target.value, 'Ridge font color', 'fontColor')}
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={style.fontColor === DEFAULT_RIDGE_STYLE.fontColor}
                    aria-label="Reset base font color to black"
                    title={
                      style.fontColor === DEFAULT_RIDGE_STYLE.fontColor
                        ? 'Base font color is the default'
                        : 'Reset base font color to black'
                    }
                    onClick={() => set('fontColor', DEFAULT_RIDGE_STYLE.fontColor, 'Ridge font color')}
                  >
                    <ResetIcon />
                  </button>
                </span>
              </label>
              <LiveNum
                label="Base font size (px)"
                step={0.5}
                title="Scales the label, tick and title sizes together"
                value={style.fontSize}
                onCommit={(v) => {
                  const next = clamp(v, 4, 48);
                  if (next === style.fontSize) return;
                  const k = next / style.fontSize;
                  const scaled = (x: number) => clamp(Math.round(x * k * 2) / 2, 4, 48);
                  update(
                    'Ridge base font size',
                    (l) => {
                      l.style.fontSize = next;
                      l.style.labelFontSize = scaled(l.style.labelFontSize);
                      l.style.tickFontSize = scaled(l.style.tickFontSize);
                      l.style.titleFontSize = scaled(l.style.titleFontSize);
                    },
                    'style:fontSize',
                  );
                }}
              />
            </Section>
          </>
        )}
      </div>
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
        <div className="ridge-combine-by sub-option">
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
      <label className="field sub-option">
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
      <p className="muted small sub-option">
        {combine.method === 'mean'
          ? 'Each replicate is normalised to unit area and the curves averaged: every replicate weighs the same.'
          : 'All replicates’ events are counted together: replicates with more events weigh more.'}
      </p>
      {combine.method === 'mean' && (
        <label className="field sub-option">
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
