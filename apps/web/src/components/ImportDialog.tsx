import type { Group, Variable } from '@flowmeris/model';
import {
  MATCH_MODES,
  type MatchMode,
  detectPlateGrid,
  gridToRecords,
  matchSamples,
  suggestKey,
} from '@flowmeris/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ImportCount,
  type Target,
  importPlate,
  importTable,
  initialTargets,
  matchTargets,
} from '../lib/metaImport.ts';
import type { Sheet } from '../lib/sheets.ts';
import { toast, useSampleNames, useStore } from '../state/store.ts';

function TargetRow(props: {
  label: string;
  sample: string;
  t: Target;
  variables: Variable[];
  onChange: (t: Target) => void;
}) {
  const { t } = props;
  return (
    <tr>
      <td>
        <label className="field check">
          <input
            type="checkbox"
            checked={t.include}
            onChange={(e) => props.onChange({ ...t, include: e.target.checked })}
          />
          {props.label}
        </label>
      </td>
      <td className="muted small mono">{props.sample}</td>
      <td>
        <select
          value={t.to}
          disabled={!t.include}
          onChange={(e) => {
            const v = props.variables.find((x) => x.id === e.target.value);
            props.onChange({ ...t, to: e.target.value, ...(v ? { type: v.type } : {}) });
          }}
        >
          <option value="new">New variable…</option>
          {props.variables.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        {t.to === 'new' && (
          <span className="row">
            <input
              type="text"
              value={t.name}
              disabled={!t.include}
              onChange={(e) => props.onChange({ ...t, name: e.target.value })}
              aria-label="New variable name"
            />
            <select
              value={t.type}
              disabled={!t.include}
              onChange={(e) => props.onChange({ ...t, type: e.target.value as Variable['type'] })}
              aria-label="New variable type"
            >
              <option value="numeric">numeric</option>
              <option value="categorical">categorical</option>
            </select>
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Import sample variables from a table (one row per sample, matched by file
 * name, display name or well) or from plate-layout blocks (by well).
 */
export function ImportDialog({
  group,
  sheets,
  onClose,
}: { group: Group; sheets: Sheet[]; onClose: () => void }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const dialog = useRef<HTMLDialogElement>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [scope, setScope] = useState<'group' | 'all'>('group');
  const sheet = sheets[sheetIdx]!;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const targets = useMemo(
    () => matchTargets(ws, scope === 'group' ? group.sampleIds : Object.keys(ws.samples), names),
    [scope, group.sampleIds, ws.samples, names],
  );

  const blocks = useMemo(() => detectPlateGrid(sheet.grid), [sheet]);
  const records = useMemo(() => gridToRecords(sheet.grid), [sheet]);
  const columns = useMemo(
    () => records.headers.map((_, i) => records.rows.map((r) => r[i] ?? '')),
    [records],
  );
  const suggested = useMemo(
    () => suggestKey(records.rows, records.headers.length, targets),
    [records, targets],
  );
  const [key, setKey] = useState<{ column: number; mode: MatchMode } | null>(null);
  const k = key ?? suggested;
  const match = useMemo(
    () => matchSamples(records.rows, k.column, k.mode, targets),
    [records, k.column, k.mode, targets],
  );

  const plate = blocks.length > 0;
  const [tableTargets, setTableTargets] = useState<Target[] | null>(null);
  const [plateTargets, setPlateTargets] = useState<Target[] | null>(null);
  const tt = tableTargets ?? initialTargets(records.headers, columns, ws.variables, k.column);
  const pt =
    plateTargets ??
    initialTargets(
      blocks.map((b) => b.name),
      blocks.map((b) => Object.values(b.values)),
      ws.variables,
      -1,
    );
  const wellsMatched = useMemo(() => {
    const wells = new Set(blocks.flatMap((b) => Object.keys(b.values)));
    return targets.filter((t) => t.well && wells.has(t.well)).length;
  }, [blocks, targets]);

  const close = () => {
    dialog.current?.close();
    onClose();
  };

  const run = () => {
    let n: ImportCount = { set: 0, bad: 0 };
    mutate('Import sample variables', (w) => {
      n = plate
        ? importPlate(w, blocks, pt, targets)
        : importTable(w, records.rows, tt, k.column, match.byRow);
    });
    toast(`Imported ${n.set} value(s)${n.bad ? ` · ${n.bad} non-numeric value(s) skipped` : ''}.`);
    close();
  };

  const nIncluded = (plate ? pt : tt).filter((t, i) => t.include && (plate || i !== k.column)).length;

  return (
    <dialog ref={dialog} className="import-dialog" onCancel={onClose}>
      <h3>Import sample variables</h3>
      <div className="row wrap">
        {sheets.length > 1 && (
          <label className="field">
            Sheet
            <select
              value={sheetIdx}
              onChange={(e) => {
                setSheetIdx(Number(e.target.value));
                setKey(null);
                setTableTargets(null);
                setPlateTargets(null);
              }}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Match samples in
          <select value={scope} onChange={(e) => setScope(e.target.value as 'group' | 'all')}>
            <option value="group">this group ({group.sampleIds.length})</option>
            <option value="all">all groups ({Object.keys(ws.samples).length})</option>
          </select>
        </label>
      </div>
      {plate ? (
        <>
          <p className="small">
            Plate layout: {blocks.length} block(s) found, matched to samples by well —{' '}
            <strong>{wellsMatched}</strong> of {targets.length} samples have a well in the layout.
          </p>
          <table className="stats import-map">
            <thead>
              <tr>
                <th>Block</th>
                <th>Example</th>
                <th>Into</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <TargetRow
                  key={`${b.name}${i}`}
                  label={b.name}
                  sample={Object.values(b.values).slice(0, 3).join(', ')}
                  t={pt[i]!}
                  variables={ws.variables}
                  onChange={(t) => setPlateTargets(pt.map((x, j) => (j === i ? t : x)))}
                />
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="row wrap">
            <label className="field">
              Sample column
              <select
                value={k.column}
                onChange={(e) => {
                  const column = Number(e.target.value);
                  setKey({ column, mode: k.mode });
                  setTableTargets(tt.map((t, i) => (i === column ? { ...t, include: false } : t)));
                }}
              >
                {records.headers.map((h, i) => (
                  <option key={`${h}${i}`} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              holds the
              <select
                value={k.mode}
                onChange={(e) => setKey({ column: k.column, mode: e.target.value as MatchMode })}
              >
                {MATCH_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <span className={match.matched ? 'small' : 'small danger-text'}>
              <strong>{match.matched}</strong> of {targets.length} samples matched
              {match.unmatchedRows.length > 0 && (
                <span
                  className="muted"
                  title={match.unmatchedRows
                    .slice(0, 30)
                    .map((i) => records.rows[i]![k.column])
                    .join('\n')}
                >
                  {' '}
                  · {match.unmatchedRows.length} row(s) match nothing
                </span>
              )}
            </span>
          </div>
          <table className="stats import-map">
            <thead>
              <tr>
                <th>Column</th>
                <th>Example</th>
                <th>Into</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.headers.map((h, i) =>
                i === k.column ? null : (
                  <TargetRow
                    key={`${h}${i}`}
                    label={h}
                    sample={columns[i]!.filter((x) => x)
                      .slice(0, 3)
                      .join(', ')}
                    t={tt[i]!}
                    variables={ws.variables}
                    onChange={(t) => setTableTargets(tt.map((x, j) => (j === i ? t : x)))}
                  />
                ),
              )}
            </tbody>
          </table>
        </>
      )}
      <div className="row">
        <div className="spacer" />
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={run}
          disabled={nIncluded === 0 || (plate ? wellsMatched === 0 : match.matched === 0)}
        >
          Import {nIncluded} variable(s)
        </button>
      </div>
    </dialog>
  );
}
