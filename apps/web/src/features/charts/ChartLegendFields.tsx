import { NumInput } from '../../components/ui/NumInput.tsx';
import { LEGEND_ALIGNS, LEGEND_LOCS, legendInside } from '../../lib/chartLegend.ts';
import { clamp } from '../../lib/math.ts';
import { StyleSelect } from './ChartStyleFields.tsx';
import type { ChartData } from './useChart.ts';

/** Where the legend goes, how it lines up along the plot area, and its columns (automatic or set). */
export function ChartLegendFields({ c }: { c: ChartData }) {
  const st = c.plot!.style;
  const hidden = st.legend === 'none';
  const multi = c.allSeries.length > 1;
  return (
    <>
      {!multi && <p className="small muted">The legend is shown when the chart has two or more series.</p>}
      <StyleSelect c={c} k="legend" label="Location" options={LEGEND_LOCS} />
      {!hidden && !legendInside(st.legend) && (
        <StyleSelect c={c} k="legendAlign" label="Alignment" options={LEGEND_ALIGNS} />
      )}
      {!hidden && (
        <div className="grid2">
          <label className="field check" title="As many columns as fit, wrapping to more rows or columns">
            <input
              type="checkbox"
              checked={st.legendColumns === undefined}
              onChange={(e) =>
                c.set('legendColumns', e.target.checked ? undefined : 1, 'Chart legend columns')
              }
            />
            Auto columns
          </label>
          {st.legendColumns !== undefined && (
            <NumInput
              label="Columns"
              step={1}
              value={st.legendColumns}
              onCommit={(v) => c.set('legendColumns', clamp(Math.round(v), 1, 50), 'Chart legend columns')}
            />
          )}
        </div>
      )}
    </>
  );
}
