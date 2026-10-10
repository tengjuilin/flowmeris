import { type DerivedColumn, type Group, type Variable, dropColumns, newId } from '@flowmeris/model';
import type { Cell, ColumnDef } from '@flowmeris/table';
import { useState } from 'react';
import {
  columnsBefore,
  defaultNormalizeSource,
  derivedSummary,
  normalizeAutoName,
} from '../../lib/derived.ts';
import { checkFormula } from '../../lib/formula.ts';
import { DEFAULT_SIG_FIGS } from '../../lib/statsFormat.ts';
import { useStore } from '../../state/store.ts';

import { FormulaError, FormulaInput } from './FormulaInput.tsx';
import { useGroupMutate } from './useGroupMutate.ts';

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
      source: defaultNormalizeSource(props.columns),
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
  const autoName = normalizeAutoName(d, props.columns, variables);
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

/** The Derived columns card: the list of formula and normalization columns, and their forms. */
export function DerivedPanel(props: {
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
  const before = (id?: string) => columnsBefore(props.columns, id);
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
                <div className="derived-detail mono">{derivedSummary(d, variables)}</div>
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
