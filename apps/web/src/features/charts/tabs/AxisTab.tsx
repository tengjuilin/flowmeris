import { Card } from '../../../components/ui/settings/index.ts';
import { ChartAxisFields } from '../ChartAxisFields.tsx';
import { ChartColorFields } from '../ChartColorFields.tsx';
import { ChartTicksFields } from '../ChartTicksFields.tsx';
import type { ChartTabProps } from '../chartTabs.ts';

/**
 * The Axis tab: the x and y axes, the colour axis (colour by and series colours), ticks and spines with the
 * box aspect ratio, and gridlines.
 */
export function AxisTab({ c, plot, card }: ChartTabProps) {
  return (
    <>
      <Card {...card('xAxis')}>
        <ChartAxisFields which="x" c={c} plot={plot} />
      </Card>
      <Card {...card('yAxis')}>
        <ChartAxisFields which="y" c={c} plot={plot} />
      </Card>
      <Card {...card('color')}>
        <ChartColorFields c={c} plot={plot} />
      </Card>
      <Card {...card('ticks')}>
        <ChartTicksFields c={c} />
      </Card>
      <Card {...card('grid')}>
        <label className="field check">
          <input
            type="checkbox"
            checked={plot.style.showGrid}
            onChange={(e) => c.set('showGrid', e.target.checked, 'Chart gridlines')}
          />
          Show gridlines
        </label>
      </Card>
    </>
  );
}
