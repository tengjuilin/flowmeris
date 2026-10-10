import type { ChartStyle } from '@flowmeris/model';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import { clamp } from '../../../lib/math.ts';
import type { ChartTabProps } from '../chartTabs.ts';

/** The Text tab: the chart's font, tick labels, axis titles and legend. */
export function TextTab({ c, plot, card }: ChartTabProps) {
  const { set } = c;
  const st = plot.style;
  return (
    <>
      <Card {...card('font')}>
        <label className="field">
          Font
          <select
            value={st.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value as ChartStyle['fontFamily'], 'Chart font')}
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
      </Card>
      <Card {...card('tickText')}>
        <label className="field check">
          <input
            type="checkbox"
            checked={st.showTickLabels}
            onChange={(e) => set('showTickLabels', e.target.checked, 'Chart tick labels')}
          />
          Show tick labels
        </label>
        <NumInput
          label="Tick label size (px)"
          step={0.5}
          value={st.tickFontSize}
          onCommit={(v) => set('tickFontSize', clamp(v, 4, 48), 'Chart tick label size')}
        />
      </Card>
      <Card {...card('axisTitleText')}>
        <NumInput
          label="Axis title size (px)"
          step={0.5}
          value={st.titleFontSize}
          onCommit={(v) => set('titleFontSize', clamp(v, 4, 48), 'Chart title size')}
        />
      </Card>
      <Card {...card('legend')}>
        <label
          className="field"
          title={c.allSeries.length > 1 ? undefined : 'Shown when there are two or more series'}
        >
          Legend
          <select
            value={st.legend}
            onChange={(e) => set('legend', e.target.value as ChartStyle['legend'], 'Chart legend')}
          >
            <option value="top">Top</option>
            <option value="right">Right</option>
            <option value="none">Hidden</option>
          </select>
        </label>
        <NumInput
          label="Legend size (px)"
          step={0.5}
          value={st.legendFontSize}
          onCommit={(v) => set('legendFontSize', clamp(v, 4, 48), 'Chart legend size')}
        />
      </Card>
    </>
  );
}
