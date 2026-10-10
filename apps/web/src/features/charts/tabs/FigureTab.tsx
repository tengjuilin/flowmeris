import type { StatPlot } from '@flowmeris/model';
import { NumInput, OptNumInput } from '../../../components/ui/NumInput.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { Slider } from '../../../components/ui/Slider.tsx';
import { CHART_ERRORS, CHART_KINDS } from '../../../lib/chartStyle.ts';
import { clamp } from '../../../lib/math.ts';
import type { ChartTabProps } from '../chartTabs.ts';

/** The Figure tab: the chart's name and type, error bars and replicate points, marks and size. */
export function FigureTab({ c, plot, card }: ChartTabProps) {
  const { edit, set } = c;
  const st = plot.style;
  const bar = plot.kind === 'bar';
  return (
    <>
      <Section {...card('chart', 'Chart')}>
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
      </Section>
      <Section {...card('data', 'Error and replicates')}>
        <label className="field" title="Error bars over the replicates (rows) sharing an x value and colour">
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
      </Section>
      <Section {...card('marks', 'Marks')}>
        <Slider
          label={bar ? 'Bar opacity' : 'Marker opacity'}
          value={st.fillOpacity}
          onChange={(v) => set('fillOpacity', v, 'Chart opacity', 'opacity')}
        />
        <div className="grid2">
          {!bar && (
            <NumInput
              label="Marker size (px)"
              step={0.5}
              value={st.markerSize}
              onCommit={(v) => set('markerSize', clamp(v, 0, 30), 'Chart marker size')}
            />
          )}
          {plot.kind === 'line' && (
            <NumInput
              label="Line width (px)"
              step={0.25}
              value={st.lineWidth}
              onCommit={(v) => set('lineWidth', clamp(v, 0, 20), 'Chart line width')}
            />
          )}
        </div>
        {c.band && (
          <div className="grid2">
            <label className="field check">
              <input
                type="checkbox"
                checked={st.barWidth === undefined}
                onChange={(e) => set('barWidth', e.target.checked ? undefined : 0.8, 'Chart bar width')}
              />
              Auto {bar ? 'bar' : 'group'} width
            </label>
            {st.barWidth !== undefined && (
              <NumInput
                label="Width (% of category)"
                step={5}
                value={Math.round(st.barWidth * 100)}
                onCommit={(v) => set('barWidth', clamp(v / 100, 0.05, 1), 'Chart bar width')}
              />
            )}
          </div>
        )}
        <div className="grid2">
          <NumInput
            label="Error bar width (px)"
            step={0.25}
            value={st.errorWidth}
            onCommit={(v) => set('errorWidth', clamp(v, 0, 10), 'Chart error bar width')}
          />
          <OptNumInput
            label="Cap width (px)"
            value={st.capWidth}
            onCommit={(v) => set('capWidth', v === undefined ? v : clamp(v, 0, 60), 'Chart cap width')}
          />
        </div>
        <div className="grid2">
          <NumInput
            label="Replicate size (px)"
            step={0.5}
            value={st.pointSize}
            onCommit={(v) => set('pointSize', clamp(v, 0, 20), 'Chart replicate size')}
          />
          <label className="field check">
            <input
              type="checkbox"
              checked={st.pointOpacity === undefined}
              onChange={(e) =>
                set(
                  'pointOpacity',
                  e.target.checked ? undefined : bar ? 0.85 : 0.55,
                  'Chart replicate opacity',
                )
              }
            />
            Auto replicate opacity
          </label>
        </div>
        {st.pointOpacity !== undefined && (
          <Slider
            label="Replicate opacity"
            value={st.pointOpacity}
            onChange={(v) => set('pointOpacity', v, 'Chart replicate opacity', 'point-opacity')}
          />
        )}
      </Section>
      <Section {...card('size', 'Size')}>
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
      </Section>
    </>
  );
}
