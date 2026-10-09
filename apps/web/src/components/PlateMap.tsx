import type { Group, Variable, Workspace } from '@flowmeris/model';
import { ALL_WELLS, PLATE_COLS, PLATE_ROWS, wellIndex, wellName } from '@flowmeris/table';
import { useEffect, useMemo, useState } from 'react';
import { distinctValues, inkOn, valueColors } from '../lib/metadata.ts';
import { useSampleNames, useStore } from '../state/store.ts';

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

/** Samples of each well, among the given samples. */
export function samplesByWell(ws: Workspace, sampleIds: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const id of sampleIds) {
    const w = ws.samples[id]?.well;
    if (!w) continue;
    const list = m.get(w);
    if (list) list.push(id);
    else m.set(w, [id]);
  }
  return m;
}

/**
 * 96-well plate map: select wells (click, drag, shift/⌘-click, row and column
 * headers); the Values tab of the settings panel then sets a variable's value
 * for the samples in them, or fills a numeric series.
 */
export function PlateMap({ group, variable }: { group: Group; variable: Variable | undefined }) {
  const ws = useStore((s) => s.ws);
  const plateSel = useStore((s) => s.ui.plateSel);
  const setUi = useStore((s) => s.setUi);
  const names = useSampleNames(group);
  const sel = useMemo(() => new Set(plateSel), [plateSel]);
  const setSel = (next: Set<string>) => setUi({ plateSel: [...next] });
  const [drag, setDrag] = useState<{ anchor: string; base: Set<string> } | null>(null);

  // Esc clears the selection (unless typing, where Esc belongs to the field).
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || t?.closest('input, select, textarea')) return;
      if (useStore.getState().ui.plateSel.length) setUi({ plateSel: [] });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [setUi]);

  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [drag]);

  const byWell = useMemo(() => samplesByWell(ws, group.sampleIds), [ws, group.sampleIds]);
  const unplaced = group.sampleIds.filter((id) => !ws.samples[id]?.well);

  const values = useMemo(
    () => (variable ? distinctValues(ws, variable, group.sampleIds) : []),
    [ws, variable, group.sampleIds],
  );
  const colors = useMemo(() => (variable ? valueColors(variable, values) : undefined), [variable, values]);

  const pick = (wells: string[], e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    const next = new Set(add ? sel : []);
    const allOn = add && wells.every((w) => sel.has(w));
    for (const w of wells) allOn ? next.delete(w) : next.add(w);
    setSel(next);
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
    </div>
  );
}
