import { type Group, type Variable, removeVariable } from '@flowmeris/model';
import { useEffect, useState } from 'react';
import { addVariable, coerce, distinctValues, retype, setValue } from '../lib/metadata.ts';
import { type Series, fillSeries, samplesByWell, seriesSteps, seriesValue } from '../lib/plate.ts';
import { toast, useGroup, useStore } from '../state/store.ts';
import { InspectorTabs } from './ui/InspectorTabs.tsx';
import { Section } from './ui/Section.tsx';
import { DeleteIcon } from './ui/icons.tsx';

type MetaTab = 'variables' | 'values';
const META_TABS: { id: MetaTab; label: string }[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'values', label: 'Values' },
];

type Mutate = ReturnType<typeof useStore.getState>['mutate'];

/** Delete a variable and its values everywhere, after asking; true if deleted. */
export function deleteVariable(v: Variable, mutate: Mutate): boolean {
  if (!window.confirm(`Delete “${v.name}” and its values in all groups?`)) return false;
  mutate('Delete variable', (w) => removeVariable(w, v.id));
  return true;
}

/** Variable of the Metadata view: the selected one, else the first ('' = all cards closed, still the first). */
export function activeVariable(vars: Variable[], id: string | null): Variable | undefined {
  return vars.find((v) => v.id === id) ?? vars[0];
}

/** Category order of a categorical variable, reordered by dragging (or Alt+↑/↓ on a focused item). */
function LevelOrder({ v, levels }: { v: Variable; levels: string[] }) {
  const mutate = useStore((s) => s.mutate);
  // `slot`: where the dragged item would go, as an index between the items (0…levels.length).
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= levels.length) return;
    mutate('Reorder categories', (w) => {
      const order = [...levels];
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item!);
      w.variables.find((x) => x.id === v.id)!.levels = order;
    });
  };

  return (
    <ol className="level-list">
      {levels.map((l, i) => (
        <li
          key={l}
          draggable
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable to reorder with Alt+↑/↓.
          tabIndex={0}
          title="Drag, or Alt+↑/↓, to reorder"
          className={[
            drag?.from === i ? 'dragging' : '',
            drag && drag.slot === i ? 'drop-before' : '',
            drag && drag.slot === levels.length && i === levels.length - 1 ? 'drop-after' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', l);
            e.dataTransfer.effectAllowed = 'move';
            setDrag({ from: i, slot: i });
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const b = e.currentTarget.getBoundingClientRect();
            const slot = e.clientY < b.top + b.height / 2 ? i : i + 1;
            if (slot !== drag.slot) setDrag({ ...drag, slot });
          }}
          onDrop={(e) => {
            if (!drag) return;
            e.preventDefault();
            move(drag.from, drag.slot > drag.from ? drag.slot - 1 : drag.slot);
            setDrag(null);
          }}
          onDragEnd={() => setDrag(null)}
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
          }}
        >
          <span className="grip" aria-hidden="true">
            ⠿
          </span>
          {l}
        </li>
      ))}
    </ol>
  );
}

/** One variable's name, unit, type and category order. */
function VariableFields({ v }: { v: Variable }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const edit = (label: string, fn: (x: Variable) => void, merge?: string) =>
    mutate(label, (w) => fn(w.variables.find((x) => x.id === v.id)!), merge);
  const levels = v.type === 'categorical' ? distinctValues(ws, v, Object.keys(ws.samples)).map(String) : [];
  return (
    <div className="variable-fields">
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
        <div className="field tt-wide">
          Category order
          <LevelOrder v={v} levels={levels} />
        </div>
      )}
    </div>
  );
}

/** Set a value on, or fill a numeric series across, the wells selected on the plate map. */
function ValuesTab({ group, variable }: { group: Group; variable: Variable | undefined }) {
  const ws = useStore((s) => s.ws);
  const mutate = useStore((s) => s.mutate);
  const plateSel = useStore((s) => s.ui.plateSel);
  const [open, setOpen] = useState({ set: true, series: true });
  const [raw, setRaw] = useState('');
  const [series, setSeries] = useState({
    start: '100',
    factor: '0.5',
    op: 'mul' as 'mul' | 'add',
    along: 'cols' as 'cols' | 'rows',
  });

  if (!variable) return null;

  const byWell = samplesByWell(ws, group.sampleIds);
  const selected = plateSel.flatMap((w) => byWell.get(w) ?? []);
  // Nothing to act on: actions are disabled rather than failing with a message.
  const none = selected.length === 0;
  const levels = distinctValues(ws, variable, group.sampleIds);

  const apply = (value: number | string | null, label: string) => {
    if (selected.length === 0) {
      toast('Select wells that contain samples first.');
      return;
    }
    mutate(label, (w) => {
      for (const id of selected) setValue(w, id, variable.id, value);
    });
  };

  const set = () => {
    const v = coerce(variable, raw);
    if (v === undefined) {
      toast(`“${raw}” is not a number.`);
      return;
    }
    apply(v, `Set ${variable.name}`);
  };

  const fill: Series = { ...series, start: Number(series.start), step: Number(series.factor) };
  const seriesOk =
    series.start.trim() !== '' && series.factor.trim() !== '' && Number.isFinite(fill.start + fill.step);
  const steps = seriesSteps(plateSel, series.along);

  const fillSelection = () => {
    if (!seriesOk) {
      toast('Series start and step must be numbers.');
      return;
    }
    mutate(`Fill ${variable.name} series`, (w) => fillSeries(w, variable.id, plateSel, byWell, fill));
  };

  return (
    <>
      <p className="small meta-selection">
        <strong>{plateSel.length}</strong> {plateSel.length === 1 ? 'well' : 'wells'},{' '}
        <strong>{selected.length}</strong> {selected.length === 1 ? 'sample' : 'samples'}
      </p>
      <Section
        id="setValue"
        title={`Set ${variable.name}`}
        open={open.set}
        onToggle={() => setOpen({ ...open, set: !open.set })}
      >
        <div className="row value-row">
          <input
            type="text"
            autoComplete="off"
            value={raw}
            placeholder={variable.type === 'numeric' ? 'Number' : 'Value'}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && raw.trim() !== '' && !none && set()}
            aria-label={`Value of ${variable.name}`}
          />
          <button type="button" className="primary" onClick={set} disabled={raw.trim() === '' || none}>
            Set
          </button>
          <button
            type="button"
            disabled={none}
            title={`Remove ${variable.name} from the selected samples`}
            onClick={() => apply(null, `Clear ${variable.name}`)}
          >
            Clear
          </button>
        </div>
        {variable.type === 'categorical' && levels.length > 0 && (
          <div className="level-picks">
            {levels.map((l) => (
              <button
                key={String(l)}
                type="button"
                className="chip"
                disabled={none}
                title={`Set ${variable.name} to ${String(l)}`}
                onClick={() => apply(String(l), `Set ${variable.name}`)}
              >
                {String(l)}
              </button>
            ))}
          </div>
        )}
      </Section>
      {variable.type === 'numeric' && (
        <Section
          id="fillSeries"
          title="Fill series"
          open={open.series}
          onToggle={() => setOpen({ ...open, series: !open.series })}
        >
          <label className="field">
            Start
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={series.start}
              onChange={(e) => setSeries({ ...series, start: e.target.value })}
            />
          </label>
          <div className="field">
            Step
            <div className="step-input">
              <div className="seg">
                {(['mul', 'add'] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    className={series.op === op ? 'on' : ''}
                    aria-pressed={series.op === op}
                    title={op === 'mul' ? 'Multiply by' : 'Add'}
                    onClick={() => setSeries({ ...series, op })}
                  >
                    {op === 'mul' ? '×' : '+'}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={series.op === 'mul' ? 'Factor' : 'Step'}
                value={series.factor}
                onChange={(e) => setSeries({ ...series, factor: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            Along
            <div className="seg">
              {(['cols', 'rows'] as const).map((along) => (
                <button
                  key={along}
                  type="button"
                  className={series.along === along ? 'on' : ''}
                  aria-pressed={series.along === along}
                  onClick={() => setSeries({ ...series, along })}
                >
                  {along === 'cols' ? 'Columns →' : 'Rows ↓'}
                </button>
              ))}
            </div>
          </div>
          {seriesOk && steps.length > 0 && (
            <p className="series-preview small" aria-label="Series preview">
              Values: {steps.map((_, i) => seriesValue(fill, i)).join(', ')}
            </p>
          )}
          <button type="button" className="primary wide" onClick={fillSelection} disabled={none || !seriesOk}>
            Fill selection
          </button>
        </Section>
      )}
    </>
  );
}

/** Settings panel of the Metadata view: the variables (cards), and setting values on the plate map. */
export function MetadataInspector() {
  const group = useGroup();
  const vars = useStore((s) => s.ws.variables);
  const mode = useStore((s) => s.views.metaMode);
  const metaVarId = useStore((s) => s.ui.metaVarId);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  // The plate map opens on Values (what it is for), the table on Variables.
  const [tab, setTab] = useState<MetaTab>(mode === 'plate' ? 'values' : 'variables');
  useEffect(() => setTab(mode === 'plate' ? 'values' : 'variables'), [mode]);
  if (!group) return null;
  // Values act on the plate map's selected wells, so that tab is for the plate map only.
  const shown: MetaTab = mode === 'plate' ? tab : 'variables';
  const openId = metaVarId ?? vars[0]?.id;

  const add = (type: Variable['type']) => {
    let id = '';
    mutate('Add variable', (w) => void (id = addVariable(w, type === 'numeric' ? 'Dose' : 'Group', type)));
    setUi({ metaVarId: id });
  };

  return (
    <aside className="inspector insp-panel meta-inspector" aria-label="Metadata settings">
      <div className="insp-head">
        <InspectorTabs
          idPrefix="meta"
          label="Metadata settings"
          tabs={META_TABS.map((t) =>
            t.id === 'values' && mode !== 'plate'
              ? { ...t, disabled: true, title: 'Values are set on the plate map' }
              : t,
          )}
          current={shown}
          onSelect={setTab}
        />
        {shown === 'variables' && (
          <div className="row meta-add">
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
        )}
      </div>
      <div id="meta-tabpanel" role="tabpanel" aria-labelledby={`meta-tab-${shown}`}>
        {shown === 'variables' ? (
          vars.map((v) => (
            <Section
              key={v.id}
              id={`var-${v.id}`}
              title={`${v.name}${v.unit ? ` (${v.unit})` : ''}`}
              open={openId === v.id}
              // Closing leaves no card open ('' matches none); the plate map then shows the first variable.
              onToggle={() => setUi({ metaVarId: openId === v.id ? '' : v.id })}
              actions={
                <>
                  <span className="muted small var-type">{v.type === 'numeric' ? '#' : 'abc'}</span>
                  <button
                    type="button"
                    className="icon reset-btn danger-icon"
                    title={`Delete variable ${v.name}`}
                    aria-label={`Delete variable ${v.name}`}
                    onClick={() => deleteVariable(v, mutate)}
                  >
                    <DeleteIcon />
                  </button>
                </>
              }
            >
              <VariableFields v={v} />
            </Section>
          ))
        ) : (
          <ValuesTab group={group} variable={activeVariable(vars, metaVarId)} />
        )}
      </div>
    </aside>
  );
}
