import { toCsv } from '@flowmeris/export';
import { type Group, type Variable, type Workspace, removeVariable } from '@flowmeris/model';
import { normalizeWell, parseDelimited, wellFromSample } from '@flowmeris/table';
import { useEffect, useRef, useState } from 'react';
import { download, safeName } from '../lib/download.ts';
import {
  type CellRect,
  addVariable,
  coerce,
  distinctValues,
  normRect,
  pasteTargets,
  retype,
  setValue,
} from '../lib/metadata.ts';
import { type Sheet, TABLE_ACCEPT, readTableFile } from '../lib/sheets.ts';
import { toast, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { PlateMap } from './PlateMap.tsx';

function display(x: number | string | undefined): string {
  return x === undefined ? '' : String(x);
}

/** Editing one variable's name, unit, type and category order. */
function VariableEditor({ v, onClose }: { v: Variable; onClose: () => void }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const edit = (label: string, fn: (x: Variable) => void, merge?: string) =>
    mutate(label, (w) => fn(w.variables.find((x) => x.id === v.id)!), merge);
  const levels = v.type === 'categorical' ? distinctValues(ws, v, Object.keys(ws.samples)).map(String) : [];
  const move = (i: number, d: number) =>
    edit('Reorder categories', (x) => {
      const order = [...levels];
      const [item] = order.splice(i, 1);
      order.splice(i + d, 0, item!);
      x.levels = order;
    });
  return (
    <div className="variable-editor">
      <label className="field">
        Name
        <input
          type="text"
          value={v.name}
          onChange={(e) => edit('Rename variable', (x) => void (x.name = e.target.value), `vname:${v.id}`)}
        />
      </label>
      <label className="field">
        Unit
        <input
          type="text"
          value={v.unit ?? ''}
          placeholder="e.g. nM"
          onChange={(e) =>
            edit(
              'Change unit',
              (x) => {
                if (e.target.value) x.unit = e.target.value;
                else x.unit = undefined;
              },
              `vunit:${v.id}`,
            )
          }
        />
      </label>
      <label className="field">
        Type
        <select
          value={v.type}
          onChange={(e) => {
            const type = e.target.value as Variable['type'];
            let dropped = 0;
            mutate('Change variable type', (w) => void (dropped = retype(w, v.id, type)));
            if (dropped) toast(`${dropped} value(s) were not numbers and were cleared (undo to restore).`);
          }}
        >
          <option value="numeric">numeric</option>
          <option value="categorical">categorical</option>
        </select>
      </label>
      {v.type === 'categorical' && levels.length > 1 && (
        <div className="field">
          Category order
          <ol className="level-list">
            {levels.map((l, i) => (
              <li key={l}>
                {l}
                <button
                  type="button"
                  className="icon"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  disabled={i === levels.length - 1}
                  onClick={() => move(i, 1)}
                  title="Move down"
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (!window.confirm(`Delete “${v.name}” and its values in all groups?`)) return;
            mutate('Delete variable', (w) => removeVariable(w, v.id));
            onClose();
          }}
        >
          Delete
        </button>
        <div className="spacer" />
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * Spreadsheet-like table: one row per sample, a Well column, one column per
 * variable. Drag across cells (or shift-click) to select a block; a paste then
 * fills the block, ⌘C copies it and Delete clears it.
 */
function MetaTable({ group }: { group: Group }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const ids = group.sampleIds;
  const vars = ws.variables;
  // Column 0 is the well; 1… are the variables.
  const ncol = vars.length + 1;
  const [sel, setSel] = useState<CellRect | null>(null);
  const dragging = useRef(false);
  /** Cell to focus after the next render: changed cells re-mount, and the selection needs a focused cell. */
  const refocus = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!refocus.current) return;
    const [r, c] = refocus.current;
    refocus.current = null;
    focusCell(r, c);
  });

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const rect = sel ? normRect(sel) : null;
  const multi = !!rect && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1);
  const inRect = (r: number, c: number) =>
    !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  /** Write one cell's text into the draft workspace; false if it does not fit the column. */
  const write = (x: Workspace, row: number, col: number, raw: string): boolean => {
    const s = x.samples[ids[row] ?? ''];
    if (!s) return true;
    if (col === 0) {
      const w = raw.trim() === '' ? undefined : normalizeWell(raw);
      if (raw.trim() && !w) return false;
      s.well = w;
      return true;
    }
    const v = vars[col - 1]!;
    const value = coerce(v, raw);
    if (value === undefined) return false;
    setValue(x, s.id, v.id, value);
    return true;
  };

  const cellText = (row: number, col: number): string => {
    const s = ws.samples[ids[row] ?? ''];
    return display(col === 0 ? s?.well : s?.meta[vars[col - 1]!.id]);
  };

  const commit = (row: number, col: number, raw: string): boolean => {
    if (raw.trim() === cellText(row, col).trim()) return true;
    const label = col === 0 ? 'Set well' : `Set ${vars[col - 1]!.name}`;
    let ok = true;
    mutate(label, (x) => void (ok = write(x, row, col, raw)));
    if (!ok)
      toast(
        col === 0
          ? `“${raw}” is not a well of a 96-well plate (A01–H12).`
          : `“${raw}” is not a number (${vars[col - 1]!.name} is numeric).`,
      );
    return ok;
  };

  /** Paste into the selection (when the cell is in it) or from the cell; false = let the input paste. */
  const paste = (row: number, col: number, text: string): boolean => {
    const inSel = multi && inRect(row, col);
    const t = text.replace(/\r?\n$/, '');
    const single = !/[\t\n]/.test(t);
    if (single && !inSel) return false;
    const target = inSel ? rect! : { r0: row, c0: col, r1: row, c1: col };
    const grid = single ? [[t]] : parseDelimited(t);
    let bad = 0;
    mutate('Paste values', (x) => {
      for (const p of pasteTargets(grid, target, ids.length, ncol)) if (!write(x, p.r, p.c, p.raw)) bad++;
    });
    refocus.current = [row, col];
    if (bad) toast(`${bad} pasted value(s) did not fit their column and were skipped.`);
    return true;
  };

  const clear = (row: number, col: number) => {
    if (!rect) return;
    mutate('Clear values', (x) => {
      for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) write(x, r, c, '');
    });
    refocus.current = [row, col];
  };

  const copyText = () => {
    if (!rect) return '';
    const lines: string[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const cells: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) cells.push(cellText(r, c));
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  const focusCell = (row: number, col: number) =>
    document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus();

  return (
    <div className="table-wrap">
      <table className={`stats meta-table${multi ? ' selecting' : ''}`}>
        <thead>
          <tr>
            <th>Sample</th>
            <th>Well</th>
            {vars.map((v) => (
              <th key={v.id}>
                {v.name}
                {v.unit ? ` (${v.unit})` : ''}{' '}
                <span className="muted small">{v.type === 'numeric' ? '#' : 'abc'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id, r) => {
            const s = ws.samples[id];
            if (!s) return null;
            const values = [s.well, ...vars.map((v) => s.meta[v.id])];
            return (
              <tr key={id}>
                <th scope="row" title={s.relativePath}>
                  {names[id] ?? s.fileName}
                </th>
                {values.map((x, c) => (
                  <td
                    key={c === 0 ? 'well' : vars[c - 1]!.id}
                    className={multi && inRect(r, c) ? 'sel' : undefined}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (e.shiftKey && sel) {
                        e.preventDefault();
                        setSel({ ...sel, r1: r, c1: c });
                        return;
                      }
                      dragging.current = true;
                      setSel({ r0: r, c0: c, r1: r, c1: c });
                    }}
                    onPointerEnter={() => {
                      if (!dragging.current || !sel) return;
                      if (sel.r1 === r && sel.c1 === c) return;
                      setSel({ ...sel, r1: r, c1: c });
                      // Keep the focus (for paste/copy) on the anchor cell, without a text selection in it.
                      const anchor = document.querySelector<HTMLInputElement>(
                        `[data-cell="${sel.r0}:${sel.c0}"]`,
                      );
                      anchor?.focus();
                      anchor?.setSelectionRange(anchor.value.length, anchor.value.length);
                    }}
                  >
                    <input
                      key={display(x)}
                      type="text"
                      data-cell={`${r}:${c}`}
                      className={c > 0 && vars[c - 1]!.type === 'numeric' ? 'num-input' : undefined}
                      defaultValue={display(x)}
                      list={
                        c > 0 && vars[c - 1]!.type === 'categorical' ? `levels-${vars[c - 1]!.id}` : undefined
                      }
                      aria-label={`${c === 0 ? 'Well' : vars[c - 1]!.name} of ${names[id] ?? s.fileName}`}
                      onBlur={(e) => {
                        if (!commit(r, c, e.target.value)) e.target.value = display(x);
                      }}
                      onKeyDown={(e) => {
                        if (multi && inRect(r, c) && (e.key === 'Delete' || e.key === 'Backspace')) {
                          e.preventDefault();
                          clear(r, c);
                        } else if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSel(null);
                          focusCell(
                            r + (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1),
                            c,
                          );
                        } else if (e.key === 'Escape') {
                          e.currentTarget.value = display(x);
                          setSel(null);
                          e.currentTarget.blur();
                        }
                      }}
                      onCopy={(e) => {
                        if (!multi || !inRect(r, c)) return;
                        e.preventDefault();
                        e.clipboardData.setData('text/plain', copyText());
                      }}
                      onPaste={(e) => {
                        if (paste(r, c, e.clipboardData.getData('text/plain'))) e.preventDefault();
                      }}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {vars
        .filter((v) => v.type === 'categorical')
        .map((v) => (
          <datalist key={v.id} id={`levels-${v.id}`}>
            {distinctValues(ws, v, Object.keys(ws.samples)).map((l) => (
              <option key={String(l)} value={String(l)} />
            ))}
          </datalist>
        ))}
    </div>
  );
}

export function MetadataView() {
  const group = useGroup();
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const [mode, setMode] = useState<'table' | 'plate'>('table');
  const [editing, setEditing] = useState<string | null>(null);
  const [activeVar, setActiveVar] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!group) return <div className="empty">Select a group.</div>;

  const vars = ws.variables;
  const active = vars.find((v) => v.id === activeVar) ?? vars[0];
  const editingVar = vars.find((v) => v.id === editing);

  const add = (type: Variable['type']) => {
    let id = '';
    mutate('Add variable', (w) => void (id = addVariable(w, type === 'numeric' ? 'Dose' : 'Group', type)));
    setEditing(id);
    setActiveVar(id);
  };

  const detectWells = () => {
    let n = 0;
    mutate('Detect wells', (w) => {
      for (const id of group.sampleIds) {
        const s = w.samples[id];
        if (!s || s.well) continue;
        const well = wellFromSample(s);
        if (well) {
          s.well = well;
          n++;
        }
      }
    });
    toast(n ? `Found wells for ${n} sample(s).` : 'No further wells found in keywords or file names.');
  };

  const exportTemplate = () => {
    const header = ['file_name', 'sample', 'well', ...vars.map((v) => v.name)];
    const rows = group.sampleIds.flatMap((id) => {
      const s = ws.samples[id];
      return s ? [[s.fileName, names[id] ?? '', s.well ?? '', ...vars.map((v) => s.meta[v.id] ?? '')]] : [];
    });
    download(`${safeName(`${group.name}_sample_variables`)}.csv`, toCsv([header, ...rows]), 'text/csv');
  };

  const openFile = async (file: File) => {
    try {
      const read = await readTableFile(file);
      if (read.every((s) => s.grid.length === 0)) toast('The file is empty.');
      else setSheets(read);
    } catch (e) {
      toast(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="metadata-view">
      <div className="toolbar">
        <div className="seg">
          <button type="button" className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>
            Table
          </button>
          <button type="button" className={mode === 'plate' ? 'on' : ''} onClick={() => setMode('plate')}>
            Plate map
          </button>
        </div>
        <div className="spacer" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="CSV, TSV or Excel: one row per sample, or plate-layout blocks"
        >
          Import…
        </button>
        <button
          type="button"
          onClick={exportTemplate}
          title="CSV of the samples with their wells and variables, to fill in and import"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={detectWells}
          title="Read wells from the $WELLID keyword or the file names"
        >
          Detect wells
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept={TABLE_ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFile(f);
            e.target.value = '';
          }}
          data-testid="meta-input"
        />
      </div>
      <div className="variable-bar">
        <span className="muted small">Variables:</span>
        {vars.map((v) => (
          <span key={v.id} className={`chip${active?.id === v.id && mode === 'plate' ? ' on' : ''}`}>
            <button
              type="button"
              className="link"
              aria-expanded={editing === v.id}
              onClick={() => {
                setActiveVar(v.id);
                setEditing(editing === v.id ? null : v.id);
              }}
              title="Edit variable"
            >
              {v.name}
              {v.unit ? ` (${v.unit})` : ''}
              <span className="muted small">{v.type === 'numeric' ? '#' : 'abc'}</span>
            </button>
            {editingVar?.id === v.id && <VariableEditor key={v.id} v={v} onClose={() => setEditing(null)} />}
          </span>
        ))}
        <button
          type="button"
          onClick={() => add('numeric')}
          title="A number per sample, e.g. dose, time, concentration"
        >
          + Numeric
        </button>
        <button
          type="button"
          onClick={() => add('categorical')}
          title="A label per sample, e.g. replicate, condition, cell line"
        >
          + Categorical
        </button>
      </div>
      {mode === 'table' ? <MetaTable group={group} /> : <PlateMap group={group} variable={active} />}
      {sheets && <ImportDialog group={group} sheets={sheets} onClose={() => setSheets(null)} />}
    </div>
  );
}
