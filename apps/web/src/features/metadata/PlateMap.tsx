import type { Group, Variable } from '@flowmeris/model';
import { ALL_WELLS, PLATE_COLS, PLATE_ROWS, wellName } from '@flowmeris/table';
import { useEffect, useMemo, useState } from 'react';
import { distinctValues } from '../../lib/metadata.ts';
import { inkOn, valueColors } from '../../lib/palette.ts';
import { fmtWellValue, rampGradient, samplesByWell, wellRect } from '../../lib/plate.ts';
import { useSampleNames, useStore } from '../../state/store.ts';

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
                    title={`${w}${ids.length ? `\n${ids.map((id) => names[id] ?? ws.samples[id]?.fileName).join('\n')}` : '\n(no sample)'}${variable ? `\n${variable.name}: ${fmtWellValue(v)}${mixed}` : ''}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const add = e.shiftKey || e.metaKey || e.ctrlKey;
                      const base = new Set(add ? sel : []);
                      setDrag({ anchor: w, base });
                      setSel(new Set([...base, w]));
                    }}
                    onPointerEnter={() => {
                      if (drag) setSel(new Set([...drag.base, ...wellRect(drag.anchor, w)]));
                    }}
                  >
                    <span className="well-value">{fmtWellValue(v)}</span>
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
              {fmtWellValue(colors.scale.min)}
              <span
                className="ramp"
                style={{
                  background: rampGradient(colors.scale, colors.color),
                }}
              />
              {fmtWellValue(colors.scale.max)}
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
