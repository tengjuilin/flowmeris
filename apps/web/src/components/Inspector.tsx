import { ellipseAxes, ellipseFromAxes } from '@flowmeris/gating';
import {
  type AxisSpec,
  type Geometry,
  type Group,
  type PlotSpec,
  type Transform,
  type Workspace,
  effectiveGeometry,
  isOverridden,
  populationsOfGate,
} from '@flowmeris/model';
import { COLORMAPS } from '@flowmeris/render';
import { asinhCofactor, asinhDefFromCofactor, makeScale, suggestLogicleW } from '@flowmeris/transforms';
import { type ReactNode, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { deleteGate, promoteOverride, revertOverride, setGateGeometry } from '../lib/analysis.ts';
import {
  DEFAULT_STYLE,
  SCALE_KINDS,
  type ScaleKind,
  factoryAxis,
  groupSample,
  registerTransform,
  scaleKindOf,
  transformOfKind,
} from '../lib/defaults.ts';
import { DEFAULT_FIGURE } from '../lib/figure.ts';
import { contextFor, toast, useGroup, useStore } from '../state/store.ts';
import { axisChannelSetter, usePlotForPopulation } from './PlotPanel.tsx';

/** Reset: an undo arrow, an open arrowhead on a line that turns back on itself in a half circle. */
export function ResetIcon() {
  return (
    <svg
      className="reset-icon"
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
      <path d="M5.8 3L2.4 6L5.8 9" />
      <path d="M2.8 6H10.5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function NumInput({
  value,
  onCommit,
  step,
  label,
  title,
  live,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  label: string;
  title?: string;
  /** Also commit while typing, so what the input drives updates live. */
  live?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        step={step ?? 'any'}
        value={text ?? String(Number(value.toPrecision(8)))}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (live && e.target.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
        }}
        onBlur={() => {
          if (text !== null) {
            const v = Number(text);
            if (Number.isFinite(v)) onCommit(v);
            setText(null);
          }
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/** Edits an axis. `apply` runs `fn` on the axis being edited; `shared` edits also become the group's default for the channel. */
export type ApplyAxis = (
  label: string,
  fn: (a: AxisSpec, w: Workspace, g: Group) => void,
  shared?: boolean,
) => void;

/** A collapsible group of settings, with its reset button at the top right; shared by the Gate and ridge settings. */
export function Section({
  id,
  title,
  open,
  onToggle,
  changed,
  onReset,
  actions,
  className,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Whether any setting in the section differs from its default; enables the reset button. */
  changed?: boolean;
  /** Leave out to show no reset button. */
  onReset?: () => void;
  /** Buttons at the top right in place of the reset button. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ridge-section${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ridge-section-bar">
        <button
          type="button"
          className="ridge-section-head"
          aria-expanded={open}
          aria-controls={`ridge-section-${id}`}
          onClick={onToggle}
        >
          <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 1.5 9 6l-5.5 4.5z" fill="currentColor" />
          </svg>
          {title}
        </button>
        {onReset && (
          <button
            type="button"
            className="icon reset-btn"
            disabled={!changed}
            title={changed ? `Reset ${title.toLowerCase()} to the defaults` : `${title} are at the defaults`}
            aria-label={`Reset ${title.toLowerCase()}`}
            onClick={onReset}
          >
            <ResetIcon />
          </button>
        )}
        {actions}
      </div>
      {open && (
        <div id={`ridge-section-${id}`} className="ridge-section-body">
          {children}
        </div>
      )}
    </section>
  );
}

export type Panel = { isOpen: (id: string) => boolean; toggle: (id: string) => void };

export function AxisEditor({
  which,
  plot,
  panel,
  children,
  extra,
}: {
  which: 'x' | 'y';
  plot: PlotSpec;
  panel: Panel;
  /** More settings for this axis, after the channel picker. */
  children?: ReactNode;
  /** Whether those settings differ from their defaults, and how to reset them with the axis. */
  extra?: { changed: boolean; reset: () => void };
}) {
  const ws = useStore((s) => s.ws);
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  const apply: ApplyAxis = (label, fn, shared) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const a = g.plots.find((x) => x.id === plot.id)![which]!;
      fn(a, w, g);
      if (shared) g.axisDefaults[a.channel] = { ...a };
    });
  const axis = plot[which] as AxisSpec;
  const factory = factoryAxis(ws, group, axis.channel);
  const sample = groupSample(ws, group);
  const id = `${which}axis`;
  const title = `${which.toUpperCase()} axis`;
  return (
    <Section
      id={id}
      title={title}
      open={panel.isOpen(id)}
      onToggle={() => panel.toggle(id)}
      changed={
        !!extra?.changed ||
        axis.transform !== factory.transform ||
        axis.range[0] !== factory.range[0] ||
        axis.range[1] !== factory.range[1]
      }
      onReset={() => {
        extra?.reset();
        apply(
          `Reset ${title}`,
          (a, w, g) => {
            const f = factoryAxis(w, g, a.channel);
            a.transform = f.transform;
            a.range = [...f.range];
          },
          true,
        );
      }}
    >
      <label className="field">
        Channel
        <select value={axis.channel} onChange={(e) => axisChannelSetter(group, plot)(which, e.target.value)}>
          {group.channels.map((c) => {
            const pns = sample?.channels.find((x) => x.pnn === c)?.pns;
            return (
              <option key={c} value={c}>
                {c}
                {pns ? ` (${pns})` : ''}
              </option>
            );
          })}
        </select>
      </label>
      {children}
      <AxisFields
        hideReset
        axis={axis}
        population={plot.population}
        apply={apply}
        note={<>Existing gates keep the scale they were drawn on.</>}
      />
    </Section>
  );
}

/** Scale and range fields for one axis; shared by the Gate view and the ridge plot, each with its own storage. */
export function AxisFields({
  axis,
  legend,
  population,
  apply,
  note,
  live,
  hideReset,
}: {
  axis: AxisSpec;
  /** Caption above the fields; leave out when the host card already names the axis. */
  legend?: string;
  population: string;
  apply: ApplyAxis;
  note?: ReactNode;
  live?: boolean;
  /** Leave out the legend's reset button when the host provides its own. */
  hideReset?: boolean;
}) {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup()!;
  const def = ws.transforms[axis.transform];
  if (!def) return null;
  const top = 'T' in def ? def.T : 262144;

  const setDef = (t: Transform, keepRange = false) => {
    try {
      makeScale(t);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      return;
    }
    apply(
      'Change axis scale',
      (a, w) => {
        a.transform = registerTransform(w, t);
        if (!keepRange) a.range = [0, 1];
      },
      true,
    );
  };
  const reset = () =>
    apply(
      'Reset axis',
      (a, w, g) => {
        const f = factoryAxis(w, g, a.channel);
        a.transform = f.transform;
        a.range = [...f.range];
      },
      true,
    );
  const factory = factoryAxis(ws, group, axis.channel);
  const atDefault =
    axis.transform === factory.transform &&
    axis.range[0] === factory.range[0] &&
    axis.range[1] === factory.range[1];
  const setKind = (k: ScaleKind) => setDef(transformOfKind(k, top));
  const scale = makeScale(def);
  const setRange = (i: 0 | 1, dataValue: number) => {
    const v = scale.apply(dataValue);
    if (!Number.isFinite(v)) {
      toast('That value is not representable on this scale (e.g. ≤ 0 on a log axis).');
      return;
    }
    apply('Change axis range', (a) => {
      const r = [...a.range] as [number, number];
      r[i] = v;
      if (r[0] < r[1]) a.range = r;
    });
  };

  return (
    <fieldset className="axis-editor">
      {(legend || !hideReset) && (
        <legend className="axis-legend">
          {legend}
          {!hideReset && (
            <button
              type="button"
              className="icon reset-btn"
              disabled={atDefault}
              onClick={reset}
              title="Reset the scale and range to the channel's defaults"
              aria-label="Reset scale and range"
            >
              <ResetIcon />
            </button>
          )}
        </legend>
      )}
      <label className="field">
        Scale
        <select value={scaleKindOf(def)} onChange={(e) => setKind(e.target.value as ScaleKind)}>
          {SCALE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid2">
        {def.kind === 'flin' && (
          <>
            <NumInput
              live={live}
              label="Top T"
              value={def.T}
              onCommit={(T) => setDef({ ...def, T })}
              title="Data value at the top of scale"
            />
            <NumInput
              live={live}
              label="Negative A"
              value={def.A}
              onCommit={(A) => setDef({ ...def, A })}
              title="Data range below zero kept on scale"
            />
          </>
        )}
        {def.kind === 'flog' && (
          <>
            <NumInput live={live} label="Top T" value={def.T} onCommit={(T) => setDef({ ...def, T })} />
            <NumInput live={live} label="Decades M" value={def.M} onCommit={(M) => setDef({ ...def, M })} />
          </>
        )}
        {def.kind === 'logicle' && (
          <>
            <NumInput live={live} label="Top T" value={def.T} onCommit={(T) => setDef({ ...def, T })} />
            <NumInput
              live={live}
              label="Width W"
              value={def.W}
              onCommit={(W) => setDef({ ...def, W })}
              title="Linearisation width in decades"
            />
            <NumInput live={live} label="Decades M" value={def.M} onCommit={(M) => setDef({ ...def, M })} />
            <NumInput
              live={live}
              label="Extra neg. A"
              value={def.A}
              onCommit={(A) => setDef({ ...def, A })}
            />
          </>
        )}
        {def.kind === 'fasinh' && (
          <>
            <NumInput
              live={live}
              label="Cofactor"
              value={asinhCofactor(def)}
              onCommit={(c) => c > 0 && setDef(asinhDefFromCofactor(c, def.T, def.A))}
              title="asinh(x / cofactor); stored as Gating-ML fasinh (T, M, A)"
            />
            <NumInput
              live={live}
              label="Top T"
              value={def.T}
              onCommit={(T) => setDef(asinhDefFromCofactor(asinhCofactor(def), T, def.A))}
            />
          </>
        )}
      </div>
      {def.kind === 'logicle' && (
        <button
          type="button"
          onClick={async () => {
            const sid = ui.sampleId ?? group.sampleIds[0]!;
            const vals = await pool.channelValues(
              contextFor(ws, group),
              sid,
              { channel: axis.channel, comp: axis.comp },
              population,
            );
            const W = Number(suggestLogicleW(vals, def.T, def.M).toFixed(3));
            setDef({ ...def, W, A: Math.min(def.A, def.M - 2 * W) });
            toast(`W set to ${W} from the 5th percentile of negative values (Parks et al. 2006).`);
          }}
        >
          Suggest W from data
        </button>
      )}
      <div className="grid2">
        <NumInput
          live={live}
          label="Min (data)"
          value={scale.inverse(axis.range[0])}
          onCommit={(v) => setRange(0, v)}
        />
        <NumInput
          live={live}
          label="Max (data)"
          value={scale.inverse(axis.range[1])}
          onCommit={(v) => setRange(1, v)}
        />
      </div>
      <p className="muted small">
        Stored as Gating-ML <code>{def.kind}</code>. {note}
      </p>
    </fieldset>
  );
}

export function StyleEditor({ plot, panel }: { plot: PlotSpec; panel: Panel }) {
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  const set = (fn: (st: PlotSpec['style']) => void) =>
    mutate('Change plot style', (w) => {
      const p = w.groups.find((x) => x.id === group.id)!.plots.find((x) => x.id === plot.id)!;
      fn(p.style);
    });
  const st = plot.style;
  const showNote = st.figure?.showOffScaleNote ?? true;
  const changed =
    !showNote ||
    (Object.keys(DEFAULT_STYLE) as (keyof PlotSpec['style'])[]).some(
      (k) => JSON.stringify(st[k]) !== JSON.stringify(DEFAULT_STYLE[k]),
    );
  return (
    <Section
      id="display"
      title="Display"
      open={panel.isOpen('display')}
      onToggle={() => panel.toggle('display')}
      changed={changed}
      onReset={() =>
        set((s) => {
          Object.assign(s, structuredClone(DEFAULT_STYLE));
          if (s.figure) s.figure.showOffScaleNote = true;
        })
      }
    >
      {plot.kind !== 'histogram' && (
        <div className="grid2">
          {plot.kind !== 'dot' && (
            <label className="field">
              Colour map
              <select value={st.colormap} onChange={(e) => set((s) => void (s.colormap = e.target.value))}>
                {COLORMAPS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'classic' ? 'classic (not perceptually uniform)' : c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NumInput
            live
            label="Point size (px)"
            step={0.25}
            value={st.pointPx}
            onCommit={(v) => set((s) => void (s.pointPx = Math.max(0.25, Math.min(10, v))))}
            title="Size of each event's point, 0.25–10 px; fractional sizes are allowed"
          />
          {plot.kind !== 'dot' && (
            <NumInput
              label="Smoothing σ (px)"
              value={st.smoothSigmaBins}
              onCommit={(v) => set((s) => void (s.smoothSigmaBins = Math.max(0, Math.min(20, v))))}
              title="Gaussian kernel σ of the binned density estimate, in display pixels (0 = none)"
            />
          )}
        </div>
      )}
      {plot.kind === 'contour' && (
        <div className="grid2">
          <label className="field">
            Contours
            <select
              value={st.contour.mode === 'equal-prob' ? `p${st.contour.pct}` : 'log'}
              onChange={(e) =>
                set((s) => {
                  const v = e.target.value;
                  s.contour =
                    v === 'log'
                      ? { mode: 'log', levels: 8 }
                      : { mode: 'equal-prob', pct: Number(v.slice(1)) as 2 | 5 | 10 };
                })
              }
            >
              <option value="p2">Equal probability 2%</option>
              <option value="p5">Equal probability 5%</option>
              <option value="p10">Equal probability 10%</option>
              <option value="log">Logarithmic</option>
            </select>
          </label>
          <label className="field check">
            <input
              type="checkbox"
              checked={st.showOutliers}
              onChange={(e) => set((s) => void (s.showOutliers = e.target.checked))}
            />
            Show outliers
          </label>
        </div>
      )}
      {plot.kind === 'histogram' && (
        <div className="grid2">
          <label className="field">
            Bins
            <select
              value={st.histBins}
              onChange={(e) => set((s) => void (s.histBins = Number(e.target.value)))}
            >
              {[64, 128, 256, 512, 1024].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Y axis
            <select
              value={st.histNorm}
              onChange={(e) => set((s) => void (s.histNorm = e.target.value as typeof s.histNorm))}
            >
              <option value="mode">% of max (mode)</option>
              <option value="count">Count</option>
              <option value="area">Fraction (area)</option>
            </select>
          </label>
          <label className="field check">
            <input
              type="checkbox"
              checked={st.histSmooth}
              onChange={(e) => set((s) => void (s.histSmooth = e.target.checked))}
            />
            Smooth (σ = 1.5 bins)
          </label>
        </div>
      )}
      <label
        className="field check"
        title="The count of events outside the axis range, drawn on the plot edges"
      >
        <input
          type="checkbox"
          checked={showNote}
          onChange={(e) =>
            set((s) => {
              s.figure ??= structuredClone(DEFAULT_FIGURE);
              s.figure.showOffScaleNote = e.target.checked;
            })
          }
        />
        Show off-scale note
      </label>
    </Section>
  );
}

/** Trash can: a lid with a handle over a bin with two slats. */
export function DeleteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5" />
    </svg>
  );
}

/** One gate's exact coordinates, editable live, with a delete button at the card's top right. */
export function GateEditor({ gateId, panel }: { gateId: string; panel: Panel }) {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup()!;
  const gate = group.template.gates[gateId];
  if (!gate) return null;
  const sampleId = ui.sampleId ?? group.sampleIds[0]!;
  const geom = effectiveGeometry(group, gate.id, sampleId);
  const ov = isOverridden(group, gate.id, sampleId);
  const nOv = group.overrides.filter((o) => o.gateId === gate.id).length;
  const pops = populationsOfGate(group.template, gate.id);
  const commit = (g: Geometry) =>
    setGateGeometry(group.id, gate.id, g, ui.editScope, sampleId, `gate:${gate.id}:${ui.editScope}`);
  const name = pops.map((p) => p.name).join(', ');
  const units = gate.dims.map((d) =>
    d.transform ? `${ws.transforms[d.transform]?.kind ?? '?'} units` : 'linear units',
  );

  return (
    <Section
      id={`gate-${gate.id}`}
      title={name}
      className={ui.selectedGateId === gate.id ? 'selected' : undefined}
      open={panel.isOpen(`gate-${gate.id}`)}
      onToggle={() => panel.toggle(`gate-${gate.id}`)}
      actions={
        <button
          type="button"
          className="icon reset-btn danger-icon"
          title={`Delete gate ${name}`}
          aria-label={`Delete gate ${name}`}
          onClick={() => {
            deleteGate(group.id, gate.id);
            if (ui.selectedGateId === gate.id) setUi({ selectedGateId: null });
          }}
        >
          <DeleteIcon />
        </button>
      }
    >
      <p className="muted small">
        {geom.kind} on{' '}
        {gate.dims
          .map((d, i) => `${d.channel} (${units[i]}${d.comp === 'group' ? ', compensated' : ''})`)
          .join(' × ')}
      </p>
      {geom.kind === 'rect' && (
        <div className="grid2">
          {gate.dims.map((d, i) => (
            <div key={d.channel} className="grid2 span2">
              <NumInput
                live
                label={`${d.channel} min`}
                value={geom.min[i] ?? Number.NEGATIVE_INFINITY}
                onCommit={(v) => commit({ ...geom, min: geom.min.map((x, k) => (k === i ? v : x)) })}
              />
              <NumInput
                live
                label={`${d.channel} max`}
                value={geom.max[i] ?? Number.POSITIVE_INFINITY}
                onCommit={(v) => commit({ ...geom, max: geom.max.map((x, k) => (k === i ? v : x)) })}
              />
            </div>
          ))}
        </div>
      )}
      {(geom.kind === 'quadrant' || geom.kind === 'spider') && (
        <div className="grid2">
          <NumInput
            live
            label="Centre x"
            value={geom.center[0]}
            onCommit={(v) =>
              commit(
                geom.kind === 'quadrant'
                  ? { ...geom, center: [v, geom.center[1]] }
                  : {
                      ...geom,
                      center: [v, geom.center[1]],
                      arms: geom.arms.map(([a, b]) => [a + v - geom.center[0], b]) as typeof geom.arms,
                    },
              )
            }
          />
          <NumInput
            live
            label="Centre y"
            value={geom.center[1]}
            onCommit={(v) =>
              commit(
                geom.kind === 'quadrant'
                  ? { ...geom, center: [geom.center[0], v] }
                  : {
                      ...geom,
                      center: [geom.center[0], v],
                      arms: geom.arms.map(([a, b]) => [a, b + v - geom.center[1]]) as typeof geom.arms,
                    },
              )
            }
          />
        </div>
      )}
      {geom.kind === 'ellipse' &&
        (() => {
          const e = ellipseAxes(geom.mean, geom.cov, geom.d2);
          const set = (p: Partial<typeof e>) => {
            const n = { ...e, ...p };
            commit({ kind: 'ellipse', ...ellipseFromAxes(n.cx, n.cy, n.a, n.b, n.theta) });
          };
          return (
            <div className="grid2">
              <NumInput live label="Centre x" value={e.cx} onCommit={(cx) => set({ cx })} />
              <NumInput live label="Centre y" value={e.cy} onCommit={(cy) => set({ cy })} />
              <NumInput live label="Semi-axis a" value={e.a} onCommit={(a) => a > 0 && set({ a })} />
              <NumInput live label="Semi-axis b" value={e.b} onCommit={(b) => b > 0 && set({ b })} />
              <NumInput
                live
                label="Angle (°)"
                value={(e.theta * 180) / Math.PI}
                onCommit={(d) => set({ theta: (d * Math.PI) / 180 })}
              />
            </div>
          );
        })()}
      {geom.kind === 'polygon' && (
        <p className="muted small">
          {geom.vertices.length} vertices. Drag vertices; click an edge midpoint to add one.
        </p>
      )}
      <div className="row">
        {ov ? (
          <>
            <span className="badge warn">Overridden for this sample</span>
            <button type="button" onClick={() => revertOverride(group.id, gate.id, sampleId)}>
              Revert to template
            </button>
            <button type="button" onClick={() => promoteOverride(group.id, gate.id, sampleId)}>
              Make this the template
            </button>
          </>
        ) : (
          <span className="muted small">
            Template gate{nOv > 0 ? ` · overridden in ${nOv} sample(s)` : ''}
          </span>
        )}
      </div>
    </Section>
  );
}
