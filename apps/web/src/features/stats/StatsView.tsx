import { dropColumns, populationPath } from '@flowmeris/model';
import type { Cell, ColumnDef } from '@flowmeris/table';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { PLAIN_DECIMAL } from '../../lib/format.ts';
import { fmtStat as fmt } from '../../lib/statsFormat.ts';
import {
  fracLengths,
  headerSections,
  pinnedCount,
  sectionStarts,
  sigOf,
  statOf,
} from '../../lib/statsHeader.ts';
import type { StatColumn } from '../../lib/statsTable.ts';
import { useAnalysisTable } from '../../state/hooks/stats.ts';
import { useGroup, useStore } from '../../state/store.ts';

import { AGG_FUNCS } from './options.ts';
import { useGroupMutate } from './useGroupMutate.ts';

/** A formatted number with its decimal point aligned to the others of its column. */
function alignedNumber(text: string, fracLen: number) {
  const m = PLAIN_DECIMAL.exec(text);
  if (!m || fracLen === 0) return text;
  return (
    <>
      {m[1]}
      <span className="frac" style={{ minWidth: `${fracLen + 1}ch` }}>
        {m[2]}
      </span>
    </>
  );
}

/**
 * Offsets of the table's pinned parts: each header row sticks below the rows above it, and each pinned
 * column (marked `.pin` in the first body row) sticks right of the pinned columns before it.
 */
function layoutPinned(t: HTMLTableElement) {
  let top = 0;
  for (const [i, row] of [...(t.tHead?.rows ?? [])].entries()) {
    t.style.setProperty(`--head-top-${i}`, `${top}px`);
    top += row.offsetHeight;
  }
  let left = 0;
  for (const [i, cell] of [...(t.tBodies[0]?.rows[0]?.cells ?? [])].entries()) {
    if (!cell.classList.contains('pin')) break;
    t.style.setProperty(`--pin-left-${i}`, `${left}px`);
    left += cell.getBoundingClientRect().width;
  }
}

export function StatsView() {
  const samples = useStore((s) => s.ws.samples);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const missing = useStore((s) => s.status.missing);
  const group = useGroup();
  const { stats, perSample, aggregated } = useAnalysisTable(group);
  const { columns: statCols, rows } = stats;
  const edit = useGroupMutate(group?.id ?? '');

  const display = aggregated ?? perSample;
  // Re-measure the pinned rows and columns when the table changes size without a re-render (window, fonts).
  const tableRef = useRef<HTMLTableElement | null>(null);
  useLayoutEffect(() => {
    const t = tableRef.current;
    if (!t) return;
    const ro = new ResizeObserver(() => layoutPinned(t));
    ro.observe(t);
    return () => ro.disconnect();
  }, [group?.id]);
  const byKey = useMemo(() => new Map(perSample.columns.map((c) => [c.key, c])), [perSample]);
  const statByKey = useMemo(() => new Map<string, StatColumn>(statCols.map((c) => [c.key, c])), [statCols]);
  const overridden = useMemo(() => new Set(group?.overrides.map((o) => o.sampleId)), [group]);
  const rowInfo = useMemo(() => new Map(rows.map((r) => [r.sid, r])), [rows]);

  if (!group) return <div className="empty">Select a group.</div>;

  // Header: sections (sample, variables, each population, derived) over short column labels.
  const sections = headerSections(display.columns, byKey);
  const sectionStart = sectionStarts(display.columns, sections, !!aggregated);
  const sectionHead = (id: string) => {
    if (id.startsWith('pop:')) {
      const p = group.template.populations[id.slice(4)];
      return (
        <>
          <span className="swatch" style={{ background: p?.color }} /> {p?.name}
        </>
      );
    }
    return { sample: '', variables: 'Variables', derived: 'Derived', group: '' }[id] ?? '';
  };
  const shortLabel = (c: ColumnDef): string => {
    if (c.kind === 'aggregate' && c.source) {
      const src = byKey.get(c.source);
      const f = AGG_FUNCS.find((x) => x.id === c.func)?.label ?? c.func;
      return `${src ? shortLabel(src) : c.source} · ${f}`;
    }
    return statByKey.get(c.key)?.label ?? c.label;
  };
  const derivedById = new Map(group.analysis.derived.map((d) => [d.id, d]));
  const text = (c: ColumnDef, v: Cell) => fmt(v, statOf(c, statByKey), sigOf(c, byKey, derivedById));
  const fracLen = fracLengths(display, text);
  const nPin = pinnedCount(display.columns, !!aggregated);
  const pin = (i: number, cls?: string) =>
    i < nPin
      ? {
          className: [cls, 'pin', i === nPin - 1 ? 'pin-last' : ''].filter(Boolean).join(' '),
          style: { left: `var(--pin-left-${i}, 0px)` },
        }
      : { className: cls };

  return (
    <div className="stats-view">
      <div className="table-wrap stats-scroll">
        <table
          className="stats"
          ref={(t) => {
            tableRef.current = t;
            if (t) layoutPinned(t);
          }}
        >
          <thead>
            <tr>
              {sections.map((s, i) => (
                <th
                  key={`${s.id}${i}`}
                  colSpan={s.span}
                  className={
                    [
                      s.id.startsWith('pop:') ? 'pop-head' : '',
                      i > 0 ? 'sec-start' : '',
                      i === 0 && s.span <= nPin ? 'pin' : '',
                      i === 0 && s.span === nPin ? 'pin-last' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  style={i === 0 && s.span <= nPin ? { left: 0 } : undefined}
                  title={s.id.startsWith('pop:') ? populationPath(group.template, s.id.slice(4)) : undefined}
                >
                  {sectionHead(s.id)}
                </th>
              ))}
            </tr>
            <tr>
              {display.columns.map((c, i) => {
                const summary = !!aggregated && c.kind === 'aggregate' && !!c.source;
                if (summary && display.columns[i - 1]?.source === c.source) return null;
                let span = 1;
                if (summary) while (display.columns[i + span]?.source === c.source) span++;
                const specId = statByKey.get(summary ? c.source! : c.key)?.specId;
                return (
                  <th
                    key={c.key}
                    title={summary ? undefined : c.label}
                    colSpan={span > 1 ? span : undefined}
                    rowSpan={aggregated && !summary ? 2 : undefined}
                    {...pin(i, sectionStart.has(c.key) ? 'sec-start' : undefined)}
                  >
                    {summary ? shortLabel(byKey.get(c.source!) ?? c) : shortLabel(c)}
                    {specId && (
                      <button
                        type="button"
                        className="icon"
                        title="Remove statistic"
                        aria-label="Remove statistic"
                        onClick={() =>
                          edit('Remove statistic', (g) => {
                            g.stats = g.stats.filter((s) => s.id !== specId);
                            dropColumns(g, new Set([specId]));
                          })
                        }
                      >
                        ✕
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
            {aggregated && (
              <tr>
                {display.columns.map((c) =>
                  c.kind === 'aggregate' && c.source ? (
                    <th
                      key={c.key}
                      title={c.label}
                      className={sectionStart.has(c.key) ? 'sec-start' : undefined}
                    >
                      {AGG_FUNCS.find((x) => x.id === c.func)?.label ?? c.func}
                    </th>
                  ) : null,
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {display.rows.map((r) => {
              const info = aggregated ? undefined : rowInfo.get(r.id);
              const cls = [
                !aggregated && selectedSample === r.id ? 'on' : '',
                info?.stale && info.table ? 'stale' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={r.id} className={cls || undefined}>
                  {display.columns.map((c, i) =>
                    i === 0 ? (
                      <th
                        key={c.key}
                        scope="row"
                        title={aggregated ? undefined : samples[r.id]?.relativePath}
                        {...pin(i)}
                      >
                        {text(c, r.values[c.key])}
                        {!aggregated && overridden.has(r.id) && <span className="badge warn">override</span>}
                        {!aggregated && missing[r.id] && <span className="badge danger">missing</span>}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        {...pin(
                          i,
                          [
                            c.type === 'categorical' ? 'text-cell' : '',
                            sectionStart.has(c.key) ? 'sec-start' : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined,
                        )}
                      >
                        {alignedNumber(text(c, r.values[c.key]), fracLen.get(c.key) ?? 0)}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
