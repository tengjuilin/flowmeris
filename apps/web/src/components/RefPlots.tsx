import type { Group, PlotSpec, RefPlot, Workspace } from '@flowmeris/model';
import { newId, populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { useRef } from 'react';
import { DEFAULT_STYLE, defaultAxis, defaultChannels, groupSample } from '../lib/defaults.ts';
import { useGroup, useSampleNames, useStore } from '../state/store.ts';
import { PlotCanvas } from './PlotCanvas.tsx';
import { AxisSelects, PlotKindSelect, axisChannelSetter } from './PlotPanel.tsx';
import { useSize } from './hooks.ts';

function editRef(
  groupId: string,
  refId: string,
  label: string,
  fn: (r: RefPlot, g: Group, w: Workspace) => void,
) {
  useStore.getState().mutate(label, (w) => {
    const g = w.groups.find((x) => x.id === groupId);
    const r = g?.refPlots.find((x) => x.id === refId);
    if (g && r) fn(r, g, w);
  });
}

function addRef(groupId: string) {
  let id = '';
  useStore.getState().mutate('Add reference plot', (w) => {
    const g = w.groups.find((x) => x.id === groupId);
    if (!g) return;
    const [xc, yc] = defaultChannels(w, g);
    const r: RefPlot = {
      id: newId('ref_'),
      kind: 'pseudocolor',
      x: { ...defaultAxis(w, g, xc) },
      y: { ...defaultAxis(w, g, yc) },
      style: { ...DEFAULT_STYLE },
      backgate: false,
    };
    g.refPlots.push(r);
    id = r.id;
  });
  if (id) useStore.getState().setUi({ refPlotId: id });
}

function removeRef(groupId: string, refId: string) {
  useStore.getState().mutate('Remove reference plot', (w) => {
    const g = w.groups.find((x) => x.id === groupId);
    if (g) g.refPlots = g.refPlots.filter((r) => r.id !== refId);
  });
}

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
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const names = useSampleNames(group);
  if (!group) return null;

  const refs = group.refPlots;
  const ref = refs.find((r) => r.id === ui.refPlotId) ?? refs[0];
  const curPop = group.template.populations[ui.popId] ? ui.popId : 'root';
  const curSample = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];

  const tabs = (
    <div className="ref-tabs" role="tablist" aria-label="Reference plots">
      {refs.map((r) => (
        <div key={r.id} className={`ref-tab${r.id === ref?.id ? ' on' : ''}`}>
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
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="icon ref-add"
        title="Add a reference plot"
        onClick={() => addRef(group.id)}
      >
        +
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
      ) : ui.missing[sampleId] ? (
        <div className="empty">Data not loaded for this sample: re-add its FCS file to view it.</div>
      ) : (
        <RefCanvas
          ws={ws}
          group={group}
          sampleId={sampleId}
          plot={plot}
          backgate={backgate}
          onPickChannel={axisChannelSetter(group, plot, edit)}
        />
      )}
    </div>
  );
}

/** Plot filling the rest of the panel: square when there is room, wider than tall when the panel is short
 * (own component so the size observer mounts with its box). */
function RefCanvas({
  ws,
  group,
  sampleId,
  plot,
  backgate,
  onPickChannel,
}: {
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  backgate: { popId: string; color: string } | undefined;
  onPickChannel: (axis: 'x' | 'y', channel: string) => void;
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
          onPickChannel={onPickChannel}
          {...(backgate ? { backgate } : {})}
        />
      )}
    </div>
  );
}
