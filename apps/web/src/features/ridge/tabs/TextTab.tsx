import { BaseFontCard, TextCards } from '../../../components/controls/text/index.ts';
import { scaleRidgeFonts } from '../../../lib/ridgePanels.ts';
import { DEFAULT_RIDGE_STYLE } from '../../../lib/ridgeStyle.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Text tab: the base font, and the style and size of the ridge labels, tick labels and axis title. */
export function TextTab({ r, fx, card }: RidgeTabProps) {
  const { style, update } = r;
  const { set, resetOf } = fx;
  return (
    <>
      <BaseFontCard
        card={card('baseFont', resetOf('baseFont', 'base font'))}
        font={style.fontFamily}
        defaultFont="arial"
        onFont={(v) => set('fontFamily', v, 'Ridge font')}
        color={style.fontColor}
        defaultColor={DEFAULT_RIDGE_STYLE.fontColor}
        onColor={(v, merge) => set('fontColor', v, 'Ridge font color', merge)}
        size={style.fontSize}
        onSize={(v) =>
          update('Ridge base font size', (l) => void scaleRidgeFonts(l.style, v), 'style:fontSize')
        }
        sizeTitle="Scales the label, tick and title sizes together"
      />
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
    </>
  );
}
