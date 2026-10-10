import type { PlotCell } from '@flowmeris/model';
import { FontSelect } from '../../../components/controls/FontSelect.tsx';
import { ColorField } from '../../../components/ui/ColorField.tsx';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import { DEFAULT_FIGURE } from '../../../lib/figure.ts';
import { clamp } from '../../../lib/math.ts';
import { clearCellOverlay } from '../../../state/commands/grid.ts';
import { targetEdit } from '../../../state/commands/plots.ts';
import { PlotKindSelect } from '../../plot/index.ts';
import { StyleEditor } from '../StyleEditor.tsx';
import type { TabProps } from '../figureEdits.ts';
import { CellOverlayFields, CellSourceFields } from './GridCellFields.tsx';

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
      <Card
        {...card(
          'baseFont',
          resetOf(
            [
              'fontFamily',
              'fontColor',
              'fontSize',
              'titleFontSize',
              'tickFontSize',
              'axisTitleFontSize',
              'gateFontSize',
            ],
            'base font',
          ),
        )}
      >
        <FontSelect
          label="Base font"
          value={fig.fontFamily}
          onChange={(v) => set('fontFamily', v ?? DEFAULT_FIGURE.fontFamily, 'Plot font')}
        />
        <ColorField
          inline
          label="Base font color"
          value={fig.fontColor}
          onChange={(v) => set('fontColor', v, 'Plot font color', 'fontColor')}
          reset={{
            disabled: fig.fontColor === DEFAULT_FIGURE.fontColor,
            label: 'Reset base font color to black',
            title:
              fig.fontColor === DEFAULT_FIGURE.fontColor
                ? 'Base font color is the default'
                : 'Reset base font color to black',
            onReset: () => set('fontColor', DEFAULT_FIGURE.fontColor, 'Plot font color'),
          }}
        />
        <NumInput
          live
          label="Base font size (px)"
          step={0.5}
          title="Scales the title, tick, axis title and gate label sizes together"
          value={fig.fontSize}
          onCommit={(v) => {
            const next = clamp(v, 4, 48);
            if (next === fig.fontSize) return;
            const k = next / fig.fontSize;
            const scaled = (x: number) => clamp(Math.round(x * k * 2) / 2, 4, 48);
            edit(
              'Plot base font size',
              (f) => {
                f.fontSize = next;
                f.titleFontSize = scaled(f.titleFontSize);
                f.tickFontSize = scaled(f.tickFontSize);
                f.axisTitleFontSize = scaled(f.axisTitleFontSize);
                f.gateFontSize = scaled(f.gateFontSize);
              },
              'fontSize',
            );
          }}
        />
      </Card>
    </>
  );
}
