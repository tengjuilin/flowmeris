import { TextStyleEditor } from '../../../components/controls/TextStyleEditor.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Text tab: style and size of the ridge labels, tick labels and axis title. */
export function TextTab({ r, fx, card }: RidgeTabProps) {
  const { style } = r;
  const { set, resetOf } = fx;
  return (
    <>
      <Card {...card('labelText', resetOf('labelText', 'ridge label text'))}>
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
      </Card>
      <Card {...card('tickText', resetOf('tickText', 'tick label text'))}>
        <TextStyleEditor
          label="Tick labels"
          value={style.tickText}
          base={style.fontFamily}
          baseColor={style.fontColor}
          onChange={(t) => set('tickText', t, 'Ridge tick text')}
          size={style.tickFontSize}
          onSize={(v) => set('tickFontSize', v, 'Ridge tick label size')}
        />
      </Card>
      <Card {...card('titleText', resetOf('titleText', 'axis title text'))}>
        <TextStyleEditor
          label="Axis title"
          value={style.titleText}
          base={style.fontFamily}
          baseColor={style.fontColor}
          onChange={(t) => set('titleText', t, 'Ridge title text')}
          size={style.titleFontSize}
          onSize={(v) => set('titleFontSize', v, 'Ridge title size')}
        />
      </Card>
    </>
  );
}
