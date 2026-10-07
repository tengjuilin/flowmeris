import type { Group, Variable } from '@flowmeris/model';
import { ALL_WELLS, PLATE_COLS, PLATE_ROWS, wellIndex, wellName } from '@flowmeris/table';
import { useEffect, useMemo, useState } from 'react';
import { coerce, distinctValues, inkOn, setValue, valueColors } from '../lib/metadata.ts';
import { toast, useSampleNames, useStore } from '../state/store.ts';

function fmtValue(x: unknown): string {
  if (typeof x !== 'number') return x === undefined ? '' : String(x);
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(2) : String(Number(x.toPrecision(4)));
}

/** Wells of the rectangle spanned by two wells. */
function rect(a: string, b: string): string[] {
  const [r0, c0] = wellIndex(a);
  const [r1, c1] = wellIndex(b);
  const out: string[] = [];
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) out.push(wellName(r, c));
  return out;
}

/**
 * 96-well plate map: select wells (click, drag, shift/⌘-click, row and column
 * headers), then set a variable's value for the samples in them, or fill a
 * numeric series (e.g. a 2-fold dilution across columns).
 */
export function PlateMap({ group, variable }: { group: Group; variable: Variable | undefined }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ anchor: string; base: Set<string> } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [drag]);

  const byWell = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const id of group.sampleIds) {
      const w = ws.samples[id]?.well;
      if (!w) continue;
      const list = m.get(w);
      if (list) list.push(id);
      else m.set(w, [id]);
    }
    return m;
  }, [group.sampleIds, ws.samples]);
  const unplaced = group.sampleIds.filter((id) => !ws.samples[id]?.well);

  const values = useMemo(
    () => (variable ? distinctValues(ws, variable, group.sampleIds) : []),
    [ws, variable, group.sampleIds],
  );
  const colors = useMemo(() => (variable ? valueColors(variable, values) : undefined), [variable, values]);
  const selectedSamples = [...sel].flatMap((w) => byWell.get(w) ?? []);

  const pick = (wells: string[], e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    const next = new Set(add ? sel : []);
    const allOn = add && wells.every((w) => sel.has(w));
    for (const w of wells) allOn ? next.delete(w) : next.add(w);
    setSel(next);
  };

  const apply = (value: number | string | null, label: string) => {
    if (!variable) return;
    if (selectedSamples.length === 0) {
      toast('Select wells that contain samples first.');
      return;
    }
    mutate(label, (w) => {
      for (const id of selectedSamples) setValue(w, id, variable.id, value);
    });
  };

  return (
    <div className="plate-layout">
      <div className="plate-wrap">
        <div
          className="plate"
          style={{ gridTemplateColumns: `28px repeat(${PLATE_COLS}, minmax(34px, 1fr))` }}
        >
          <button
            type="button"
            className="plate-head corner"
            title="Select all wells"
            onClick={(e) => pick(ALL_WELLS, e)}
          >
            ◢
          </button>
          {Array.from({ length: PLATE_COLS }, (_, c) => (
            <button
              type="button"
              key={c}
              className="plate-head"
              title={`Select column ${c + 1}`}
              onClick={(e) =>
                pick(
                  PLATE_ROWS.split('').map((_, r) => wellName(r, c)),
                  e,
                )
              }
            >
              {c + 1}
            </button>
          ))}
          {PLATE_ROWS.split('').map((L, r) => (
            <div key={L} className="plate-row">
              <button
                type="button"
                className="plate-head"
                title={`Select row ${L}`}
                onClick={(e) =>
                  pick(
                    Array.from({ length: PLATE_COLS }, (_, c) => wellName(r, c)),
                    e,
                  )
                }
              >
                {L}
              </button>
              {Array.from({ length: PLATE_COLS }, (_, c) => {
                const w = wellName(r, c);
                const ids = byWell.get(w) ?? [];
                const v = variable && ids.length ? ws.samples[ids[0]!]?.meta[variable.id] : undefined;
                const mixed =
                  variable && ids.some((id) => ws.samples[id]?.meta[variable.id] !== v) ? ' (differs)' : '';
                const bg = colors?.color(v);
                return (
                  <button
                    type="button"
                    key={w}
                    aria-pressed={sel.has(w)}
                    className={`well${ids.length ? '' : ' empty'}${sel.has(w) ? ' on' : ''}`}
                    style={bg ? { background: bg, color: inkOn(bg) } : undefined}
                    title={`${w}${ids.length ? `\n${ids.map((id) => names[id] ?? ws.samples[id]?.fileName).join('\n')}` : '\n(no sample)'}${variable ? `\n${variable.name}: ${fmtValue(v)}${mixed}` : ''}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const add = e.shiftKey || e.metaKey || e.ctrlKey;
                      const base = new Set(add ? sel : []);
                      setDrag({ anchor: w, base });
                      setSel(new Set([...base, w]));
                    }}
                    onPointerEnter={() => {
                      if (drag) setSel(new Set([...drag.base, ...rect(drag.anchor, w)]));
                    }}
                  >
                    <span className="well-value">{fmtValue(v)}</span>
                    {ids.length > 1 && <span className="well-count">×{ids.length}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="plate-legend small">
          {colors?.legend.map((l) => (
            <span key={l.label}>
              <span className="swatch" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
          {colors?.scale && (
            <span>
              {fmtValue(colors.scale.min)}
              <span
                className="ramp"
                style={{
                  background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => colors.color(colors.scale!.log ? colors.scale!.min * (colors.scale!.max / colors.scale!.min) ** t : colors.scale!.min + t * (colors.scale!.max - colors.scale!.min))).join(',')})`,
                }}
              />
              {fmtValue(colors.scale.max)}
              {colors.scale.log && <span className="muted"> (log)</span>}
            </span>
          )}
          {unplaced.length > 0 && (
            <span className="muted" title={unplaced.map((id) => names[id]).join('\n')}>
              {unplaced.length} sample(s) without a well — set the Well column in the table view.
            </span>
          )}
        </div>
      </div>
      <PlateActions
        variable={variable}
        nWells={sel.size}
        nSamples={selectedSamples.length}
        levels={values}
        selection={sel}
        byWell={byWell}
        onApply={apply}
        onClearSelection={() => setSel(new Set())}
      />
    </div>
  );
}

function PlateActions(props: {
  variable: Variable | undefined;
  nWells: number;
  nSamples: number;
  levels: unknown[];
  selection: Set<string>;
  byWell: Map<string, string[]>;
  onApply: (value: number | string | null, label: string) => void;
  onClearSelection: () => void;
}) {
  const { variable } = props;
  const mutate = useStore((s) => s.mutate);
  const [raw, setRaw] = useState('');
  const [series, setSeries] = useState({
    start: '100',
    factor: '0.5',
    op: 'mul' as 'mul' | 'add',
    along: 'cols' as 'cols' | 'rows',
    reverse: false,
  });
  if (!variable)
    return (
      <aside className="plate-actions">
        <p className="muted">Add a variable to assign values on the plate.</p>
      </aside>
    );

  const set = () => {
    const v = coerce(variable, raw);
    if (v === undefined) {
      toast(`“${raw}” is not a number.`);
      return;
    }
    props.onApply(v, `Set ${variable.name}`);
  };

  const fillSeries = () => {
    const start = Number(series.start);
    const k = Number(series.factor);
    if (!Number.isFinite(start) || !Number.isFinite(k)) {
      toast('Series start and step must be numbers.');
      return;
    }
    const axis = series.along === 'cols' ? 1 : 0;
    const steps = [...new Set([...props.selection].map((w) => wellIndex(w)[axis]))].sort((a, b) => a - b);
    if (series.reverse) steps.reverse();
    const valueAt = (i: number) => (series.op === 'mul' ? start * k ** i : start + k * i);
    mutate(`Fill ${variable.name} series`, (ws) => {
      for (const w of props.selection) {
        const i = steps.indexOf(wellIndex(w)[axis]);
        for (const id of props.byWell.get(w) ?? []) {
          const s = ws.samples[id];
          if (s) s.meta[variable.id] = Number(valueAt(i).toPrecision(12));
        }
      }
    });
  };

  return (
    <aside className="plate-actions">
      <p className="small">
        <strong>{props.nWells}</strong> well(s) selected, <strong>{props.nSamples}</strong> sample(s).{' '}
        {props.nWells > 0 && (
          <button type="button" className="link" onClick={props.onClearSelection}>
            clear selection
          </button>
        )}
        <br />
        <span className="muted">
          Drag to select a block; shift/⌘-click to add; click row or column labels.
        </span>
      </p>
      <fieldset>
        <legend>Set {variable.name}</legend>
        <div className="row">
          <input
            type="text"
            list="plate-levels"
            value={raw}
            placeholder={variable.type === 'numeric' ? 'number' : 'value'}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && set()}
            aria-label={`Value of ${variable.name}`}
          />
          <datalist id="plate-levels">
            {props.levels.map((l) => (
              <option key={String(l)} value={String(l)} />
            ))}
          </datalist>
          <button type="button" className="primary" onClick={set} disabled={raw.trim() === ''}>
            Set
          </button>
          <button type="button" onClick={() => props.onApply(null, `Clear ${variable.name}`)}>
            Clear
          </button>
        </div>
        {variable.type === 'categorical' && props.levels.length > 0 && (
          <div className="row wrap">
            {props.levels.map((l) => (
              <button
                key={String(l)}
                type="button"
                className="chip"
                onClick={() => props.onApply(String(l), `Set ${variable.name}`)}
              >
                {String(l)}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      {variable.type === 'numeric' && (
        <fieldset>
          <legend>Fill series</legend>
          <div className="grid2">
            <label className="field">
              Start
              <input
                type="text"
                value={series.start}
                onChange={(e) => setSeries({ ...series, start: e.target.value })}
              />
            </label>
            <label className="field">
              <select
                value={series.op}
                onChange={(e) => setSeries({ ...series, op: e.target.value as 'mul' | 'add' })}
                aria-label="Series kind"
              >
                <option value="mul">× factor</option>
                <option value="add">+ step</option>
              </select>
              <input
                type="text"
                value={series.factor}
                onChange={(e) => setSeries({ ...series, factor: e.target.value })}
              />
            </label>
            <label className="field">
              Along
              <select
                value={series.along}
                onChange={(e) => setSeries({ ...series, along: e.target.value as 'cols' | 'rows' })}
              >
                <option value="cols">columns (→)</option>
                <option value="rows">rows (↓)</option>
              </select>
            </label>
            <label className="field check">
              <input
                type="checkbox"
                checked={series.reverse}
                onChange={(e) => setSeries({ ...series, reverse: e.target.checked })}
              />
              Reverse
            </label>
          </div>
          <button type="button" onClick={fillSeries} disabled={props.nSamples === 0}>
            Fill selection
          </button>
          <p className="muted small">
            Each selected {series.along === 'cols' ? 'column' : 'row'} gets the next value, e.g. start 100, ×
            0.5 → 100, 50, 25…
          </p>
        </fieldset>
      )}
    </aside>
  );
}
