import { TextCards } from '../../../components/controls/text/index.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Text tab: style and size of the ridge labels, tick labels and axis title. */
export function TextTab({ r, fx, card }: RidgeTabProps) {
  const { style } = r;
  const { set, resetOf } = fx;
  return (
    <TextCards
      base={style.fontFamily}
      baseColor={style.fontColor}
      entries={[
        {
          card: card('labelText', resetOf('labelText', 'ridge label text')),
          label: 'Ridge labels',
          value: style.labelText,
          onChange: (t) => set('labelText', t, 'Ridge label text'),
          size: style.labelFontSize,
          onSize: (v) => set('labelFontSize', v, 'Ridge label size'),
          align: style.labelAlign,
          onAlign: (a) => set('labelAlign', a, 'Ridge label alignment'),
        },
        {
          card: card('tickText', resetOf('tickText', 'tick label text')),
          label: 'Tick labels',
          value: style.tickText,
          onChange: (t) => set('tickText', t, 'Ridge tick text'),
          size: style.tickFontSize,
          onSize: (v) => set('tickFontSize', v, 'Ridge tick label size'),
        },
        {
          card: card('titleText', resetOf('titleText', 'axis title text')),
          label: 'Axis title',
          value: style.titleText,
          onChange: (t) => set('titleText', t, 'Ridge title text'),
          size: style.titleFontSize,
          onSize: (v) => set('titleFontSize', v, 'Ridge title size'),
        },
      ]}
    />
  );
}
