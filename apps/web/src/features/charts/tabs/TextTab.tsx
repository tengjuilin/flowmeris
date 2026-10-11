import type { ChartStyle } from '@flowmeris/model';
import { BaseFontCard, TextCards } from '../../../components/controls/text/index.ts';
import { DEFAULT_CHART_STYLE } from '../../../lib/chartStyle.ts';
import { scaleFontSizes } from '../../../lib/textScale.ts';
import type { ChartTabProps } from '../chartTabs.ts';

/** The text sizes the base font size scales. */
const BASE_FONT_SIZES = ['tickFontSize', 'titleFontSize', 'legendFontSize'] as const;

/** The theme's text colour, which chart text has until a colour is chosen. */
function themeInk(): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#000000';
  } catch {
    return '#000000';
  }
}

/** The Text tab: the base font, and the style and size of the tick labels, axis titles and legend. */
export function TextTab({ c, plot, card }: ChartTabProps) {
  const { set, edit } = c;
  const st = plot.style;
  return (
    <>
      <BaseFontCard
        card={card('baseFont')}
        font={st.fontFamily}
        defaultFont={DEFAULT_CHART_STYLE.fontFamily}
        onFont={(v) => set('fontFamily', v, 'Chart font')}
        color={st.fontColor ?? themeInk()}
        colorAtDefault={st.fontColor === undefined}
        defaultColorName="the theme's"
        onColor={(v, merge) => set('fontColor', v, 'Chart font color', merge)}
        onResetColor={() => set('fontColor', undefined, 'Chart font color')}
        size={st.fontSize}
        onSize={(v) =>
          edit('Chart base font size', (p) => void scaleFontSizes(p.style, BASE_FONT_SIZES, v), 'fontSize')
        }
        sizeTitle="Scales the tick label, axis title and legend sizes together"
      />
      <TextCards
        base={st.fontFamily}
        baseColor={st.fontColor ?? themeInk()}
        entries={[
          {
            card: card('tickText'),
            label: 'Tick labels',
            value: st.tickText,
            onChange: (t) => set('tickText', t, 'Chart tick label text'),
            size: st.tickFontSize,
            onSize: (v) => set('tickFontSize', v, 'Chart tick label size'),
            extra: (
              <label className="field check">
                <input
                  type="checkbox"
                  checked={st.showTickLabels}
                  onChange={(e) => set('showTickLabels', e.target.checked, 'Chart tick labels')}
                />
                Show tick labels
              </label>
            ),
          },
          {
            card: card('axisTitleText'),
            label: 'Axis titles',
            value: st.titleText,
            onChange: (t) => set('titleText', t, 'Chart axis title text'),
            size: st.titleFontSize,
            onSize: (v) => set('titleFontSize', v, 'Chart title size'),
          },
          {
            card: card('legend'),
            label: 'Legend',
            value: st.legendText,
            onChange: (t) => set('legendText', t, 'Chart legend text'),
            size: st.legendFontSize,
            onSize: (v) => set('legendFontSize', v, 'Chart legend size'),
            extra: (
              <label
                className="field"
                title={c.allSeries.length > 1 ? undefined : 'Shown when there are two or more series'}
              >
                Position
                <select
                  value={st.legend}
                  onChange={(e) => set('legend', e.target.value as ChartStyle['legend'], 'Chart legend')}
                >
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="none">Hidden</option>
                </select>
              </label>
            ),
          },
        ]}
      />
    </>
  );
}
