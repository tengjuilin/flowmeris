import { type Group, type StatKind, type StatSpec, newId, populationPath } from '@flowmeris/model';
import type { Table } from '@flowmeris/table';
import { useState } from 'react';
import { exportColumnSections, toggleExportColumns } from '../../lib/statsExport.ts';
import { toast, useStore } from '../../state/store.ts';

import { AGG_FUNCS, VALUE_STATS } from './options.ts';
import { useGroupMutate } from './useGroupMutate.ts';

export function AddStatForm({
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

export function GroupByFields({ group }: { group: Group }) {
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

export function SummaryFields({ group }: { group: Group }) {
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
export function ColumnsChecklist({ group, table }: { group: Group; table: Table }) {
  const edit = useGroupMutate(group.id);
  const selected = group.analysis.exportColumns;
  const on = new Set(selected ?? table.columns.map((c) => c.key));
  const set = (keys: string[] | undefined) =>
    edit('Choose export columns', (g) => void (g.analysis.exportColumns = keys));
  const toggle = (keys: string[], value: boolean) => set(toggleExportColumns(table, selected, keys, value));
  const sections = exportColumnSections(table, group);
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
