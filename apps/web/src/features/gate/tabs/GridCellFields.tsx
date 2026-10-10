import type { Group, PlotCell } from '@flowmeris/model';
import { populationLineage, populationsDepthFirst } from '@flowmeris/model';
import { cellSample, overlayColors } from '../../../lib/gridCells.ts';
import { editCell, setCellPopulation, setCellSample } from '../../../state/commands/grid.ts';
import { useSampleNames, useStore } from '../../../state/store.ts';

/** Population and sample pickers of a grid plot, at the bottom of the Plot card of its settings panel. */
export function CellSourceFields({ group, cell }: { group: Group; cell: PlotCell }) {
  const ws = useStore((s) => s.ws);
  const selected = useStore((s) => s.ui.sampleId);
  const names = useSampleNames(group);
  const sampleName = (id: string) => names[id] ?? ws.samples[id]?.fileName ?? id;
  const sampleId = cellSample(group, cell, selected);
  const edit = (label: string, fn: (c: PlotCell) => void) => editCell(group.id, cell.id, label, fn);
  const ids = group.sampleIds;
  const step = (d: number) => {
    if (!sampleId || ids.length < 2) return;
    const next = ids[(ids.indexOf(sampleId) + d + ids.length) % ids.length]!;
    edit('Change grid plot sample', (c) => void (c.sampleId = next));
  };
  const followName = selected && ids.includes(selected) ? sampleName(selected) : '–';

  return (
    <>
      <label className="field">
        Population
        <select
          value={cell.population}
          onChange={(e) => setCellPopulation(group.id, cell.id, e.target.value)}
        >
          {populationsDepthFirst(group.template).map((p) => (
            <option key={p.id} value={p.id}>
              {'\u00a0\u00a0'.repeat(populationLineage(group.template, p.id).length - 1)}
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        Sample
        <div className="sample-step">
          <button type="button" className="icon" title="Previous sample" onClick={() => step(-1)}>
            ◀
          </button>
          <select
            aria-label="Sample"
            value={cell.sampleId ?? ''}
            onChange={(e) => setCellSample(group.id, cell.id, e.target.value || undefined)}
          >
            <option value="">Follow selected ({followName})</option>
            {ids.map((id) => (
              <option key={id} value={id}>
                {sampleName(id)}
              </option>
            ))}
          </select>
          <button type="button" className="icon" title="Next sample" onClick={() => step(1)}>
            ▶
          </button>
        </div>
      </div>
    </>
  );
}

/** Checklist of the samples drawn over a grid plot, each in its own colour: its Sample overlay card. */
export function CellOverlayFields({ group, cell }: { group: Group; cell: PlotCell }) {
  const ws = useStore((s) => s.ws);
  const selected = useStore((s) => s.ui.sampleId);
  const names = useSampleNames(group);
  const sampleName = (id: string) => names[id] ?? ws.samples[id]?.fileName ?? id;
  const sampleId = cellSample(group, cell, selected);
  const edit = (label: string, fn: (c: PlotCell) => void) => editCell(group.id, cell.id, label, fn);
  const colors = sampleId ? overlayColors(cell, sampleId, group) : null;
  return (
    <div className="overlay-list" title="Overlay other samples on this plot, each in its own colour">
      {group.sampleIds.map((id) => {
        const isMain = id === sampleId;
        const on = isMain || cell.overlay.includes(id);
        const color = isMain ? colors?.color : colors?.samples.find((x) => x.sampleId === id)?.color;
        return (
          <label key={id} className="field check">
            <input
              type="checkbox"
              checked={on}
              disabled={isMain}
              onChange={(e) =>
                edit('Change grid plot overlay', (c) => {
                  c.overlay = e.target.checked ? [...c.overlay, id] : c.overlay.filter((x) => x !== id);
                })
              }
            />
            {/* Hidden while off, keeping the names aligned. */}
            <span className="swatch" style={on ? { background: color } : { visibility: 'hidden' }} />
            {sampleName(id)}
            {isMain && <span className="muted"> (plotted)</span>}
          </label>
        );
      })}
    </div>
  );
}
