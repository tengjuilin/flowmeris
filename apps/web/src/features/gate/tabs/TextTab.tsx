import { TextCards } from '../../../components/controls/text/index.ts';
import type { TabProps } from '../figureEdits.ts';

/** The Text tab: style and size of the plot title, tick labels, axis titles and gate labels. */
export function TextTab({ card, fx }: TabProps) {
  const { fig, set, resetOf } = fx;
  return (
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
  );
}
