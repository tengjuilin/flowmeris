import { TextStyleEditor } from '../../../components/controls/TextStyleEditor.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Text tab: style and size of the ridge labels, tick labels and axis title. */
export function TextTab({ r, fx, card }: RidgeTabProps) {
  const { style } = r;
  const { set, resetOf } = fx;
  return (
    <>
      <Section
        id="labelText"
        {...resetOf('labelText', 'ridge label text')}
        title="Ridge labels"
        {...card('labelText')}
      >
        <TextStyleEditor
          label="Ridge labels"
          value={style.labelText}
          base={style.fontFamily}
          baseColor={style.fontColor}
          onChange={(t) => set('labelText', t, 'Ridge label text')}
          size={style.labelFontSize}
          onSize={(v) => set('labelFontSize', v, 'Ridge label size')}
          align={style.labelAlign}
          onAlign={(a) => set('labelAlign', a, 'Ridge label alignment')}
        />
      </Section>
      <Section
        id="tickText"
        {...resetOf('tickText', 'tick label text')}
        title="Tick labels"
        {...card('tickText')}
      >
        <TextStyleEditor
          label="Tick labels"
          value={style.tickText}
          base={style.fontFamily}
          baseColor={style.fontColor}
          onChange={(t) => set('tickText', t, 'Ridge tick text')}
          size={style.tickFontSize}
          onSize={(v) => set('tickFontSize', v, 'Ridge tick label size')}
        />
      </Section>
      <Section
        id="titleText"
        {...resetOf('titleText', 'axis title text')}
        title="Axis title"
        {...card('titleText')}
      >
        <TextStyleEditor
          label="Axis title"
          value={style.titleText}
          base={style.fontFamily}
          baseColor={style.fontColor}
          onChange={(t) => set('titleText', t, 'Ridge title text')}
          size={style.titleFontSize}
          onSize={(v) => set('titleFontSize', v, 'Ridge title size')}
        />
      </Section>
    </>
  );
}
