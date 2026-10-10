import { TextStyleEditor } from '../../../components/controls/TextStyleEditor.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import type { TabProps } from '../figureEdits.ts';

/** The Text tab: style and size of the plot title, tick labels, axis titles and gate labels. */
export function TextTab({ card, fx }: TabProps) {
  const { fig, set, resetOf } = fx;
  return (
    <>
      <Card {...card('titleText', resetOf(['titleText', 'titleFontSize'], 'plot title text'))}>
        <TextStyleEditor
          label="Plot title"
          value={fig.titleText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('titleText', t, 'Plot title text')}
          size={fig.titleFontSize}
          onSize={(v) => set('titleFontSize', v, 'Plot title size')}
        />
      </Card>
      <Card {...card('tickText', resetOf(['tickText', 'tickFontSize'], 'tick label text'))}>
        <TextStyleEditor
          label="Tick labels"
          value={fig.tickText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('tickText', t, 'Tick label text')}
          size={fig.tickFontSize}
          onSize={(v) => set('tickFontSize', v, 'Tick label size')}
        />
      </Card>
      <Card {...card('axisTitleText', resetOf(['axisTitleText', 'axisTitleFontSize'], 'axis title text'))}>
        <TextStyleEditor
          label="Axis titles"
          value={fig.axisTitleText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('axisTitleText', t, 'Axis title text')}
          size={fig.axisTitleFontSize}
          onSize={(v) => set('axisTitleFontSize', v, 'Axis title size')}
        />
      </Card>
      <Card {...card('gateText', resetOf(['gateText', 'gateFontSize'], 'gate label text'))}>
        <TextStyleEditor
          label="Gate labels"
          value={fig.gateText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('gateText', t, 'Gate label text')}
          size={fig.gateFontSize}
          onSize={(v) => set('gateFontSize', v, 'Gate label size')}
        />
      </Card>
    </>
  );
}
