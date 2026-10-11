import type { StatPlot } from '@flowmeris/model';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import { CHART_ERRORS, CHART_KINDS } from '../../../lib/chartStyle.ts';
import { clamp } from '../../../lib/math.ts';
import { ChartLegendFields } from '../ChartLegendFields.tsx';
import {
  BarFields,
  ErrorBarFields,
  LineFields,
  MeanMarkerFields,
  ReplicateFields,
} from '../ChartMarkFields.tsx';
import type { ChartTabProps } from '../chartTabs.ts';

/**
 * The Figure tab: the chart's name and type, what it shows, its marks (mean markers or bars, and the line),
 * error bars, replicate points, legend placement and size.
 */
export function FigureTab({ c, plot, card }: ChartTabProps) {
  const { edit, set } = c;
  const st = plot.style;
  const bar = plot.kind === 'bar';
  return (
    <>
      <Card {...card('chart')}>
        <label className="field short-text">
          Name
          <input
            type="text"
            value={plot.name}
            onChange={(e) =>
              edit('Rename chart', (p) => void (p.name = e.target.value), `chart-name:${plot.id}`)
            }
          />
        </label>
        <label className="field">
          Chart type
          <select
            value={plot.kind}
            onChange={(e) =>
              edit('Change chart type', (p) => void (p.kind = e.target.value as StatPlot['kind']))
            }
          >
            {CHART_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </Card>
      <Card {...card('data')}>
        <label className="field" title="Error bars over the replicates (rows) sharing an x value and color">
          Error bars
          <select
            value={plot.error}
            onChange={(e) =>
              edit('Change chart error bars', (p) => void (p.error = e.target.value as StatPlot['error']))
            }
          >
            {CHART_ERRORS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field check">
          <input
            type="checkbox"
            checked={plot.showPoints}
            onChange={(e) => edit('Toggle replicate points', (p) => void (p.showPoints = e.target.checked))}
          />
          Show replicate points
        </label>
      </Card>
      {bar ? (
        <Card {...card('bars')}>
          <BarFields c={c} />
        </Card>
      ) : (
        <Card {...card('marks')}>
          <MeanMarkerFields c={c} />
        </Card>
      )}
      {plot.kind === 'line' && (
        <Card {...card('line')}>
          <LineFields c={c} />
        </Card>
      )}
      <Card {...card('errorBars')}>
        <ErrorBarFields c={c} />
      </Card>
      <Card {...card('replicates')}>
        <ReplicateFields c={c} />
      </Card>
      <Card {...card('legendPlace')}>
        <ChartLegendFields c={c} />
      </Card>
      <Card {...card('size')}>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={st.width === undefined}
              onChange={(e) => set('width', e.target.checked ? undefined : 760, 'Chart width')}
            />
            Fit width
          </label>
          {st.width !== undefined && (
            <NumInput
              label="Width (px)"
              step={10}
              value={st.width}
              onCommit={(v) => set('width', clamp(v, 240, 10000), 'Chart width')}
            />
          )}
        </div>
        <NumInput
          label="Height (px)"
          step={10}
          value={st.height}
          onCommit={(v) => set('height', clamp(v, 160, 10000), 'Chart height')}
        />
      </Card>
    </>
  );
}
