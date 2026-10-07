import { toCsv } from '@flowmeris/export';
import { type Group, type Variable, removeVariable } from '@flowmeris/model';
import { normalizeWell, parseDelimited, wellFromSample } from '@flowmeris/table';
import { useRef, useState } from 'react';
import { download, safeName } from '../lib/download.ts';
import { addVariable, coerce, distinctValues, retype, setValue } from '../lib/metadata.ts';
import { type Sheet, TABLE_ACCEPT, readTableFile } from '../lib/sheets.ts';
import { toast, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { PlateMap } from './PlateMap.tsx';

function display(x: number | string | undefined): string {
  return x === undefined ? '' : String(x);
}

/** Editing one variable's name, unit, type and category order. */
function VariableEditor({ v, group, onClose }: { v: Variable; group: Group; onClose: () => void }) {
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
      <p className="muted small">
        Variables are shared by all groups of the workspace; values are per sample ({group.name} shown).
      </p>
    </div>
  );
}

/** Spreadsheet-like table: one row per sample, a Well column, one column per variable. Paste from a spreadsheet fills a block. */
function MetaTable({ group }: { group: Group }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const ids = group.sampleIds;
  const vars = ws.variables;
  // Column 0 is the well; 1… are the variables.
  const ncol = vars.length + 1;

  const commit = (row: number, col: number, raw: string): boolean => {
    const id = ids[row];
    if (!id) return true;
    if (col === 0) {
      const w = raw.trim() === '' ? undefined : normalizeWell(raw);
      if (raw.trim() && !w) {
        toast(`“${raw}” is not a well of a 96-well plate (A01–H12).`);
        return false;
      }
      if (w === ws.samples[id]?.well) return true;
      mutate('Set well', (x) => {
        const s = x.samples[id]!;
        if (w) s.well = w;
        else s.well = undefined;
      });
      return true;
    }
    const v = vars[col - 1]!;
    const value = coerce(v, raw);
    if (value === undefined) {
      toast(`“${raw}” is not a number (${v.name} is numeric).`);
      return false;
    }
    if ((value ?? undefined) === ws.samples[id]?.meta[v.id]) return true;
    mutate(`Set ${v.name}`, (x) => setValue(x, id, v.id, value));
    return true;
  };

  const paste = (row: number, col: number, text: string): boolean => {
    if (!/[\t\n]/.test(text.trim())) return false;
    const grid = parseDelimited(text.replace(/\r?\n$/, ''));
    let bad = 0;
    mutate('Paste values', (x) => {
      grid.forEach((cells, i) => {
        const id = ids[row + i];
        if (!id) return;
        cells.forEach((raw, j) => {
          const c = col + j;
          if (c >= ncol) return;
          if (c === 0) {
            const w = normalizeWell(raw);
            if (w) x.samples[id]!.well = w;
            else if (raw.trim()) bad++;
            return;
          }
          const v = vars[c - 1]!;
          const value = coerce(v, raw);
          if (value === undefined) bad++;
          else setValue(x, id, v.id, value);
        });
      });
    });
    if (bad) toast(`${bad} pasted value(s) did not fit their column and were skipped.`);
    return true;
  };

  const focusCell = (row: number, col: number) =>
    document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus();

  return (
    <div className="table-wrap">
      <table className="stats meta-table">
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
                  <td key={c === 0 ? 'well' : vars[c - 1]!.id}>
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
                        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          focusCell(
                            r + (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1),
                            c,
                          );
                        } else if (e.key === 'Escape') {
                          e.currentTarget.value = display(x);
                          e.currentTarget.blur();
                        }
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
      <p className="muted small">
        Enter / ↓ moves down. Paste a block copied from a spreadsheet to fill several cells at once.
      </p>
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
        <strong>Sample variables · {group.name}</strong>
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
              onClick={() => setActiveVar(v.id)}
              title={mode === 'plate' ? 'Show and edit on the plate' : undefined}
            >
              {v.name}
              {v.unit ? ` (${v.unit})` : ''}
            </button>
            <span className="muted small">{v.type === 'numeric' ? '#' : 'abc'}</span>
            <button
              type="button"
              className="icon"
              title="Edit variable"
              onClick={() => setEditing(editing === v.id ? null : v.id)}
            >
              ✎
            </button>
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
      {editingVar && (
        <VariableEditor key={editingVar.id} v={editingVar} group={group} onClose={() => setEditing(null)} />
      )}
      {mode === 'table' ? <MetaTable group={group} /> : <PlateMap group={group} variable={active} />}
      {sheets && <ImportDialog group={group} sheets={sheets} onClose={() => setSheets(null)} />}
    </div>
  );
}
