import { toCsv } from '@flowmeris/export';
import type { Group, Workspace } from '@flowmeris/model';
import { PLATE_COLS, PLATE_ROWS, normalizeWell, parseDelimited, wellFromSample } from '@flowmeris/table';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { download, safeName } from '../lib/download.ts';
import { PLAIN_DECIMAL, fracDigits } from '../lib/format.ts';
import { type CellRect, coerce, distinctValues, normRect, pasteTargets, setValue } from '../lib/metadata.ts';
import { type Sheet, TABLE_ACCEPT, readTableFile } from '../lib/sheets.ts';
import { toast, useGroup, useSampleNames, useStore } from '../state/store.ts';
import { ExportIcon, ImportIcon } from './ExportMenu.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import { SettingsIcon } from './Inspector.tsx';
import { activeVariable, deleteVariable } from './MetadataInspector.tsx';
import { PlateMap } from './PlateMap.tsx';

function display(x: number | string | undefined): string {
  return x === undefined ? '' : String(x);
}

/** Leading columns before the variables: the well, then its row and column (both edit the well). */
const WELL_COLS = ['Well', 'Row', 'Column'] as const;
const NW = WELL_COLS.length;

/** A row or column typed while the other half is still missing, so there is no well to store yet. */
type PartialWell = { row?: string; col?: number };

function wellParts(well: string | undefined, partial: PartialWell | undefined): PartialWell {
  return well ? { row: well[0], col: Number(well.slice(1)) } : (partial ?? {});
}

/**
 * Spreadsheet-like table: one row per sample, Well, Row and Column (linked:
 * editing one updates the others), then one column per variable. Drag across cells (or shift-click) to select a block; a paste then
 * fills the block, ⌘C copies it and Delete clears it.
 */
function MetaTable({ group }: { group: Group }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const ids = group.sampleIds;
  const vars = ws.variables;
  // Columns 0–2 are the well, its row and its column; NW… are the variables.
  const ncol = vars.length + NW;
  const [sel, setSel] = useState<CellRect | null>(null);
  const partial = useRef(new Map<string, PartialWell>());
  const [, rerender] = useState(0);
  /** Value menu of the focused categorical cell: `query` is the text typed so far (null: show every value). */
  const [menu, setMenu] = useState<{
    r: number;
    c: number;
    query: string | null;
    hi: number;
    at: { left: number; top: number; width: number };
  } | null>(null);
  /** Widths (px) of a digit and of "." in the table's font, for decimal alignment; null until measured. */
  const [glyph, setGlyph] = useState<{ digit: number; point: number } | null>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  /** Cell to focus after the next render: changed cells re-mount, and the selection needs a focused cell. */
  const refocus = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!refocus.current) return;
    const [r, c] = refocus.current;
    refocus.current = null;
    focusCell(r, c);
  });

  useLayoutEffect(() => {
    const run = () => {
      const el = measure.current;
      if (!el) return;
      const w = (t: string) => {
        el.textContent = t.repeat(10);
        return el.getBoundingClientRect().width / 10;
      };
      setGlyph({ digit: w('0'), point: w('.') });
    };
    run();
    // Measure again once the web font is in.
    void document.fonts?.ready.then(run);
  }, []);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', up);
    // The menu is fixed-position: close it rather than leave it behind when anything scrolls.
    const scroll = () => setMenu(null);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('scroll', scroll, true);
    };
  }, []);

  const rect = sel ? normRect(sel) : null;
  const multi = !!rect && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1);
  const inRect = (r: number, c: number) =>
    !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  /** Write one cell's text into the draft workspace; false if it does not fit the column. */
  const write = (x: Workspace, row: number, col: number, raw: string): boolean => {
    const s = x.samples[ids[row] ?? ''];
    if (!s) return true;
    const t = raw.trim();
    if (col === 0) {
      const w = t === '' ? undefined : normalizeWell(raw);
      if (t && !w) return false;
      s.well = w;
      partial.current.delete(s.id);
      return true;
    }
    if (col < NW) {
      const p = { ...wellParts(s.well, partial.current.get(s.id)) };
      if (col === 1) {
        if (t && !(t.length === 1 && PLATE_ROWS.includes(t.toUpperCase()))) return false;
        p.row = t ? t.toUpperCase() : undefined;
      } else {
        const n = Number(t);
        if (t && !(Number.isInteger(n) && n >= 1 && n <= PLATE_COLS)) return false;
        p.col = t ? n : undefined;
      }
      if (p.row && p.col) {
        s.well = `${p.row}${String(p.col).padStart(2, '0')}`;
        partial.current.delete(s.id);
      } else {
        s.well = undefined;
        if (p.row || p.col) partial.current.set(s.id, p);
        else partial.current.delete(s.id);
      }
      return true;
    }
    const v = vars[col - NW]!;
    const value = coerce(v, raw);
    if (value === undefined) return false;
    setValue(x, s.id, v.id, value);
    return true;
  };

  const cellValue = (row: number, col: number): number | string | undefined => {
    const s = ws.samples[ids[row] ?? ''];
    if (!s) return undefined;
    if (col === 0) return s.well;
    if (col < NW) {
      const p = wellParts(s.well, partial.current.get(s.id));
      return col === 1 ? p.row : p.col;
    }
    return s.meta[vars[col - NW]!.id];
  };
  const cellText = (row: number, col: number): string => display(cellValue(row, col));

  const colName = (col: number) => (col < NW ? WELL_COLS[col]! : vars[col - NW]!.name);

  const isNumeric = (col: number) => col === 2 || (col >= NW && vars[col - NW]!.type === 'numeric');

  /** Longest fractional part of each numeric column, so its decimal points line up. */
  const fracLen = Array.from({ length: ncol }, (_, c) =>
    isNumeric(c) ? Math.max(0, ...ids.map((_, r) => fracDigits(cellText(r, c)))) : 0,
  );
  /** Space right of a number for its missing decimals (in digits), and for its point when it has none. */
  const fracPad = (row: number, col: number): { digits: number; point: boolean } | undefined => {
    const t = cellText(row, col);
    if (!fracLen[col] || !PLAIN_DECIMAL.test(t)) return undefined;
    const point = !t.includes('.');
    const digits = fracLen[col]! - fracDigits(t);
    return digits || point ? { digits, point } : undefined;
  };
  const padStyle = (row: number, col: number) => {
    const p = fracPad(row, col);
    if (!p) return undefined;
    const g = glyph ?? { digit: 8, point: 4 };
    return { paddingRight: 8 + p.digits * g.digit + (p.point ? g.point : 0) };
  };

  /** Column widths that fit their longest value (the header can still widen a column). */
  const widths = Array.from({ length: ncol }, (_, c) =>
    Math.max(
      c < NW ? 1 : 4,
      ...ids.map(
        (_, r) => cellText(r, c).length + (fracPad(r, c)?.digits ?? 0) + (fracPad(r, c)?.point ? 1 : 0),
      ),
    ),
  );

  const levels = new Map(
    vars
      .filter((v) => v.type === 'categorical')
      .map((v) => [v.id, distinctValues(ws, v, Object.keys(ws.samples)).map(String)]),
  );
  const isCategorical = (col: number) => col >= NW && vars[col - NW]!.type === 'categorical';
  const menuItems = (() => {
    if (!menu || multi) return [];
    const all = levels.get(vars[menu.c - NW]?.id ?? '') ?? [];
    const q = menu.query?.trim().toLowerCase();
    return q ? all.filter((l) => l.toLowerCase().includes(q)) : all;
  })();
  const openMenu = (row: number, col: number, td: Element, query: string | null) => {
    const b = td.getBoundingClientRect();
    setMenu({ r: row, c: col, query, hi: -1, at: { left: b.left, top: b.bottom, width: b.width } });
  };
  const pick = (row: number, col: number, value: string) => {
    setMenu(null);
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
    if (el) el.value = value;
    commit(row, col, value);
    refocus.current = [row, col];
  };

  const commit = (row: number, col: number, raw: string): boolean => {
    if (raw.trim() === cellText(row, col).trim()) return true;
    const label = col < NW ? 'Set well' : `Set ${vars[col - NW]!.name}`;
    let ok = true;
    mutate(label, (x) => void (ok = write(x, row, col, raw)));
    rerender((n) => n + 1);
    if (!ok)
      toast(
        col === 0
          ? `“${raw}” is not a well of a 96-well plate (A01–H12).`
          : col === 1
            ? `“${raw}” is not a plate row (A–H).`
            : col === 2
              ? `“${raw}” is not a plate column (1–12).`
              : `“${raw}” is not a number (${vars[col - NW]!.name} is numeric).`,
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
    rerender((n) => n + 1);
    if (bad) toast(`${bad} pasted value(s) did not fit their column and were skipped.`);
    return true;
  };

  const clear = (row: number, col: number) => {
    if (!rect) return;
    mutate('Clear values', (x) => {
      for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) write(x, r, c, '');
    });
    refocus.current = [row, col];
    rerender((n) => n + 1);
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
            <th title="Well row (A–H)">Row</th>
            <th title="Well column (1–12)">Column</th>
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
            const values = Array.from({ length: ncol }, (_, c) => cellValue(r, c));
            return (
              <tr key={id}>
                <th scope="row" title={s.relativePath}>
                  {names[id] ?? s.fileName}
                </th>
                {values.map((x, c) => (
                  <td
                    key={c < NW ? WELL_COLS[c] : vars[c - NW]!.id}
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
                      if (isCategorical(c)) openMenu(r, c, e.currentTarget, null);
                      else setMenu(null);
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
                      className={isNumeric(c) ? 'num-input' : undefined}
                      size={widths[c]! + 1}
                      style={padStyle(r, c)}
                      defaultValue={display(x)}
                      autoComplete="off"
                      aria-label={`${colName(c)} of ${names[id] ?? s.fileName}`}
                      onChange={(e) => {
                        if (isCategorical(c))
                          openMenu(r, c, e.currentTarget.parentElement!, e.currentTarget.value);
                      }}
                      onBlur={(e) => {
                        if (menu?.r === r && menu.c === c) setMenu(null);
                        if (!commit(r, c, e.target.value)) e.target.value = display(x);
                      }}
                      onKeyDown={(e) => {
                        const open = menu?.r === r && menu.c === c && menuItems.length > 0;
                        if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                          e.preventDefault();
                          const n = menuItems.length;
                          const hi = menu.hi + (e.key === 'ArrowDown' ? 1 : -1);
                          setMenu({ ...menu, hi: (hi + n) % n });
                          return;
                        }
                        if (open && e.key === 'Enter' && menu.hi >= 0) {
                          e.preventDefault();
                          pick(r, c, menuItems[menu.hi]!);
                          return;
                        }
                        if (open && e.key === 'Escape') {
                          setMenu(null);
                          return;
                        }
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
      <span ref={measure} className="glyph-measure" aria-hidden="true" />
      {menu && menuItems.length > 0 && (
        <div
          className="picker-menu level-menu"
          style={{ left: menu.at.left, top: menu.at.top, minWidth: menu.at.width }}
        >
          {menuItems.map((l, i) => (
            <button
              key={l}
              type="button"
              className={`picker-item${i === menu.hi ? ' active' : ''}${l === cellText(menu.r, menu.c) ? ' selected' : ''}`}
              // Keep the focus in the cell, so picking is a commit rather than a blur.
              onPointerDown={(e) => {
                e.preventDefault();
                pick(menu.r, menu.c, l);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetadataView() {
  const group = useGroup();
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const names = useSampleNames(group);
  const mode = useStore((s) => s.ui.metaMode);
  const metaVarId = useStore((s) => s.ui.metaVarId);
  const settingsOpen = useStore((s) => s.ui.metaSettings);
  const setUi = useStore((s) => s.setUi);
  const setMode = (m: 'table' | 'plate') => setUi({ metaMode: m });
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!group) return <div className="empty">Select a group.</div>;

  const vars = ws.variables;
  const active = activeVariable(vars, metaVarId);

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
    <div className={`metadata-view ${mode === 'table' ? 'table-mode' : 'plate-mode'}`}>
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
          className="icon-text"
          onClick={() => fileInput.current?.click()}
          title="CSV, TSV or Excel: one row per sample, or plate-layout blocks"
        >
          <ImportIcon />
          Import
        </button>
        <button
          type="button"
          className="icon-text"
          onClick={exportTemplate}
          title="CSV of the samples with their wells and variables, to fill in and import"
        >
          <ExportIcon />
          Export
        </button>
        <button
          type="button"
          onClick={detectWells}
          title="Read wells from the $WELLID keyword or the file names"
        >
          Detect wells
        </button>
        <button
          type="button"
          className="tiles-settings"
          aria-expanded={settingsOpen}
          aria-label="Settings"
          title={settingsOpen ? 'Hide settings' : 'Show settings'}
          onClick={() => setUi({ metaSettings: !settingsOpen })}
        >
          <SettingsIcon />
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
      {vars.length > 0 && (
        <div className="variable-bar">
          {vars.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`chip${active?.id === v.id ? ' on' : ''}`}
              aria-pressed={active?.id === v.id}
              onClick={() => setUi({ metaVarId: v.id })}
              onKeyDown={(e) => {
                if (e.key !== 'Delete' && e.key !== 'Backspace') return;
                e.preventDefault();
                deleteVariable(v, mutate);
              }}
              title="Select (Delete to remove)"
            >
              {v.name}
              {v.unit ? ` (${v.unit})` : ''}
              <span className="muted small">{v.type === 'numeric' ? '#' : 'abc'}</span>
            </button>
          ))}
        </div>
      )}
      {mode === 'table' ? <MetaTable group={group} /> : <PlateMap group={group} variable={active} />}
      {sheets && <ImportDialog group={group} sheets={sheets} onClose={() => setSheets(null)} />}
    </div>
  );
}
