import { exportGatingML, tidyRows, toCsv, wideRows } from '@flowmeris/export';
import {
  type AggFunc,
  type DerivedColumn,
  type Group,
  type StatKind,
  type StatSpec,
  type Variable,
  dropColumns,
  newId,
  populationPath,
} from '@flowmeris/model';
import { type Cell, type ColumnDef, EXPR_FUNCTIONS, type Table, tableRows } from '@flowmeris/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { download, safeName } from '../lib/download.ts';
import { type StatColumn, useAnalysisTable } from '../lib/statsTable.ts';
import { APP_INFO, contextFor, toast, useGroup, useStore } from '../state/store.ts';

const VALUE_STATS: { id: StatKind; label: string }[] = [
  { id: 'median', label: 'Median' },
  { id: 'mean', label: 'Mean' },
  { id: 'geomMean', label: 'Geometric mean (x > 0)' },
  { id: 'sd', label: 'SD' },
  { id: 'cv', label: 'CV (%)' },
  { id: 'rsd', label: 'Robust SD' },
  { id: 'rcv', label: 'Robust CV (%)' },
  { id: 'percentile', label: 'Percentile…' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
];

export const AGG_FUNCS: { id: AggFunc; label: string; title: string }[] = [
  { id: 'mean', label: 'Mean', title: 'Arithmetic mean' },
  { id: 'sd', label: 'SD', title: 'Sample standard deviation (n − 1)' },
  { id: 'sem', label: 'SEM', title: 'Standard error of the mean, SD / √n' },
  {
    id: 'ci95',
    label: '95% CI',
    title: 'Half-width of the 95% confidence interval of the mean, t(0.975, n − 1) · SEM',
  },
  { id: 'median', label: 'Median', title: 'Median' },
  { id: 'cv', label: 'CV', title: 'Coefficient of variation, 100 · SD / mean (%)' },
  { id: 'min', label: 'Min', title: 'Minimum' },
  { id: 'max', label: 'Max', title: 'Maximum' },
  { id: 'n', label: 'n', title: 'Number of rows in each group' },
];

const COUNT_FORMAT = new Intl.NumberFormat();

/** Display formatting only; exports carry full double precision. */
function fmt(v: Cell, stat: string | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Number.isNaN(v)) return 'NaN';
  if (stat === 'count' || stat === 'n') return COUNT_FORMAT.format(v);
  if (stat?.startsWith('pct') || stat === 'cv' || stat === 'rcv') return v.toFixed(2);
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-3 || a >= 1e7) ? v.toExponential(4) : String(Number(v.toPrecision(5)));
}

/** Header section of a column: a population, or one of the fixed sections. */
function sectionOf(c: ColumnDef, byKey: Map<string, ColumnDef>): string {
  if (c.pop) return `pop:${c.pop}`;
  if (c.key === 'group:n') return 'group';
  const src = c.source ? byKey.get(c.source) : undefined;
  const kind = src?.kind ?? c.kind;
  return kind === 'variable' ? 'variables' : kind === 'derived' ? 'derived' : kind;
}

function useGroupMutate(groupId: string) {
  const mutate = useStore((s) => s.mutate);
  return (label: string, fn: (g: Group) => void, merge?: string) =>
    mutate(label, (w) => fn(w.groups.find((x) => x.id === groupId)!), merge);
}

/**
 * Columns of `display` a "CSV (table)" export includes. `selected` lists
 * per-sample column keys (undefined = all); a grouped table keeps its grouping
 * columns and n, and the summaries of the selected columns.
 */
function exportKeys(display: Table, grouped: boolean, selected: string[] | undefined): string[] {
  const on = selected ? new Set(selected) : undefined;
  return display.columns
    .filter(
      (c) => !on || on.has(c.source ?? c.key) || (grouped && (c.key === 'group:n' || c.kind === 'variable')),
    )
    .map((c) => c.key);
}

// ---------------------------------------------------------------------------
// Derived columns
// ---------------------------------------------------------------------------

function FormulaForm(props: {
  initial?: Extract<DerivedColumn, { kind: 'formula' }>;
  columns: ColumnDef[];
  onSave: (d: Extract<DerivedColumn, { kind: 'formula' }>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? 'Formula');
  const [expr, setExpr] = useState(props.initial?.expr ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const insert = (text: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? at;
    setExpr(expr.slice(0, at) + text + expr.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };
  return (
    <div className="derived-form">
      <label className="field">
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field grow">
        Formula
        <input
          ref={ref}
          type="text"
          className="mono"
          value={expr}
          placeholder="[CD4+ | Median PE-A (PE-A)] / [CD4+ | Median FITC-A (FITC-A)]"
          onChange={(e) => setExpr(e.target.value)}
        />
      </label>
      <label className="field">
        Insert column
        <select value="" onChange={(e) => e.target.value && insert(`[${e.target.value}]`)}>
          <option value="">—</option>
          {props.columns
            .filter((c) => c.type === 'numeric')
            .map((c) => (
              <option key={c.key} value={c.label}>
                {c.label}
              </option>
            ))}
        </select>
      </label>
      <span className="muted small" title="Operators: + − * / ^ and parentheses">
        Functions: {EXPR_FUNCTIONS.join(', ')}
      </span>
      <button
        type="button"
        className="primary"
        disabled={!expr.trim()}
        onClick={() =>
          props.onSave({
            id: props.initial?.id ?? newId('dc_'),
            name: name.trim() || 'Formula',
            kind: 'formula',
            expr,
          })
        }
      >
        {props.initial ? 'Save' : 'Add'}
      </button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}

type Normalize = Extract<DerivedColumn, { kind: 'normalize' }>;

function NormalizeForm(props: {
  initial?: Normalize;
  columns: ColumnDef[];
  variables: Variable[];
  /** Values present in the table, by variable id. */
  valuesOf: (variableId: string) => Cell[];
  onSave: (d: Normalize) => void;
  onCancel: () => void;
}) {
  const { variables } = props;
  const [draft, setD] = useState<Normalize>(
    props.initial ?? {
      id: newId('dc_'),
      name: '',
      kind: 'normalize',
      // The most recently added value statistic (median, mean…), else a frequency.
      source:
        [...props.columns]
          .reverse()
          .find((c) => (c.kind === 'stat' && !/\|(count|pctParent)$/.test(c.key)) || c.kind === 'derived')
          ?.key ??
        [...props.columns].reverse().find((c) => c.kind === 'stat')?.key ??
        '',
      refVariable: variables[0]?.id ?? '',
      refValue: '',
      within: [],
      mode: 'ratio',
    },
  );
  // The reference variable may have been deleted (or none existed) since the form opened.
  const d = variables.some((v) => v.id === draft.refVariable)
    ? draft
    : { ...draft, refVariable: variables[0]?.id ?? '', refValue: '' };
  if (variables.length === 0)
    return (
      <div className="derived-form">
        <span className="muted">
          Normalisation needs a sample variable (Metadata tab) to pick reference samples.
        </span>
        <button type="button" onClick={props.onCancel}>
          Close
        </button>
      </div>
    );
  const refValues = props.valuesOf(d.refVariable);
  const src = props.columns.find((c) => c.key === d.source);
  const refVar = variables.find((v) => v.id === d.refVariable);
  const srcName = src ? (src.label.split(' | ').pop() ?? src.label) : '?';
  const ref = `${refVar?.name ?? '?'} ${d.refValue}`;
  const autoName =
    d.mode === 'ratio'
      ? `${srcName} / ${ref}`
      : d.mode === 'percent'
        ? `${srcName} % of ${ref}`
        : `${srcName} − ${ref}`;
  return (
    <div className="derived-form">
      <label className="field">
        Name
        <input
          type="text"
          value={d.name}
          placeholder={autoName}
          onChange={(e) => setD({ ...d, name: e.target.value })}
        />
      </label>
      <label className="field">
        Column
        <select value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })}>
          {props.columns
            .filter((c) => c.type === 'numeric' && c.kind !== 'variable')
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Relative to samples with
        <span className="row">
          <select
            value={d.refVariable}
            onChange={(e) => setD({ ...d, refVariable: e.target.value, refValue: '' })}
          >
            {variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          =
          <select
            value={JSON.stringify(d.refValue)}
            onChange={(e) => setD({ ...d, refValue: JSON.parse(e.target.value) })}
          >
            <option value={JSON.stringify('')}>—</option>
            {refValues.map((v) => (
              <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
                {String(v)}
              </option>
            ))}
          </select>
        </span>
      </label>
      <fieldset className="field">
        <legend title="The reference is the mean over reference samples that share these variables with the row (e.g. per replicate or per group)">
          Within the same
        </legend>
        <span className="row">
          {variables
            .filter((v) => v.id !== d.refVariable)
            .map((v) => (
              <label key={v.id} className="field check">
                <input
                  type="checkbox"
                  checked={d.within.includes(v.id)}
                  onChange={(e) =>
                    setD({
                      ...d,
                      within: e.target.checked ? [...d.within, v.id] : d.within.filter((x) => x !== v.id),
                    })
                  }
                />
                {v.name}
              </label>
            ))}
        </span>
      </fieldset>
      <label className="field">
        As
        <select value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as Normalize['mode'] })}>
          <option value="ratio">ratio (x / ref)</option>
          <option value="percent">percent (100 · x / ref)</option>
          <option value="difference">difference (x − ref)</option>
        </select>
      </label>
      <button
        type="button"
        className="primary"
        disabled={!d.source || d.refValue === ''}
        onClick={() => props.onSave({ ...d, name: d.name.trim() || autoName })}
      >
        {props.initial ? 'Save' : 'Add'}
      </button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}

function DerivedPanel(props: {
  group: Group;
  columns: ColumnDef[];
  errors: Record<string, string>;
  valuesOf: (variableId: string) => Cell[];
}) {
  const { group } = props;
  const variables = useStore((s) => s.ws.variables);
  const edit = useGroupMutate(group.id);
  const [form, setForm] = useState<{ kind: 'formula' | 'normalize'; id?: string } | null>(null);
  const derived = group.analysis.derived;
  const editing = form?.id ? derived.find((d) => d.id === form.id) : undefined;
  // Columns a derived column may use: everything before it.
  const before = (id?: string) => {
    const idx = id ? props.columns.findIndex((c) => c.key === `derived:${id}`) : -1;
    return idx < 0 ? props.columns : props.columns.slice(0, idx);
  };
  const save = (d: DerivedColumn) => {
    edit(editing ? 'Edit derived column' : 'Add derived column', (g) => {
      const i = g.analysis.derived.findIndex((x) => x.id === d.id);
      if (i >= 0) g.analysis.derived[i] = d;
      else g.analysis.derived.push(d);
    });
    setForm(null);
  };
  return (
    <section className="analysis-section">
      <h4>Derived columns</h4>
      {derived.length > 0 && (
        <ul className="derived-list">
          {derived.map((d) => (
            <li key={d.id}>
              <strong>{d.name}</strong>{' '}
              <span className="muted small mono">
                {d.kind === 'formula'
                  ? `= ${d.expr}`
                  : `${d.mode} to ${variables.find((v) => v.id === d.refVariable)?.name ?? '?'} = ${d.refValue}${d.within.length ? ` within ${d.within.map((w) => variables.find((v) => v.id === w)?.name ?? '?').join(', ')}` : ''}`}
              </span>
              {props.errors[d.id] && <span className="badge danger">{props.errors[d.id]}</span>}
              <button
                type="button"
                className="icon"
                title="Edit"
                onClick={() => setForm({ kind: d.kind, id: d.id })}
              >
                ✎
              </button>
              <button
                type="button"
                className="icon"
                title="Remove derived column"
                onClick={() =>
                  edit('Remove derived column', (g) => dropColumns(g, new Set([`derived:${d.id}`])))
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {form?.kind === 'formula' ? (
        <FormulaForm
          key={form.id ?? 'new'}
          initial={editing?.kind === 'formula' ? editing : undefined}
          columns={before(form.id)}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      ) : form?.kind === 'normalize' ? (
        <NormalizeForm
          key={form.id ?? 'new'}
          initial={editing?.kind === 'normalize' ? editing : undefined}
          columns={before(form.id)}
          variables={variables}
          valuesOf={props.valuesOf}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      ) : (
        <div className="row">
          <button
            type="button"
            onClick={() => setForm({ kind: 'formula' })}
            title="A new column computed from others, e.g. a ratio"
          >
            + Formula
          </button>
          <button
            type="button"
            onClick={() => setForm({ kind: 'normalize' })}
            title="Fold change or percent of a reference condition (e.g. untreated, dose 0)"
          >
            + Normalisation
          </button>
        </div>
      )}
    </section>
  );
}

function GroupByPanel({ group }: { group: Group }) {
  const variables = useStore((s) => s.ws.variables);
  const edit = useGroupMutate(group.id);
  const agg = group.analysis.aggregate;
  return (
    <section className="analysis-section">
      <h4>
        <label className="field check">
          <input
            type="checkbox"
            checked={agg.enabled}
            onChange={(e) =>
              edit('Toggle grouping', (g) => void (g.analysis.aggregate.enabled = e.target.checked))
            }
          />
          Combine replicates
        </label>
      </h4>
      {variables.length === 0 ? (
        <span className="muted small">Add sample variables in the Metadata tab to group by them.</span>
      ) : (
        <>
          <div className="row wrap">
            <span className="muted small">Group by</span>
            {variables.map((v) => (
              <label key={v.id} className="field check">
                <input
                  type="checkbox"
                  checked={agg.by.includes(v.id)}
                  onChange={(e) =>
                    edit('Change grouping', (g) => {
                      const a = g.analysis.aggregate;
                      a.by = e.target.checked ? [...a.by, v.id] : a.by.filter((x) => x !== v.id);
                      a.enabled = true;
                    })
                  }
                />
                {v.name}
              </label>
            ))}
          </div>
          <div className="row wrap">
            <span className="muted small">Summaries</span>
            {AGG_FUNCS.map((f) => (
              <label key={f.id} className="field check" title={f.title}>
                <input
                  type="checkbox"
                  checked={agg.funcs.includes(f.id)}
                  onChange={(e) =>
                    edit('Change summaries', (g) => {
                      const a = g.analysis.aggregate;
                      const on = new Set(
                        e.target.checked ? [...a.funcs, f.id] : a.funcs.filter((x) => x !== f.id),
                      );
                      a.funcs = AGG_FUNCS.map((x) => x.id).filter((x) => on.has(x));
                    })
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ColumnsPicker({ group, table }: { group: Group; table: Table }) {
  const edit = useGroupMutate(group.id);
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  // Close when clicking anywhere outside the card.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  const selected = group.analysis.exportColumns;
  const on = new Set(selected ?? table.columns.map((c) => c.key));
  const set = (keys: string[] | undefined) =>
    edit('Choose export columns', (g) => void (g.analysis.exportColumns = keys));
  const toggle = (keys: string[], value: boolean) => {
    const next = new Set(on);
    for (const k of keys) value ? next.add(k) : next.delete(k);
    const list = table.columns.map((c) => c.key).filter((k) => next.has(k));
    set(list.length === table.columns.length ? undefined : list);
  };
  const sections: { title: string; cols: ColumnDef[] }[] = [];
  for (const c of table.columns) {
    const title =
      c.kind === 'sample'
        ? 'Sample'
        : c.kind === 'variable'
          ? 'Variables'
          : c.kind === 'derived'
            ? 'Derived'
            : (group.template.populations[c.pop ?? '']?.name ?? 'Statistics');
    const last = sections[sections.length - 1];
    if (last?.title === title) last.cols.push(c);
    else sections.push({ title, cols: [c] });
  }
  const n = table.columns.filter((c) => on.has(c.key)).length;
  return (
    <details ref={menu} className="overlay-picker" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary title="Columns included in the CSV (table) export">
        Columns ({n}/{table.columns.length})
      </summary>
      <div className="overlay-menu columns-menu">
        <div className="row">
          <button type="button" className="link" onClick={() => set(undefined)}>
            all
          </button>
          <button type="button" className="link" onClick={() => set(['sample:name'])}>
            none
          </button>
        </div>
        {sections.map((s) => (
          <fieldset key={s.title + s.cols[0]!.key}>
            <legend>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={s.cols.every((c) => on.has(c.key))}
                  onChange={(e) =>
                    toggle(
                      s.cols.map((c) => c.key),
                      e.target.checked,
                    )
                  }
                />
                {s.title}
              </label>
            </legend>
            {s.cols.map((c) => (
              <label key={c.key} className="field check">
                <input
                  type="checkbox"
                  checked={on.has(c.key)}
                  onChange={(e) => toggle([c.key], e.target.checked)}
                />
                {c.pop ? c.label.slice(c.label.indexOf(' | ') + 3) : c.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function StatsView() {
  const samples = useStore((s) => s.ws.samples);
  const popId = useStore((s) => s.ui.popId);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const missing = useStore((s) => s.ui.missing);
  const group = useGroup();
  const { stats, perSample, aggregated, errors } = useAnalysisTable(group);
  const { pops, columns: statCols, rows, busy, complete, marker, shown } = stats;
  const edit = useGroupMutate(group?.id ?? '');
  const [form, setForm] = useState<{ pop: string; stat: StatKind; channel: string; p: number }>({
    pop: popId,
    stat: 'median',
    channel: '',
    p: 50,
  });

  const display = aggregated ?? perSample;
  const byKey = useMemo(() => new Map(perSample.columns.map((c) => [c.key, c])), [perSample]);
  const statByKey = useMemo(() => new Map<string, StatColumn>(statCols.map((c) => [c.key, c])), [statCols]);
  const overridden = useMemo(() => new Set(group?.overrides.map((o) => o.sampleId)), [group]);
  const rowInfo = useMemo(() => new Map(rows.map((r) => [r.sid, r])), [rows]);

  const valuesOf = (variableId: string): Cell[] => {
    const seen = new Map<string, Cell>();
    for (const r of perSample.rows) {
      const v = r.values[`var:${variableId}`];
      if (v !== undefined && v !== '') seen.set(JSON.stringify(v), v);
    }
    return [...seen.values()].sort((a, b) =>
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true }),
    );
  };

  if (!group) return <div className="empty">Select a group.</div>;

  // Header: sections (sample, variables, each population, derived) over short column labels.
  const sections: { id: string; span: number }[] = [];
  for (const c of display.columns) {
    const id = sectionOf(c, byKey);
    const last = sections[sections.length - 1];
    if (last?.id === id) last.span++;
    else sections.push({ id, span: 1 });
  }
  // Columns that get a left divider: the first of every section after the first.
  const sectionStart = new Set<string>();
  let colIdx = 0;
  for (const sec of sections.slice(0, -1)) {
    colIdx += sec.span;
    sectionStart.add(display.columns[colIdx]!.key);
  }
  // A grouped table also divides the summaries (mean, SD, …) of different source columns.
  if (aggregated)
    display.columns.forEach((c, i) => {
      const prev = display.columns[i - 1];
      if (prev && c.source && c.source !== prev.source) sectionStart.add(c.key);
    });
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
  const statOf = (c: ColumnDef): string | undefined =>
    c.func === 'n' ? 'n' : c.func === 'cv' ? 'cv' : statByKey.get(c.source ?? c.key)?.stat;

  const addStat = () => {
    if (!form.channel) {
      toast('Choose a channel for this statistic.');
      return;
    }
    const spec: StatSpec = {
      id: newId('st_'),
      population: form.pop,
      stat: form.stat,
      channel: form.channel,
      space: 'linear',
      ...(form.stat === 'percentile' ? { p: form.p } : {}),
    };
    edit('Add statistic', (g) => void g.stats.push(spec));
  };

  const exportTable = () => {
    const keys = exportKeys(display, !!aggregated, group.analysis.exportColumns);
    const kind = aggregated ? 'grouped' : 'samples';
    download(
      `${safeName(`${group.name}_statistics_${kind}`)}.csv`,
      toCsv(tableRows(display, keys)),
      'text/csv',
    );
  };

  const exportStats = (kind: 'tidy' | 'wide') => {
    const ws = useStore.getState().ws;
    // Only the samples checked in the sidebar (cells are computed for those alone).
    const g = { ...group, sampleIds: shown };
    const cells = rows.flatMap((r) => (r.stale || !r.table ? [] : r.table.cells));
    const out = kind === 'tidy' ? tidyRows(ws, g, cells, APP_INFO.version) : wideRows(ws, g, cells);
    download(`${safeName(`${group.name}_statistics_${kind}`)}.csv`, toCsv(out), 'text/csv');
  };

  const exportGml = () => {
    const ws = useStore.getState().ws;
    download(
      `${safeName(group.name)}_template.gating-ml.xml`,
      exportGatingML(ws, group, { appVersion: APP_INFO.version }),
      'application/xml',
    );
    const withOv = [...new Set(group.overrides.map((o) => o.sampleId))];
    for (const sid of withOv)
      download(
        `${safeName(`${group.name}_${ws.samples[sid]?.fileName ?? sid}`)}_effective.gating-ml.xml`,
        exportGatingML(ws, group, { appVersion: APP_INFO.version, sampleId: sid }),
        'application/xml',
      );
  };

  const exportEvents = async (format: 'fcs' | 'csv', mode: 'raw' | 'compensated') => {
    const ws = useStore.getState().ws;
    const sid = selectedSample ?? group.sampleIds[0];
    if (!sid) return;
    const s = ws.samples[sid]!;
    const path = populationPath(group.template, popId);
    const bytes = await pool.exportEvents(contextFor(ws, group), sid, popId, mode, format, {
      FLOWMERIS_VERSION: `${APP_INFO.version} (${APP_INFO.commit})`,
      FLOWMERIS_SRC_SHA256: s.sha256,
      FLOWMERIS_SRC_FILE: s.fileName,
      FLOWMERIS_POPULATION: path,
      FLOWMERIS_VALUES: mode === 'raw' ? 'linearised, uncompensated' : 'linearised, compensated',
    });
    download(
      `${safeName(`${s.fileName.replace(/\.(fcs|lmd)$/i, '')}_${group.template.populations[popId]?.name ?? 'population'}`)}.${format}`,
      bytes,
    );
  };

  return (
    <div className="stats-view">
      <div className="toolbar">
        <strong>Statistics · {group.name}</strong>
        {shown.length < group.sampleIds.length && (
          <span className="muted">
            {shown.length} of {group.sampleIds.length} samples (sidebar selection)
          </span>
        )}
        {busy > 0 && <span className="muted">computing… {busy} sample(s) left</span>}
        <div className="spacer" />
        <ColumnsPicker group={group} table={perSample} />
        <button
          type="button"
          onClick={exportTable}
          disabled={!complete}
          title={
            aggregated
              ? 'The grouped table, with the chosen columns'
              : 'The table as shown, with the chosen columns'
          }
        >
          CSV (table)
        </button>
        <button
          type="button"
          onClick={() => exportStats('tidy')}
          disabled={!complete}
          title="One row per sample × population × statistic, with provenance"
        >
          CSV (tidy)
        </button>
        <button type="button" onClick={() => exportStats('wide')} disabled={!complete}>
          CSV (wide)
        </button>
        <button
          type="button"
          onClick={exportGml}
          title="Gating-ML 2.0 for the group template (+ effective gates of overridden samples)"
        >
          Gating-ML
        </button>
      </div>
      <div className="add-stat">
        <label className="field">
          Population
          <select value={form.pop} onChange={(e) => setForm({ ...form, pop: e.target.value })}>
            {pops.map((p) => (
              <option key={p.id} value={p.id}>
                {populationPath(group.template, p.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Statistic
          <select value={form.stat} onChange={(e) => setForm({ ...form, stat: e.target.value as StatKind })}>
            {VALUE_STATS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {form.stat === 'percentile' && (
          <label className="field">
            p
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              value={form.p}
              onChange={(e) => setForm({ ...form, p: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="field">
          Channel
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="">—</option>
            {group.channels.map((c) => (
              <option key={c} value={c}>
                {c}
                {marker(c) ? ` (${marker(c)})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={addStat}>
          Add statistic
        </button>
      </div>
      <div className="analysis-bar">
        <DerivedPanel group={group} columns={perSample.columns} errors={errors} valuesOf={valuesOf} />
        <GroupByPanel group={group} />
      </div>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              {sections.map((s, i) => (
                <th
                  key={`${s.id}${i}`}
                  colSpan={s.span}
                  className={
                    [s.id.startsWith('pop:') ? 'pop-head' : '', i > 0 ? 'sec-start' : '']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
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
                    className={sectionStart.has(c.key) ? 'sec-start' : undefined}
                  >
                    {summary ? shortLabel(byKey.get(c.source!) ?? c) : shortLabel(c)}
                    {specId && (
                      <button
                        type="button"
                        className="icon"
                        title="Remove statistic"
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
                      >
                        {fmt(r.values[c.key], statOf(c))}
                        {!aggregated && overridden.has(r.id) && <span className="badge warn">override</span>}
                        {!aggregated && missing[r.id] && <span className="badge danger">missing</span>}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        className={
                          [
                            c.type === 'categorical' ? 'text-cell' : '',
                            sectionStart.has(c.key) ? 'sec-start' : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                      >
                        {fmt(r.values[c.key], statOf(c))}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <span className="muted">
          Export events of the current population ({group.template.populations[popId]?.name}) for the selected
          sample:
        </span>
        <button
          type="button"
          onClick={() => void exportEvents('fcs', 'raw')}
          title="FCS 3.1 with linearised, uncompensated values; original keywords and $SPILLOVER kept"
        >
          FCS (raw)
        </button>
        <button type="button" onClick={() => void exportEvents('csv', 'compensated')}>
          CSV (compensated)
        </button>
      </div>
    </div>
  );
}
