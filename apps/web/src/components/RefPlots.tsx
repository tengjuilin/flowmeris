import type { Group, PlotSpec, RefPlot, Workspace } from '@flowmeris/model';
import { populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useRef } from 'react';
import { groupSample } from '../lib/axisDefaults.ts';
import { axisPickers } from '../state/commands/plots.ts';
import { addRef, editRef, removeRef } from '../state/commands/refPlots.ts';
import { useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { AxisSelects, PlotKindSelect } from './PlotPanel.tsx';
import { useSize } from './hooks/useSize.ts';

/** Short tab label: "<x> × <y>" by marker name ($PnS) when there is one. */
function tabLabel(ws: Workspace, g: Group, r: RefPlot): string {
  const s = groupSample(ws, g);
  const name = (c: string) => s?.channels.find((x) => x.pnn === c)?.pns || c;
  return r.kind === 'histogram' || !r.y ? name(r.x.channel) : `${name(r.x.channel)} × ${name(r.y.channel)}`;
}

/** Tabbed, read-only reference plots under the population tree of the Gate view. */
export function RefPlots() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const missing = useStore((s) => s.status.missing);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  if (!group) return null;

  const refs = group.refPlots;
  const ref = refs.find((r) => r.id === ui.refPlotId) ?? refs[0];
  const curPop = group.template.populations[ui.popId] ? ui.popId : 'root';
  const curSample = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];

  const tabs = (
    <div className="tab-strip" role="tablist" aria-label="Reference plots">
      {refs.map((r) => (
        <div key={r.id} className={`tab-strip-tab${r.id === ref?.id ? ' on' : ''}`}>
          <button
            type="button"
            role="tab"
            aria-selected={r.id === ref?.id}
            onClick={() => setUi({ refPlotId: r.id })}
            title={tabLabel(ws, group, r)}
          >
            {tabLabel(ws, group, r)}
          </button>
          <button
            type="button"
            className="icon"
            title="Close reference plot"
            onClick={() => removeRef(group.id, r.id)}
            aria-label="Close reference plot"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M2 2l6 6M8 2 2 8" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        className="icon tab-strip-add"
        title="Add a reference plot"
        onClick={() => addRef(group.id)}
        aria-label="Add a reference plot"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 1.5v7M1.5 5h7" />
        </svg>
      </button>
    </div>
  );

  if (!ref) {
    return (
      <div className="ref-plots">
        <div className="pane-title">Reference plots</div>
        <div className="empty small">
          <button type="button" onClick={() => addRef(group.id)}>
            Add a reference plot
          </button>
          <span className="muted">A read-only plot to look at while gating, e.g. another channel pair.</span>
        </div>
      </div>
    );
  }

  // Pins that no longer resolve (sample removed from the group) fall back to following.
  const popId = ref.population && group.template.populations[ref.population] ? ref.population : curPop;
  const sampleId = ref.sampleId && group.sampleIds.includes(ref.sampleId) ? ref.sampleId : curSample;
  const plot: PlotSpec = {
    id: ref.id,
    population: popId,
    kind: ref.kind,
    x: ref.x,
    style: ref.style,
    ...(ref.y ? { y: ref.y } : {}),
  };
  const gated = group.template.populations[curPop];
  const canBackgate = curPop !== popId && curPop !== 'root' && !!gated;
  const backgate = ref.backgate && canBackgate && gated ? { popId: curPop, color: gated.color } : undefined;
  const edit = (label: string, fn: (r: RefPlot, g: Group, w: Workspace) => void) =>
    editRef(group.id, ref.id, label, fn);

  return (
    <div className="ref-plots">
      {tabs}
      <div className="ref-controls">
        <label className="field">
          Population
          <select
            value={ref.population ?? ''}
            onChange={(e) =>
              edit('Change reference population', (r) => {
                if (e.target.value) r.population = e.target.value;
                else r.population = undefined;
              })
            }
          >
            <option value="">
              Follow current ({group.template.populations[curPop]?.name ?? 'All events'})
            </option>
            {populationsDepthFirst(group.template).map((p) => (
              <option key={p.id} value={p.id}>
                {'  '.repeat(populationLineage(group.template, p.id).length - 1)}
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Sample
          <select
            value={ref.sampleId ?? ''}
            onChange={(e) =>
              edit('Change reference sample', (r) => {
                if (e.target.value) r.sampleId = e.target.value;
                else r.sampleId = undefined;
              })
            }
          >
            <option value="">
              Follow current ({curSample ? (names[curSample] ?? ws.samples[curSample]?.fileName) : '–'})
            </option>
            {group.sampleIds.map((id) => (
              <option key={id} value={id}>
                {names[id] ?? ws.samples[id]?.fileName ?? id}
              </option>
            ))}
          </select>
        </label>
        <PlotKindSelect group={group} plot={plot} edit={edit} />
        <AxisSelects group={group} plot={plot} edit={edit} />
        <label
          className="field check"
          title={
            canBackgate
              ? `Overlay ${gated?.name}, the population being gated, in its colour`
              : 'Backgating needs a gated population other than the one this plot shows'
          }
        >
          <input
            type="checkbox"
            checked={ref.backgate}
            disabled={!canBackgate}
            onChange={(e) => edit('Toggle reference backgating', (r) => void (r.backgate = e.target.checked))}
          />
          Backgate {canBackgate ? gated?.name : ''}
        </label>
      </div>
      {!sampleId ? (
        <div className="empty">This group has no samples.</div>
      ) : missing[sampleId] ? (
        <div className="empty">Data not loaded for this sample: re-add its FCS file to view it.</div>
      ) : (
        <RefCanvas
          ws={ws}
          group={group}
          sampleId={sampleId}
          plot={plot}
          backgate={backgate}
          pickers={axisPickers(group, plot, edit)}
        />
      )}
    </div>
  );
}

/** Plot filling its box, which CSS keeps square (wider than tall when stacked) so the side column is laid
 * out before the plot draws (own component so the size observer mounts with its box). */
function RefCanvas({
  ws,
  group,
  sampleId,
  plot,
  backgate,
  pickers,
}: {
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  backgate: { popId: string; color: string } | undefined;
  pickers: ReturnType<typeof axisPickers>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const height = Math.min(size.width, size.height);
  return (
    <div className="ref-box" ref={box}>
      {height > 0 && (
        <PlotCanvas
          ws={ws}
          group={group}
          sampleId={sampleId}
          plot={plot}
          width={size.width}
          height={height}
          {...pickers}
          {...(backgate ? { backgate } : {})}
        />
      )}
    </div>
  );
}
