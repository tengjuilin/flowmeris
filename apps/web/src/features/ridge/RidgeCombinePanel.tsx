import type { RidgeCombine } from '@flowmeris/model';
import { GroupPicker, toggleIds } from '../../components/ui/GroupPicker.tsx';
import { copyCombine } from '../../lib/ridgeStyle.ts';
import { useSampleNames, useStore } from '../../state/store.ts';
import { useRidge } from './useRidge.ts';

/** Card below the population tree: combine replicate samples into one ridge per combination of variables. */
export function RidgeCombinePanel() {
  const variables = useStore((s) => s.ws.variables);
  const { group, combine, follow, groups, update } = useRidge();
  const names = useSampleNames(group);
  if (!group) return null;
  const edit = (label: string, fn: (c: RidgeCombine) => void) =>
    update(label, (l, _w, g) => fn(g.ridgeFollow ? g.ridgeCombine : l.combine));
  // Following adopts the current population's settings for all; unfollowing gives each its own copy.
  const setFollow = (on: boolean) =>
    update(
      on ? 'Replicate settings follow the population' : 'Replicate settings per population',
      (l, _w, g) => {
        g.ridgeFollow = on;
        if (on) g.ridgeCombine = copyCombine(l.combine);
        else for (const x of g.layouts) if (x.kind === 'ridge') x.combine = copyCombine(g.ridgeCombine);
      },
    );
  const singles = groups.filter((r) => r.sampleIds.length === 1).length;
  return (
    <section className="ridge-combine" aria-label="Replicates">
      <div className="pane-title">Replicates</div>
      <label
        className="field check"
        title="Keep the same replicate settings when you switch to another population"
      >
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        Same settings for all populations
      </label>
      <label className="field check">
        <input
          type="checkbox"
          checked={combine.enabled}
          onChange={(e) => edit('Toggle combined replicates', (c) => void (c.enabled = e.target.checked))}
        />
        Combine replicates
      </label>
      {variables.length === 0 ? (
        <p className="muted small">
          Add sample variables (condition, dose…) in the Metadata tab; samples sharing their values are
          combined into one ridge.
        </p>
      ) : (
        <div className="ridge-combine-by sub-option">
          <span className="muted small">Samples sharing</span>
          {variables.map((v) => (
            <label key={v.id} className="field check">
              <input
                type="checkbox"
                checked={combine.by.includes(v.id)}
                onChange={(e) =>
                  edit('Change replicate grouping', (c) => {
                    c.by = e.target.checked
                      ? variables.map((x) => x.id).filter((id) => id === v.id || c.by.includes(id))
                      : c.by.filter((x) => x !== v.id);
                    c.enabled = true;
                  })
                }
              />
              {v.name}
            </label>
          ))}
        </div>
      )}
      <label className="field sub-option">
        Combine by
        <select
          value={combine.method}
          disabled={!combine.enabled}
          onChange={(e) =>
            edit(
              'Replicate combining method',
              (c) => void (c.method = e.target.value as RidgeCombine['method']),
            )
          }
        >
          <option value="mean">Average of replicate curves</option>
          <option value="pool">Pooled events</option>
        </select>
      </label>
      <p className="muted small sub-option">
        {combine.method === 'mean'
          ? 'Each replicate is normalized to unit area and the curves averaged: every replicate weighs the same.'
          : 'All replicates’ events are counted together: replicates with more events weigh more.'}
      </p>
      {combine.method === 'mean' && (
        <label className="field sub-option">
          Spread band
          <select
            value={combine.band}
            disabled={!combine.enabled}
            onChange={(e) =>
              edit('Replicate spread band', (c) => void (c.band = e.target.value as RidgeCombine['band']))
            }
          >
            <option value="none">None</option>
            <option value="sd">± SD</option>
            <option value="sem">± SEM</option>
          </select>
        </label>
      )}
      {combine.enabled && (
        <>
          <GroupPicker
            groups={groups.map((r) => ({
              id: r.id,
              label: r.label,
              members: r.sampleIds.map((id) => ({ id, label: names[id] ?? id })),
            }))}
            hidden={new Set(combine.hidden)}
            excluded={new Set(combine.exclude)}
            onShow={(ids, on) =>
              edit(on ? 'Show combined ridge' : 'Hide combined ridge', (c) => {
                c.hidden = toggleIds(c.hidden, ids, !on);
              })
            }
            onInclude={(ids, on) =>
              edit(on ? 'Include replicate' : 'Exclude replicate', (c) => {
                c.exclude = toggleIds(c.exclude, ids, !on);
              })
            }
            onShowAll={() =>
              edit('Show all combined ridges', (c) => {
                const ids = new Set(groups.flatMap((r) => [r.id, ...r.sampleIds]));
                c.hidden = c.hidden.filter((id) => !ids.has(id));
                c.exclude = c.exclude.filter((id) => !ids.has(id));
              })
            }
          />
          {singles > 0 && singles === groups.length && (
            <p className="muted small">No two checked samples share these values, so nothing is combined.</p>
          )}
        </>
      )}
    </section>
  );
}
