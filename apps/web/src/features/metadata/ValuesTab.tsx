import type { Group, Variable } from '@flowmeris/model';
import { useState } from 'react';
import { Card } from '../../components/ui/settings/index.ts';
import { coerce, distinctValues, setValue } from '../../lib/metadata.ts';
import { type Series, fillSeries, samplesByWell, seriesSteps, seriesValue } from '../../lib/plate.ts';
import { toast, useStore } from '../../state/store.ts';

/** Set a value on, or fill a numeric series across, the wells selected on the plate map. */
export function ValuesTab({ group, variable }: { group: Group; variable: Variable | undefined }) {
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
      <Card
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
      </Card>
      {variable.type === 'numeric' && (
        <Card
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
        </Card>
      )}
    </>
  );
}
