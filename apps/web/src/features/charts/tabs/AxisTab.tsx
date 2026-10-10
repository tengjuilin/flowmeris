import { Section } from '../../../components/ui/Section.tsx';
import { ChartAxisFields } from '../ChartAxisFields.tsx';
import { ChartColorFields } from '../ChartColorFields.tsx';
import type { ChartTabProps } from '../chartTabs.ts';

/** The Axis tab: the x and y axes, the colour axis (colour by and series colours), and gridlines. */
export function AxisTab({ c, plot, card }: ChartTabProps) {
  return (
    <>
      <Section {...card('xAxis', 'X axis')}>
        <ChartAxisFields which="x" c={c} plot={plot} />
      </Section>
      <Section {...card('yAxis', 'Y axis')}>
        <ChartAxisFields which="y" c={c} plot={plot} />
      </Section>
      <Section {...card('color', 'Colour')}>
        <ChartColorFields c={c} plot={plot} />
      </Section>
      <Section {...card('grid', 'Gridlines')}>
        <label className="field check">
          <input
            type="checkbox"
            checked={plot.style.showGrid}
            onChange={(e) => c.set('showGrid', e.target.checked, 'Chart gridlines')}
          />
          Show gridlines
        </label>
      </Section>
    </>
  );
}
