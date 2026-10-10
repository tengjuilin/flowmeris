import type { Group, Workspace } from '@flowmeris/model';
import { parseDelimited } from '@flowmeris/table';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PLAIN_DECIMAL, fracDigits } from '../../lib/format.ts';
import {
  NW,
  type PartialWell,
  WELL_COLS,
  blockText,
  filterLevels,
  metaCellValue,
  rejectMessage,
  writeMetaCell,
} from '../../lib/metaTable.ts';
import { type CellRect, distinctValues, normRect, pasteTargets } from '../../lib/metadata.ts';
import { toast, useSampleNames, useStore } from '../../state/store.ts';

function display(x: number | string | undefined): string {
  return x === undefined ? '' : String(x);
}

/**
 * Spreadsheet-like table: one row per sample, Well, Row and Column (linked:
 * editing one updates the others), then one column per variable. Drag across cells (or shift-click) to select a block; a paste then
 * fills the block, ⌘C copies it and Delete clears it.
 */
export function MetaTable({ group }: { group: Group }) {
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
  const write = (x: Workspace, row: number, col: number, raw: string): boolean =>
    writeMetaCell(x, ids[row] ?? '', vars, col, raw, partial.current);
  const cellValue = (row: number, col: number) =>
    metaCellValue(ws, ids[row] ?? '', vars, col, partial.current);
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
    return filterLevels(levels.get(vars[menu.c - NW]?.id ?? '') ?? [], menu.query);
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
    if (!ok) toast(rejectMessage(col, raw, vars));
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

  const copyText = () => (rect ? blockText(rect, cellText) : '');

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
