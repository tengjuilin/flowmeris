import { useRef } from 'react';
import { ExportMenu } from '../../components/controls/ExportMenu.tsx';
import { useSize } from '../../components/hooks/useSize.ts';
import type { PlotHandle } from '../../lib/export/plot.ts';
import { axisPickers, drill } from '../../state/commands/plots.ts';
import { exportPlot } from '../../state/export.ts';
import { useGroup, useStore } from '../../state/store.ts';
import { EditScopeToggle, PlotCanvas, ToolButtons, usePlotForPopulation } from '../plot/index.ts';

/** The Gate view's plot, for the export card beside it. */
const gatePlotHandle: { current: PlotHandle | null } = { current: null };

/** Card above the population tree: export the Gate view's plot. */
export function GateExportCard() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup();
  const plot = usePlotForPopulation();
  if (!group || !plot) return null;
  const sampleId = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];
  const name = ws.samples[sampleId ?? '']?.fileName ?? 'plot';
  return (
    <ExportMenu
      className="side-export"
      onExport={(format, dpi) =>
        gatePlotHandle.current ? exportPlot(gatePlotHandle.current, plot, format, name, dpi) : undefined
      }
    />
  );
}

/** The Gate view's gating tools, above its plot and side column (as in the Plot view). */
export function GateToolbar() {
  const group = useGroup();
  const plot = usePlotForPopulation();
  if (!group || !plot) return null;
  return (
    <div className="toolbar" role="toolbar" aria-label="Gating tools">
      <ToolButtons is1d={plot.kind === 'histogram'} />
      <EditScopeToggle />
    </div>
  );
}

export function PlotPanel() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const group = useGroup();
  const plot = usePlotForPopulation();
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);

  if (!group) return <div className="empty">Select or add a group.</div>;
  const sampleId = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0];
  if (!sampleId) return <div className="empty">This group has no samples.</div>;
  if (!plot) {
    return (
      <div className="empty">
        <button type="button" onClick={() => drill(ui.popId)}>
          Create a plot for this population
        </button>
      </div>
    );
  }
  return (
    <div className="plot-panel">
      <div className="plot-box" ref={box}>
        {size.width > 0 && (
          <PlotCanvas
            ref={gatePlotHandle}
            ws={ws}
            group={group}
            sampleId={sampleId}
            plot={plot}
            width={Math.min(size.width, size.height + 120)}
            height={Math.min(size.height, size.width)}
            interactive
            onDrill={drill}
            {...axisPickers(group, plot)}
          />
        )}
      </div>
    </div>
  );
}
