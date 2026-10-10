import type { AxisSpec, Group, Transform, Workspace } from '@flowmeris/model';
import { asinhCofactor, asinhDefFromCofactor, makeScale, suggestLogicleW } from '@flowmeris/transforms';
import type { ReactNode } from 'react';
import { getPool } from '../../engine-client/pool.ts';
import {
  SCALE_KINDS,
  type ScaleKind,
  factoryAxis,
  registerTransform,
  scaleKindOf,
  transformOfKind,
} from '../../lib/axisDefaults.ts';
import { contextFor, toast, useGroup, useStore } from '../../state/store.ts';
import { NumInput } from '../ui/NumInput.tsx';
import { ResetIcon } from '../ui/icons.tsx';

/** Edits an axis. `apply` runs `fn` on the axis being edited; `shared` edits also become the group's default for the channel. */
export type ApplyAxis = (
  label: string,
  fn: (a: AxisSpec, w: Workspace, g: Group) => void,
  shared?: boolean,
) => void;

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
            const vals = await getPool().channelValues(
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
      {note && <p className="muted small">{note}</p>}
    </fieldset>
  );
}
