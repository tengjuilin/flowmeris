import { BaseFontCard, TextCards } from '../../../components/controls/text/index.ts';
import { DEFAULT_FIGURE } from '../../../lib/figure.ts';
import { scaleFontSizes } from '../../../lib/textScale.ts';
import type { TabProps } from '../figureEdits.ts';

/** The text sizes the base font size scales. */
const BASE_FONT_SIZES = ['titleFontSize', 'tickFontSize', 'axisTitleFontSize', 'gateFontSize'] as const;
/** The Base font card's settings, for its reset. */
const BASE_FONT_KEYS = ['fontFamily', 'fontColor', 'fontSize', ...BASE_FONT_SIZES] as const;

/** The Text tab: the base font, and the style and size of the plot title, tick labels, axis titles and gate labels. */
export function TextTab({ card, fx }: TabProps) {
  const { fig, edit, set, resetOf } = fx;
  return (
    <>
      <BaseFontCard
        card={card('baseFont', resetOf(BASE_FONT_KEYS, 'base font'))}
        font={fig.fontFamily}
        defaultFont={DEFAULT_FIGURE.fontFamily}
        onFont={(v) => set('fontFamily', v, 'Plot font')}
        color={fig.fontColor}
        colorAtDefault={fig.fontColor === DEFAULT_FIGURE.fontColor}
        onColor={(v, merge) => set('fontColor', v, 'Plot font color', merge)}
        onResetColor={() => set('fontColor', DEFAULT_FIGURE.fontColor, 'Plot font color')}
        size={fig.fontSize}
        onSize={(v) =>
          edit('Plot base font size', (f) => void scaleFontSizes(f, BASE_FONT_SIZES, v), 'fontSize')
        }
        sizeTitle="Scales the title, tick, axis title and gate label sizes together"
      />
      <TextCards
        base={fig.fontFamily}
        baseColor={fig.fontColor}
        entries={[
          {
            card: card('titleText', resetOf(['titleText', 'titleFontSize'], 'plot title text')),
            label: 'Plot title',
            value: fig.titleText,
            onChange: (t) => set('titleText', t, 'Plot title text'),
            size: fig.titleFontSize,
            onSize: (v) => set('titleFontSize', v, 'Plot title size'),
          },
          {
            card: card('tickText', resetOf(['tickText', 'tickFontSize'], 'tick label text')),
            label: 'Tick labels',
            value: fig.tickText,
            onChange: (t) => set('tickText', t, 'Tick label text'),
            size: fig.tickFontSize,
            onSize: (v) => set('tickFontSize', v, 'Tick label size'),
          },
          {
            card: card('axisTitleText', resetOf(['axisTitleText', 'axisTitleFontSize'], 'axis title text')),
            label: 'Axis titles',
            value: fig.axisTitleText,
            onChange: (t) => set('axisTitleText', t, 'Axis title text'),
            size: fig.axisTitleFontSize,
            onSize: (v) => set('axisTitleFontSize', v, 'Axis title size'),
          },
          {
            card: card('gateText', resetOf(['gateText', 'gateFontSize'], 'gate label text')),
            label: 'Gate labels',
            value: fig.gateText,
            onChange: (t) => set('gateText', t, 'Gate label text'),
            size: fig.gateFontSize,
            onSize: (v) => set('gateFontSize', v, 'Gate label size'),
          },
        ]}
      />
    </>
  );
}
