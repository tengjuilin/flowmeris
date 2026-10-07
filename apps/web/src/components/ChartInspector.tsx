import { type ChartStyle, ChartStyleSchema, type StatPlot } from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import type { Cell, PlotSeries } from '@flowmeris/table';
import { useState } from 'react';
import { pointKey } from '../lib/chartSelection.ts';
import { GroupPicker, toggleIds } from './GroupPicker.tsx';
import { NumInput } from './Inspector.tsx';
import { TicksEditor } from './RidgeInspector.tsx';

export const DEFAULT_CHART_STYLE: ChartStyle = ChartStyleSchema.parse({});

/** Key of a series in `ChartStyle` maps: the JSON of its value. */
export const seriesKey = (k: Cell) => JSON.stringify(k ?? null);

export function seriesColor(style: ChartStyle, key: string, index: number): string {
  return (
    style.seriesColors[key] ??
    (style.colorMode === 'palette' ? CATEGORICAL[index % CATEGORICAL.length]! : style.color)
  );
}

/** Series in display order: those in `order` first, the rest in category order. */
export function orderSeries(series: PlotSeries[], order: string[]): PlotSeries[] {
  if (!order.length) return series;
  const rank = new Map(order.map((k, i) => [k, i]));
  return series
    .map((s, i) => ({ s, r: rank.get(seriesKey(s.key)) ?? order.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A number that may be left empty (= automatic). */
function OptNumInput({
  label,
  value,
  onCommit,
  title,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  title?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        step="any"
        placeholder="Auto"
        disabled={disabled}
        value={text ?? (value === undefined ? '' : String(Number(value.toPrecision(8))))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const v = text.trim() === '' ? undefined : Number(text);
          if (v === undefined || Number.isFinite(v)) onCommit(v);
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/** A 0–1 opacity slider shown as a percentage. */
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      {label} · {Math.round(value * 100)}%
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function AxisFields(props: {
  which: 'x' | 'y';
  plot: StatPlot;
  defaultTitle: string;
  numeric: boolean;
  log: boolean;
  set: <K extends keyof ChartStyle>(key: K, value: ChartStyle[K], label: string, merge?: string) => void;
  edit: (label: string, fn: (p: StatPlot) => void, merge?: string) => void;
}) {
  const { which, plot, set } = props;
  const st = plot.style;
  const X = which.toUpperCase();
  const minKey = which === 'x' ? 'xMin' : 'yMin';
  const maxKey = which === 'x' ? 'xMax' : 'yMax';
  const lo = st[minKey];
  const hi = st[maxKey];
  const bad =
    (lo !== undefined && hi !== undefined && !(hi > lo)) ||
    (props.log && ((lo !== undefined && lo <= 0) || (hi !== undefined && hi <= 0)));
  return (
    <fieldset>
      <legend>{X} axis</legend>
      <label className="field" title="Leave empty for the column name; type a space for no title">
        Title
        <input
          type="text"
          value={(which === 'x' ? plot.xLabel : plot.yLabel) ?? ''}
          placeholder={props.defaultTitle}
          onChange={(e) =>
            props.edit(
              `Change ${which} title`,
              (p) => {
                if (which === 'x') p.xLabel = e.target.value || undefined;
                else p.yLabel = e.target.value || undefined;
              },
              `chart-${which}l:${plot.id}`,
            )
          }
        />
      </label>
      {props.numeric ? (
        <>
          <div className="grid2">
            <OptNumInput
              label="Min"
              value={lo}
              title="Axis start in data units; empty = fit the data"
              onCommit={(v) => set(minKey, v, `Chart ${which} min`)}
            />
            <OptNumInput
              label="Max"
              value={hi}
              title="Axis end in data units; empty = fit the data"
              onCommit={(v) => set(maxKey, v, `Chart ${which} max`)}
            />
          </div>
          {bad && (
            <p className="field-error small">
              {props.log ? 'A log axis needs 0 < min < max; ' : 'Min must be below max; '}the range is fitted
              to the data instead.
            </p>
          )}
          <TicksEditor
            ticks={which === 'x' ? st.xTicks : st.yTicks}
            onCommit={(t) => set(which === 'x' ? 'xTicks' : 'yTicks', t, `Chart ${which} ticks`)}
          />
        </>
      ) : (
        <p className="small muted">Categories, in the variable's level order.</p>
      )}
    </fieldset>
  );
}

export function ChartInspector(props: {
  plot: StatPlot;
  /** All series with all their points and rows, in display order (hidden points included). */
  series: PlotSeries[];
  /** Sample name of each row id. */
  rowNames: Record<string, string>;
  seriesLabel: string | undefined;
  xTitle: string;
  yTitle: string;
  /** Whether x is placed as categories. */
  band: boolean;
  edit: (label: string, fn: (p: StatPlot) => void, merge?: string) => void;
}) {
  const { plot, series, edit } = props;
  const st = plot.style;
  const set = <K extends keyof ChartStyle>(key: K, value: ChartStyle[K], label: string, merge?: string) =>
    edit(
      label,
      (p) => {
        if (value === undefined) delete p.style[key];
        else p.style[key] = value;
      },
      merge && `chart:${plot.id}:${merge}`,
    );
  const keys = series.map((s) => seriesKey(s.key));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null);

  const moveTo = (key: string, target: string, after: boolean) => {
    if (key === target) return;
    const rest = keys.filter((k) => k !== key);
    const at = rest.indexOf(target) + (after ? 1 : 0);
    set('seriesOrder', [...rest.slice(0, at), key, ...rest.slice(at)], 'Reorder chart series');
  };

  const bar = plot.kind === 'bar';
  const multi = series.length > 1;

  return (
    <aside className="inspector chart-inspector" aria-label="Chart settings">
      <fieldset>
        <legend>{props.seriesLabel ? `Series · ${props.seriesLabel}` : 'Colour'}</legend>
        <label className="field">
          Colour
          <select
            value={st.colorMode}
            onChange={(e) => set('colorMode', e.target.value as ChartStyle['colorMode'], 'Chart colour mode')}
          >
            <option value="palette">Categorical palette</option>
            <option value="single">Single colour</option>
          </select>
        </label>
        {st.colorMode === 'single' && (
          <label className="field">
            Fill colour
            <input
              type="color"
              value={st.color}
              onChange={(e) => set('color', e.target.value, 'Chart colour', 'color')}
            />
          </label>
        )}
        {props.seriesLabel ? (
          <>
            <ol className="ridge-samples" onDragLeave={() => setDrop(null)}>
              {series.map((s, i) => {
                const k = keys[i]!;
                const custom = st.seriesColors[k] !== undefined;
                const name = s.key === undefined || s.key === null ? '(none)' : String(s.key);
                return (
                  <li
                    key={k}
                    className={[
                      dragKey === k ? 'dragging' : '',
                      drop?.key === k ? (drop.after ? 'drop-after' : 'drop-before') : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onDragOver={(e) => {
                      if (!dragKey) return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > r.top + r.height / 2;
                      if (drop?.key !== k || drop.after !== after) setDrop({ key: k, after });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKey && drop) moveTo(dragKey, drop.key, drop.after);
                      setDragKey(null);
                      setDrop(null);
                    }}
                  >
                    <span
                      className="ridge-grip"
                      draggable
                      title="Drag to reorder"
                      aria-label={`Drag ${name} to reorder`}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', k);
                        const row = e.currentTarget.parentElement;
                        if (row) e.dataTransfer.setDragImage(row, 8, 8);
                        setDragKey(k);
                      }}
                      onDragEnd={() => {
                        setDragKey(null);
                        setDrop(null);
                      }}
                    >
                      ⠿
                    </span>
                    <input
                      type="color"
                      className={custom ? 'custom' : ''}
                      value={seriesColor(st, k, i)}
                      title={custom ? 'Custom colour' : 'Colour from the setting above; pick to override'}
                      aria-label={`Colour of ${name}`}
                      onChange={(e) => {
                        const v = e.target.value;
                        edit(
                          'Chart series colour',
                          (p) => {
                            p.style.seriesColors[k] = v;
                          },
                          `chart:${plot.id}:color:${k}`,
                        );
                      }}
                    />
                    <input
                      type="text"
                      value={st.seriesLabels[k] ?? ''}
                      placeholder={name}
                      aria-label={`Legend label of ${name}`}
                      onChange={(e) =>
                        edit(
                          'Chart series label',
                          (p) => {
                            if (e.target.value) p.style.seriesLabels[k] = e.target.value;
                            else delete p.style.seriesLabels[k];
                          },
                          `chart:${plot.id}:label:${k}`,
                        )
                      }
                    />
                    {custom && (
                      <button
                        type="button"
                        className="icon"
                        title="Reset colour"
                        aria-label={`Reset colour of ${name}`}
                        onClick={() =>
                          edit('Reset chart series colour', (p) => {
                            delete p.style.seriesColors[k];
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
                onClick={() => set('seriesOrder', [...keys].reverse(), 'Reverse chart series')}
              >
                Reverse
              </button>
              <button
                type="button"
                disabled={!st.seriesOrder.length}
                onClick={() => set('seriesOrder', [], 'Reset chart series order')}
              >
                Reset order
              </button>
              <button
                type="button"
                disabled={!Object.keys(st.seriesColors).length}
                onClick={() => set('seriesColors', {}, 'Reset chart series colours')}
              >
                Reset colours
              </button>
              <button
                type="button"
                disabled={!Object.keys(st.seriesLabels).length}
                onClick={() => set('seriesLabels', {}, 'Reset chart series labels')}
              >
                Reset labels
              </button>
            </div>
          </>
        ) : (
          <p className="small muted">Choose “Colour by” in the toolbar to colour by a variable.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Groups</legend>
        <p className="small muted">
          Click a group to hide it; open it with ▸ to leave single replicates out of its mean and error bar.
          Shift-click selects a range.
        </p>
        <GroupPicker
          groups={series.flatMap((s, i) => {
            const k = keys[i]!;
            const name =
              st.seriesLabels[k] ?? (s.key === undefined || s.key === null ? '(none)' : String(s.key));
            return s.points.map((p) => ({
              id: pointKey(s.key, p.x),
              label: props.seriesLabel ? `${name} · ${String(p.x)}` : String(p.x),
              members: p.rowIds.map((id) => ({ id, label: props.rowNames[id] ?? id })),
            }));
          })}
          hidden={new Set(plot.hiddenPoints)}
          excluded={new Set(plot.excludeRows)}
          onShow={(ids, on) =>
            edit(on ? 'Show chart group' : 'Hide chart group', (p) => {
              p.hiddenPoints = toggleIds(p.hiddenPoints, ids, !on);
            })
          }
          onInclude={(ids, on) =>
            edit(on ? 'Include replicate' : 'Exclude replicate', (p) => {
              p.excludeRows = toggleIds(p.excludeRows, ids, !on);
            })
          }
          onShowAll={() =>
            edit('Show all chart groups', (p) => {
              p.hiddenPoints = [];
              p.excludeRows = [];
            })
          }
        />
      </fieldset>

      <fieldset>
        <legend>Marks</legend>
        <Slider
          label={bar ? 'Bar opacity' : 'Marker opacity'}
          value={st.fillOpacity}
          onChange={(v) => set('fillOpacity', v, 'Chart opacity', 'opacity')}
        />
        <div className="grid2">
          {!bar && (
            <NumInput
              label="Marker size (px)"
              step={0.5}
              value={st.markerSize}
              onCommit={(v) => set('markerSize', clamp(v, 0, 30), 'Chart marker size')}
            />
          )}
          {plot.kind === 'line' && (
            <NumInput
              label="Line width (px)"
              step={0.25}
              value={st.lineWidth}
              onCommit={(v) => set('lineWidth', clamp(v, 0, 20), 'Chart line width')}
            />
          )}
        </div>
        {props.band && (
          <div className="grid2">
            <label className="field check">
              <input
                type="checkbox"
                checked={st.barWidth === undefined}
                onChange={(e) => set('barWidth', e.target.checked ? undefined : 0.8, 'Chart bar width')}
              />
              Auto {bar ? 'bar' : 'group'} width
            </label>
            {st.barWidth !== undefined && (
              <NumInput
                label="Width (% of category)"
                step={5}
                value={Math.round(st.barWidth * 100)}
                onCommit={(v) => set('barWidth', clamp(v / 100, 0.05, 1), 'Chart bar width')}
              />
            )}
          </div>
        )}
        <div className="grid2">
          <NumInput
            label="Error bar width (px)"
            step={0.25}
            value={st.errorWidth}
            onCommit={(v) => set('errorWidth', clamp(v, 0, 10), 'Chart error bar width')}
          />
          <OptNumInput
            label="Cap width (px)"
            value={st.capWidth}
            onCommit={(v) => set('capWidth', v === undefined ? v : clamp(v, 0, 60), 'Chart cap width')}
          />
        </div>
        <div className="grid2">
          <NumInput
            label="Replicate size (px)"
            step={0.5}
            value={st.pointSize}
            onCommit={(v) => set('pointSize', clamp(v, 0, 20), 'Chart replicate size')}
          />
          <label className="field check">
            <input
              type="checkbox"
              checked={st.pointOpacity === undefined}
              onChange={(e) =>
                set(
                  'pointOpacity',
                  e.target.checked ? undefined : bar ? 0.85 : 0.55,
                  'Chart replicate opacity',
                )
              }
            />
            Auto replicate opacity
          </label>
        </div>
        {st.pointOpacity !== undefined && (
          <Slider
            label="Replicate opacity"
            value={st.pointOpacity}
            onChange={(v) => set('pointOpacity', v, 'Chart replicate opacity', 'point-opacity')}
          />
        )}
      </fieldset>

      <AxisFields
        which="x"
        plot={plot}
        defaultTitle={props.xTitle}
        numeric={!props.band}
        log={!props.band && plot.xScale === 'log10'}
        set={set}
        edit={edit}
      />
      <AxisFields
        which="y"
        plot={plot}
        defaultTitle={props.yTitle}
        numeric
        log={plot.yScale === 'log10'}
        set={set}
        edit={edit}
      />

      <fieldset>
        <legend>Text &amp; legend</legend>
        <label className="field">
          Font
          <select
            value={st.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value as ChartStyle['fontFamily'], 'Chart font')}
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={st.showTickLabels}
            onChange={(e) => set('showTickLabels', e.target.checked, 'Chart tick labels')}
          />
          Show tick labels
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={st.showGrid}
            onChange={(e) => set('showGrid', e.target.checked, 'Chart gridlines')}
          />
          Show gridlines
        </label>
        <div className="grid2">
          <NumInput
            label="Tick label size (px)"
            step={0.5}
            value={st.tickFontSize}
            onCommit={(v) => set('tickFontSize', clamp(v, 4, 48), 'Chart tick label size')}
          />
          <NumInput
            label="Title size (px)"
            step={0.5}
            value={st.titleFontSize}
            onCommit={(v) => set('titleFontSize', clamp(v, 4, 48), 'Chart title size')}
          />
        </div>
        <div className="grid2">
          <label className="field" title={multi ? undefined : 'Shown when there are two or more series'}>
            Legend
            <select
              value={st.legend}
              onChange={(e) => set('legend', e.target.value as ChartStyle['legend'], 'Chart legend')}
            >
              <option value="top">Top</option>
              <option value="right">Right</option>
              <option value="none">Hidden</option>
            </select>
          </label>
          <NumInput
            label="Legend size (px)"
            step={0.5}
            value={st.legendFontSize}
            onCommit={(v) => set('legendFontSize', clamp(v, 4, 48), 'Chart legend size')}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Figure</legend>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={st.width === undefined}
              onChange={(e) => set('width', e.target.checked ? undefined : 760, 'Chart width')}
            />
            Fit width
          </label>
          {st.width !== undefined && (
            <NumInput
              label="Width (px)"
              step={10}
              value={st.width}
              onCommit={(v) => set('width', clamp(v, 240, 10000), 'Chart width')}
            />
          )}
        </div>
        <NumInput
          label="Height (px)"
          step={10}
          value={st.height}
          onCommit={(v) => set('height', clamp(v, 160, 10000), 'Chart height')}
        />
        <button
          type="button"
          onClick={() =>
            edit('Reset chart settings', (p) => {
              p.style = structuredClone(DEFAULT_CHART_STYLE);
              p.xLabel = undefined;
              p.yLabel = undefined;
            })
          }
        >
          Reset all settings
        </button>
      </fieldset>
    </aside>
  );
}
