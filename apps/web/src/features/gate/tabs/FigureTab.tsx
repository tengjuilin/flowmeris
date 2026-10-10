import type { PlotCell } from '@flowmeris/model';
import { BaseFontCard } from '../../../components/controls/text/index.ts';
import { Card } from '../../../components/ui/settings/index.ts';
import { DEFAULT_FIGURE } from '../../../lib/figure.ts';
import { scaleFontSizes } from '../../../lib/textScale.ts';
import { clearCellOverlay } from '../../../state/commands/grid.ts';
import { targetEdit } from '../../../state/commands/plots.ts';
import { PlotKindSelect } from '../../plot/index.ts';
import { StyleEditor } from '../StyleEditor.tsx';
import type { TabProps } from '../figureEdits.ts';
import { CellOverlayFields, CellSourceFields } from './GridCellFields.tsx';

/** The text sizes the base font size scales. */
const BASE_FONT_SIZES = ['titleFontSize', 'tickFontSize', 'axisTitleFontSize', 'gateFontSize'] as const;
/** The Base font card's settings, for its reset. */
const BASE_FONT_KEYS = ['fontFamily', 'fontColor', 'fontSize', ...BASE_FONT_SIZES] as const;

/** The Figure tab: plot type and title, a grid plot's samples and overlay, display, and the base font. */
export function FigureTab({
  group,
  plot,
  target,
  card,
  fx,
  gridPlot,
}: TabProps & { gridPlot: PlotCell | undefined }) {
  const { fig, edit, set, resetOf } = fx;
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
      <BaseFontCard
        card={card('baseFont', resetOf(BASE_FONT_KEYS, 'base font'))}
        font={fig.fontFamily}
        defaultFont={DEFAULT_FIGURE.fontFamily}
        onFont={(v) => set('fontFamily', v, 'Plot font')}
        color={fig.fontColor}
        defaultColor={DEFAULT_FIGURE.fontColor}
        onColor={(v, merge) => set('fontColor', v, 'Plot font color', merge)}
        size={fig.fontSize}
        onSize={(v) =>
          edit('Plot base font size', (f) => void scaleFontSizes(f, BASE_FONT_SIZES, v), 'fontSize')
        }
        sizeTitle="Scales the title, tick, axis title and gate label sizes together"
      />
    </>
  );
}
