import { TextStyleEditor } from '../../../components/controls/TextStyleEditor.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { type TabProps, cardProps } from '../figureEdits.ts';

/** The Text tab: style and size of the plot title, tick labels, axis titles and gate labels. */
export function TextTab({ panel, fx }: TabProps) {
  const { fig, set, resetOf } = fx;
  return (
    <>
      <Section
        id="titleText"
        title="Plot title"
        {...resetOf(['titleText', 'titleFontSize'], 'plot title text')}
        {...cardProps(panel, 'titleText')}
      >
        <TextStyleEditor
          label="Plot title"
          value={fig.titleText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('titleText', t, 'Plot title text')}
          size={fig.titleFontSize}
          onSize={(v) => set('titleFontSize', v, 'Plot title size')}
        />
      </Section>
      <Section
        id="tickText"
        title="Tick labels"
        {...resetOf(['tickText', 'tickFontSize'], 'tick label text')}
        {...cardProps(panel, 'tickText')}
      >
        <TextStyleEditor
          label="Tick labels"
          value={fig.tickText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('tickText', t, 'Tick label text')}
          size={fig.tickFontSize}
          onSize={(v) => set('tickFontSize', v, 'Tick label size')}
        />
      </Section>
      <Section
        id="axisTitleText"
        title="Axis titles"
        {...resetOf(['axisTitleText', 'axisTitleFontSize'], 'axis title text')}
        {...cardProps(panel, 'axisTitleText')}
      >
        <TextStyleEditor
          label="Axis titles"
          value={fig.axisTitleText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('axisTitleText', t, 'Axis title text')}
          size={fig.axisTitleFontSize}
          onSize={(v) => set('axisTitleFontSize', v, 'Axis title size')}
        />
      </Section>
      <Section
        id="gateText"
        title="Gate labels"
        {...resetOf(['gateText', 'gateFontSize'], 'gate label text')}
        {...cardProps(panel, 'gateText')}
      >
        <TextStyleEditor
          label="Gate labels"
          value={fig.gateText}
          base={fig.fontFamily}
          baseColor={fig.fontColor}
          onChange={(t) => set('gateText', t, 'Gate label text')}
          size={fig.gateFontSize}
          onSize={(v) => set('gateFontSize', v, 'Gate label size')}
        />
      </Section>
    </>
  );
}
