import type { PlotCell } from '@flowmeris/model';
import { Card } from '../../../components/ui/settings/index.ts';
import { clearCellOverlay } from '../../../state/commands/grid.ts';
import { targetEdit } from '../../../state/commands/plots.ts';
import { PlotKindSelect } from '../../plot/index.ts';
import { StyleEditor } from '../StyleEditor.tsx';
import type { TabProps } from '../figureEdits.ts';
import { CellOverlayFields, CellSourceFields } from './GridCellFields.tsx';

/** The Figure tab: plot type and title, a grid plot's samples and overlay, and display. */
export function FigureTab({
  group,
  plot,
  target,
  card,
  fx,
  gridPlot,
}: TabProps & { gridPlot: PlotCell | undefined }) {
  const { fig, set, resetOf } = fx;
  const grid = target === 'grid';
  const plotEdit = target === 'gate' ? undefined : targetEdit(group.id, plot.id, target);
  return (
    <>
      <Card {...card('plot', resetOf(['title'], 'plot title'))}>
        <PlotKindSelect group={group} plot={plot} edit={plotEdit} label="Plot type" />
        <label className="field short-text">
          Plot title
          <input
            type="text"
            value={fig.title ?? ''}
            placeholder="None"
            onChange={(e) => set('title', e.target.value || undefined, 'Plot title', 'title')}
          />
        </label>
        {grid && gridPlot && <CellSourceFields group={group} cell={gridPlot} />}
      </Card>
      {grid && gridPlot && (
        <Card
          {...card('overlay', {
            changed: gridPlot.overlay.length > 0,
            onReset: () => clearCellOverlay(group.id, gridPlot.id),
          })}
        >
          <CellOverlayFields group={group} cell={gridPlot} />
        </Card>
      )}
      <StyleEditor target={target} plot={plot} card={card} />
    </>
  );
}
