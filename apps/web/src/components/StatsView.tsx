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
import { type Cell, type ColumnDef, type Table, tableRows } from '@flowmeris/table';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pool } from '../engine-client/pool.ts';
import { download, safeName } from '../lib/download.ts';
import { stripDataExt } from '../lib/files.ts';
import { PLAIN_DECIMAL, fracDigits } from '../lib/format.ts';
import { type Completion, type FormulaProblem, checkFormula, completionsAt } from '../lib/formula.ts';
import { DEFAULT_SIG_FIGS, exportKeys, fmtStat as fmt, sectionOf } from '../lib/statsFormat.ts';
import type { StatColumn } from '../lib/statsTable.ts';
import { useAnalysisTable } from '../state/hooks/stats.ts';
import { APP_INFO, contextFor, toast, useGroup, useStore } from '../state/store.ts';
import { ExportIcon } from './ExportMenu.tsx';
import { ActionRow, Section } from './Inspector.tsx';

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

/** Significant-figures input of the derived-column forms. */
function SigFigsField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="field" title="Digits the table shows for this column; exports keep full precision">
      Significant figures
      <input
        type="number"
        min={1}
        max={15}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n) && n >= 1) onChange(Math.min(15, n));
        }}
      />
    </label>
  );
}

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

function useGroupMutate(groupId: string) {
  const mutate = useStore((s) => s.mutate);
  return (label: string, fn: (g: Group) => void, merge?: string) =>
    mutate(label, (w) => fn(w.groups.find((x) => x.id === groupId)!), merge);
}

// ---------------------------------------------------------------------------
// Derived columns
// ---------------------------------------------------------------------------

/** Formula input that suggests column names (typed, or after “[”) and function names at the caret. */
function FormulaInput(props: {
  value: string;
  columns: ColumnDef[];
  onChange: (expr: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const { value } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Caret to restore after a completion is inserted, as soon as the new value is in the DOM.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(at, at);
  });
  // Grow with the formula instead of scrolling inside the box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  const items = caret === null || dismissed ? [] : completionsAt(value, caret, props.columns);
  const open = items.length > 0;
  const sync = () => {
    const el = ref.current;
    if (el && document.activeElement === el) setCaret(el.selectionStart);
  };
  const accept = (c: Completion) => {
    const next = value.slice(0, c.from) + c.insert + value.slice(c.to);
    const at = c.from + c.insert.length;
    props.onChange(next);
    setCaret(at);
    setActive(0);
    pendingCaret.current = at;
  };
  return (
    <div className="formula-input">
      <textarea
        ref={ref}
        rows={2}
        className="mono"
        aria-label="Formula"
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.invalid ? 'formula-error' : undefined}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="formula-completions"
        aria-activedescendant={open ? `formula-completion-${active}` : undefined}
        spellCheck={false}
        autoComplete="off"
        value={value}
        placeholder="[CD4+ | Median PE-A] / [CD4+ | Median FITC-A]"
        onChange={(e) => {
          props.onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setActive(0);
          setDismissed(false);
        }}
        onSelect={sync}
        onFocus={sync}
        onBlur={() => {
          setCaret(null);
          props.onBlur?.();
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const d = e.key === 'ArrowDown' ? 1 : -1;
            setActive((i) => (i + d + items.length) % items.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            accept(items[Math.min(active, items.length - 1)]!);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }
        }}
      />
      {open && (
        // biome-ignore lint/a11y/useSemanticElements: a native <select> cannot be the popup of a text input; this is the ARIA combobox pattern
        <div id="formula-completions" className="formula-completions" role="listbox" tabIndex={-1}>
          {items.map((c, i) => (
            <div
              key={`${c.kind}:${c.label}`}
              id={`formula-completion-${i}`}
              // biome-ignore lint/a11y/useSemanticElements: options of the ARIA combobox above; the input keeps the focus
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className={i === active ? 'on' : undefined}
              // Keep the focus (and caret) in the input.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="completion-kind">{c.kind === 'function' ? 'ƒ' : '[ ]'}</span>
              <span className={c.kind === 'function' ? 'mono' : undefined}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The error message, and the formula with the part it is about marked. */
function FormulaError({ expr, problem, id }: { expr: string; problem: FormulaProblem; id?: string }) {
  const { from, to } = problem;
  return (
    <div className="formula-error" id={id} role="alert">
      <div className="formula-error-msg">
        {problem.message}
        {from < expr.length ? ` (at character ${from + 1})` : ''}
      </div>
      <div className="formula-error-src mono">
        {expr.slice(0, from)}
        <mark className={to > from ? undefined : 'gap'}>{to > from ? expr.slice(from, to) : '\u00a0'}</mark>
        {expr.slice(to)}
      </div>
    </div>
  );
}

function FormulaForm(props: {
  initial?: Extract<DerivedColumn, { kind: 'formula' }>;
  columns: ColumnDef[];
  onSave: (d: Extract<DerivedColumn, { kind: 'formula' }>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? 'Formula');
  const [expr, setExpr] = useState(props.initial?.expr ?? '');
  const [sigFigs, setSigFigs] = useState(props.initial?.sigFigs ?? DEFAULT_SIG_FIGS);
  // The problem is shown once the user leaves the box or tries to add; after that it updates as they type.
  const [checked, setChecked] = useState(!!props.initial);
  const problem = expr.trim() ? checkFormula(expr, props.columns) : null;
  const shown = checked ? problem : null;
  return (
    <div className="derived-form">
      <label className="field">
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field stack">
        Formula
        <FormulaInput
          value={expr}
          columns={props.columns}
          onChange={setExpr}
          onBlur={() => expr.trim() && setChecked(true)}
          invalid={!!shown}
        />
      </div>
      {shown && <FormulaError id="formula-error" expr={expr} problem={shown} />}
      <SigFigsField value={sigFigs} onChange={setSigFigs} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!expr.trim() || !!shown}
          onClick={() => {
            setChecked(true);
            if (problem) return;
            props.onSave({
              id: props.initial?.id ?? newId('dc_'),
              name: name.trim() || 'Formula',
              kind: 'formula',
              expr,
              sigFigs,
            });
          }}
        >
          {props.initial ? 'Save' : 'Add'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
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
          Normalization needs a sample variable (Metadata tab) to pick reference samples.
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
      <label className="field stack">
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
        <span className="row wrap">
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
      <SigFigsField value={d.sigFigs ?? DEFAULT_SIG_FIGS} onChange={(n) => setD({ ...d, sigFigs: n })} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!d.source || d.refValue === ''}
          onClick={() =>
            props.onSave({ ...d, name: d.name.trim() || autoName, sigFigs: d.sigFigs ?? DEFAULT_SIG_FIGS })
          }
        >
          {props.initial ? 'Save' : 'Add'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
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
    <div className="derived-panel">
      {derived.length > 0 && (
        <ul className="derived-list">
          {derived.map((d) => (
            <li key={d.id}>
              <strong className="derived-name">{d.name}</strong>
              <button
                type="button"
                className="icon"
                title="Edit"
                aria-label="Edit derived column"
                onClick={() => setForm({ kind: d.kind, id: d.id })}
              >
                ✎
              </button>
              <button
                type="button"
                className="icon"
                title="Remove derived column"
                aria-label="Remove derived column"
                onClick={() =>
                  edit('Remove derived column', (g) => dropColumns(g, new Set([`derived:${d.id}`])))
                }
              >
                ✕
              </button>
              {!(props.errors[d.id] && d.kind === 'formula') && (
                <div className="derived-detail mono">
                  {d.kind === 'formula'
                    ? `= ${d.expr}`
                    : `${d.mode} to ${variables.find((v) => v.id === d.refVariable)?.name ?? '?'} = ${d.refValue}${d.within.length ? ` within ${d.within.map((w) => variables.find((v) => v.id === w)?.name ?? '?').join(', ')}` : ''}`}
                </div>
              )}
              {props.errors[d.id] && d.kind !== 'formula' && (
                <span className="badge danger">{props.errors[d.id]}</span>
              )}
              {props.errors[d.id] && d.kind === 'formula' && (
                <FormulaError
                  expr={d.expr}
                  problem={
                    checkFormula(d.expr, before(d.id)) ?? {
                      message: props.errors[d.id]!,
                      from: 0,
                      to: d.expr.length,
                    }
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button
          type="button"
          className={form?.kind === 'formula' && !form.id ? 'on' : undefined}
          aria-pressed={form?.kind === 'formula' && !form.id}
          onClick={() => setForm(form?.kind === 'formula' && !form.id ? null : { kind: 'formula' })}
          title="A new column computed from others, e.g. a ratio"
        >
          + Formula
        </button>
        <button
          type="button"
          className={form?.kind === 'normalize' && !form.id ? 'on' : undefined}
          aria-pressed={form?.kind === 'normalize' && !form.id}
          onClick={() => setForm(form?.kind === 'normalize' && !form.id ? null : { kind: 'normalize' })}
          title="Fold change or percent of a reference condition (e.g. untreated, dose 0)"
        >
          + Normalization
        </button>
      </div>
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
      ) : null}
    </div>
  );
}

function AddStatForm({
  group,
  pops,
  marker,
}: {
  group: Group;
  pops: { id: string }[];
  marker: (c?: string) => string | undefined;
}) {
  const popId = useStore((s) => s.ui.popId);
  const edit = useGroupMutate(group.id);
  const [form, setForm] = useState<{ pop: string; stat: StatKind; channel: string; p: number }>({
    pop: popId,
    stat: 'median',
    channel: '',
    p: 50,
  });
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
  return (
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
      <button type="button" className="primary" onClick={addStat}>
        Add statistic
      </button>
    </div>
  );
}

function GroupByFields({ group }: { group: Group }) {
  const variables = useStore((s) => s.ws.variables);
  const edit = useGroupMutate(group.id);
  const agg = group.analysis.aggregate;
  return (
    <>
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
      {variables.length === 0 ? (
        <p className="muted small">
          Add sample variables (condition, dose…) in the Metadata tab; rows sharing their values are combined
          into one.
        </p>
      ) : (
        <div className="stats-check-list sub-option">
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
      )}
    </>
  );
}

function SummaryFields({ group }: { group: Group }) {
  const edit = useGroupMutate(group.id);
  const agg = group.analysis.aggregate;
  return (
    <div className="stats-check-list">
      {AGG_FUNCS.map((f) => (
        <label key={f.id} className="field check" title={f.title}>
          <input
            type="checkbox"
            checked={agg.funcs.includes(f.id)}
            onChange={(e) =>
              edit('Change summaries', (g) => {
                const a = g.analysis.aggregate;
                const on = new Set(e.target.checked ? [...a.funcs, f.id] : a.funcs.filter((x) => x !== f.id));
                a.funcs = AGG_FUNCS.map((x) => x.id).filter((x) => on.has(x));
              })
            }
          />
          {f.label}
        </label>
      ))}
    </div>
  );
}

/** The per-sample columns the "CSV (table)" export includes, as a checklist by section. */
function ColumnsChecklist({ group, table }: { group: Group; table: Table }) {
  const edit = useGroupMutate(group.id);
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
    <div className="columns-menu">
      <div className="row">
        <span className="muted small">
          Columns ({n}/{table.columns.length})
        </span>
        <div className="spacer" />
        <button type="button" className="link" onClick={() => set(undefined)}>
          all
        </button>
        <button type="button" className="link" onClick={() => set(['sample:name'])}>
          none
        </button>
      </div>
      <div className="columns-scroll">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

type StatsTab = 'statistics' | 'replicates' | 'export';
type StatsSectionId =
  | 'addStat'
  | 'derived'
  | 'combine'
  | 'summaries'
  | 'tableCsv'
  | 'statsCsv'
  | 'gatingMl'
  | 'events';

const STATS_TABS: { id: StatsTab; label: string }[] = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'replicates', label: 'Replicates' },
  { id: 'export', label: 'Export' },
];

const STATS_PANEL_KEY = 'flowmeris.statsPanel';
const STATS_DEFAULT_OPEN: Partial<Record<StatsSectionId, boolean>> = {
  addStat: true,
  derived: true,
  combine: true,
  summaries: true,
  tableCsv: true,
  statsCsv: true,
  gatingMl: true,
  events: true,
};

/** The last tab and open sections, remembered in this browser. */
function loadStatsPanel(): { tab: StatsTab; open: Partial<Record<StatsSectionId, boolean>> } {
  try {
    const saved = JSON.parse(localStorage.getItem(STATS_PANEL_KEY) ?? 'null');
    if (saved && STATS_TABS.some((t) => t.id === saved.tab))
      return { tab: saved.tab, open: { ...STATS_DEFAULT_OPEN, ...saved.open } };
  } catch {}
  return { tab: 'statistics', open: STATS_DEFAULT_OPEN };
}

function saveStatsPanel(panel: { tab: StatsTab; open: Partial<Record<StatsSectionId, boolean>> }) {
  try {
    localStorage.setItem(STATS_PANEL_KEY, JSON.stringify(panel));
  } catch {}
}

/** Settings panel of the Statistics view: statistics and derived columns, replicates, exports. */
export function StatsInspector() {
  const popId = useStore((s) => s.ui.popId);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const group = useGroup();
  const { stats, perSample, aggregated, errors } = useAnalysisTable(group);
  const { pops, rows, busy, complete, marker, shown } = stats;
  const [panel, setPanel] = useState(loadStatsPanel);
  const { tab, open } = panel;
  const changePanel = (fn: (p: typeof panel) => typeof panel) =>
    setPanel((p) => {
      const next = fn(p);
      saveStatsPanel(next);
      return next;
    });
  const setTab = (t: StatsTab) => changePanel((p) => ({ ...p, tab: t }));
  const toggle = (id: StatsSectionId) =>
    changePanel((p) => ({ ...p, open: { ...p.open, [id]: !p.open[id] } }));

  if (!group) return null;
  const display = aggregated ?? perSample;

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
      `${safeName(`${stripDataExt(s.fileName)}_${group.template.populations[popId]?.name ?? 'population'}`)}.${format}`,
      bytes,
    );
  };

  const eventSample = useStore.getState().ws.samples[selectedSample ?? group.sampleIds[0] ?? ''];
  const pending = complete ? '' : ' (statistics are still being computed)';

  return (
    <aside className="inspector ridge-inspector stats-inspector" aria-label="Statistics settings">
      <div className="ridge-inspector-head">
        <div className="tabs ridge-tabs" role="tablist" aria-label="Statistics settings">
          {STATS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`stats-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="stats-tabpanel"
              className={tab === t.id ? 'on' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {(shown.length < group.sampleIds.length || busy > 0) && (
          <p className="muted small stats-status">
            {shown.length < group.sampleIds.length &&
              `${shown.length} of ${group.sampleIds.length} samples (sidebar selection)`}
            {shown.length < group.sampleIds.length && busy > 0 && ' · '}
            {busy > 0 && `computing… ${busy} sample(s) left`}
          </p>
        )}
      </div>
      <div id="stats-tabpanel" role="tabpanel" aria-labelledby={`stats-tab-${tab}`}>
        {tab === 'statistics' && (
          <>
            <Section
              id="addStat"
              title="New statistic"
              open={!!open.addStat}
              onToggle={() => toggle('addStat')}
            >
              <AddStatForm group={group} pops={pops} marker={marker} />
            </Section>
            <Section
              id="derived"
              title="Derived columns"
              open={!!open.derived}
              onToggle={() => toggle('derived')}
            >
              <DerivedPanel group={group} columns={perSample.columns} errors={errors} valuesOf={valuesOf} />
            </Section>
          </>
        )}
        {tab === 'replicates' && (
          <>
            <Section
              id="combine"
              title="Combine replicates"
              open={!!open.combine}
              onToggle={() => toggle('combine')}
            >
              <GroupByFields group={group} />
            </Section>
            <Section
              id="summaries"
              title="Summaries"
              open={!!open.summaries}
              onToggle={() => toggle('summaries')}
            >
              <SummaryFields group={group} />
            </Section>
          </>
        )}
        {tab === 'export' && (
          <>
            <Section
              id="tableCsv"
              title="Statistics table"
              open={!!open.tableCsv}
              onToggle={() => toggle('tableCsv')}
            >
              <ActionRow
                label="CSV (table)"
                title={
                  (aggregated
                    ? 'Download the grouped table, with the chosen columns'
                    : 'Download the table as shown, with the chosen columns') + pending
                }
                icon={<ExportIcon />}
                disabled={!complete}
                onClick={exportTable}
              />
              <ColumnsChecklist group={group} table={perSample} />
            </Section>
            <Section
              id="statsCsv"
              title="Statistics with provenance"
              open={!!open.statsCsv}
              onToggle={() => toggle('statsCsv')}
            >
              <ActionRow
                label="CSV (tidy)"
                title={`Download one row per sample × population × statistic, with provenance${pending}`}
                icon={<ExportIcon />}
                disabled={!complete}
                onClick={() => exportStats('tidy')}
              />
              <ActionRow
                label="CSV (wide)"
                title={`Download one row per sample, one column per population × statistic${pending}`}
                icon={<ExportIcon />}
                disabled={!complete}
                onClick={() => exportStats('wide')}
              />
            </Section>
            <Section id="gatingMl" title="Gates" open={!!open.gatingMl} onToggle={() => toggle('gatingMl')}>
              <ActionRow
                label="Gating-ML"
                title="Download Gating-ML 2.0 for the group template (+ effective gates of overridden samples)"
                icon={<ExportIcon />}
                disabled={false}
                onClick={exportGml}
              />
            </Section>
            <Section id="events" title="Events" open={!!open.events} onToggle={() => toggle('events')}>
              <ActionRow
                label="FCS (raw)"
                title="Download FCS 3.1 with linearised, uncompensated values; original keywords and $SPILLOVER kept"
                icon={<ExportIcon />}
                disabled={!eventSample}
                onClick={() => void exportEvents('fcs', 'raw')}
              />
              <ActionRow
                label="CSV (compensated)"
                title="Download the events as CSV, linearised and compensated"
                icon={<ExportIcon />}
                disabled={!eventSample}
                onClick={() => void exportEvents('csv', 'compensated')}
              />
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

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
    c.func === 'n'
      ? 'n'
      : c.func === 'cv'
        ? 'cv'
        : c.kind === 'variable'
          ? 'value'
          : statByKey.get(c.source ?? c.key)?.stat;
  // Derived columns (and their replicate summaries) show their own significant figures; summaries of
  // a sample variable (e.g. the mean dose of a group) the default ones.
  const derivedById = new Map(group.analysis.derived.map((d) => [d.id, d]));
  const sigOf = (c: ColumnDef): number | undefined => {
    const key = c.source ?? c.key;
    if (byKey.get(key)?.kind === 'variable') return DEFAULT_SIG_FIGS;
    if (!key.startsWith('derived:')) return undefined;
    return derivedById.get(key.slice('derived:'.length))?.sigFigs ?? DEFAULT_SIG_FIGS;
  };
  // Longest fractional part of each column, so its decimal points line up.
  const fracLen = new Map<string, number>();
  for (const c of display.columns) {
    if (c.type !== 'numeric') continue;
    let n = 0;
    for (const row of display.rows) {
      const v = row.values[c.key];
      if (typeof v === 'number') n = Math.max(n, fracDigits(fmt(v, statOf(c), sigOf(c))));
    }
    fracLen.set(c.key, n);
  }

  // Columns pinned on horizontal scroll: the sample name, or every column the replicates are combined by.
  const nPin = aggregated
    ? Math.max(
        1,
        display.columns.findIndex((c) => c.kind === 'aggregate'),
      )
    : 1;
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
                        {fmt(r.values[c.key], statOf(c), sigOf(c))}
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
                        {alignedNumber(fmt(r.values[c.key], statOf(c), sigOf(c)), fracLen.get(c.key) ?? 0)}
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
