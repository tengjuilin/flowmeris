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
  registerTransform,
  scaleKindOf,
  transformOfKind,
} from '../lib/defaults.ts';
import { contextFor, toast, useGroup, useStore } from '../state/store.ts';
import { usePlotForPopulation } from './PlotPanel.tsx';

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

function AxisEditor({ which, plot }: { which: 'x' | 'y'; plot: PlotSpec }) {
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  const apply: ApplyAxis = (label, fn, shared) =>
    mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      const a = g.plots.find((x) => x.id === plot.id)![which]!;
      fn(a, w, g);
      if (shared) g.axisDefaults[a.channel] = { ...a };
    });
  return (
    <AxisFields
      axis={plot[which] as AxisSpec}
      legend={`${which.toUpperCase()} axis · ${plot[which]!.channel}`}
      population={plot.population}
      apply={apply}
      note={<>Existing gates keep the scale they were drawn on.</>}
    />
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
}: {
  axis: AxisSpec;
  legend: string;
  population: string;
  apply: ApplyAxis;
  note?: ReactNode;
  live?: boolean;
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
      <legend>{legend}</legend>
      <div className="row">
        <button type="button" onClick={reset} title="Return the scale and range to the channel's defaults">
          Reset to auto
        </button>
      </div>
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

function StyleEditor({ plot }: { plot: PlotSpec }) {
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  const set = (fn: (st: PlotSpec['style']) => void) =>
    mutate('Change plot style', (w) => {
      const p = w.groups.find((x) => x.id === group.id)!.plots.find((x) => x.id === plot.id)!;
      fn(p.style);
    });
  const st = plot.style;
  return (
    <fieldset>
      <legend>Display</legend>
      <div className="row">
        <button
          type="button"
          onClick={() => set((s) => Object.assign(s, structuredClone(DEFAULT_STYLE)))}
          title="Return the display options to their defaults"
        >
          Reset to default
        </button>
      </div>
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
          <label className="field">
            Point size
            <select
              value={st.pointPx}
              onChange={(e) => set((s) => void (s.pointPx = Number(e.target.value)))}
            >
              {[1, 2, 3, 4].map((v) => (
                <option key={v} value={v}>
                  {v} px
                </option>
              ))}
            </select>
          </label>
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
    </fieldset>
  );
}

function GateEditor() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup()!;
  const gate = ui.selectedGateId ? group.template.gates[ui.selectedGateId] : undefined;
  if (!gate)
    return <p className="muted small">Select a gate on the plot to see and edit its exact coordinates.</p>;
  const sampleId = ui.sampleId ?? group.sampleIds[0]!;
  const geom = effectiveGeometry(group, gate.id, sampleId);
  const ov = isOverridden(group, gate.id, sampleId);
  const nOv = group.overrides.filter((o) => o.gateId === gate.id).length;
  const pops = populationsOfGate(group.template, gate.id);
  const commit = (g: Geometry) => setGateGeometry(group.id, gate.id, g, ui.editScope, sampleId);
  const units = gate.dims.map((d) =>
    d.transform ? `${ws.transforms[d.transform]?.kind ?? '?'} units` : 'linear units',
  );

  return (
    <fieldset>
      <legend>Gate · {pops.map((p) => p.name).join(', ')}</legend>
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
                label={`${d.channel} min`}
                value={geom.min[i] ?? Number.NEGATIVE_INFINITY}
                onCommit={(v) => commit({ ...geom, min: geom.min.map((x, k) => (k === i ? v : x)) })}
              />
              <NumInput
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
              <NumInput label="Centre x" value={e.cx} onCommit={(cx) => set({ cx })} />
              <NumInput label="Centre y" value={e.cy} onCommit={(cy) => set({ cy })} />
              <NumInput label="Semi-axis a" value={e.a} onCommit={(a) => a > 0 && set({ a })} />
              <NumInput label="Semi-axis b" value={e.b} onCommit={(b) => b > 0 && set({ b })} />
              <NumInput
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
      <div className="row">
        <button
          type="button"
          className="danger"
          onClick={() => {
            deleteGate(group.id, gate.id);
            setUi({ selectedGateId: null });
          }}
        >
          Delete gate
        </button>
      </div>
    </fieldset>
  );
}

export function Inspector() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  if (!group || !plot) return <aside className="inspector" />;
  return (
    <aside className="inspector" aria-label="Inspector">
      <GateEditor />
      <AxisEditor which="x" plot={plot} />
      {plot.kind !== 'histogram' && plot.y && <AxisEditor which="y" plot={plot} />}
      <StyleEditor plot={plot} />
    </aside>
  );
}
