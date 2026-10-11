import type { ChartStyle, StatPlot } from '@flowmeris/model';
import { ListActions } from '../../components/ui/ListActions.tsx';
import { ReorderList } from '../../components/ui/ReorderList.tsx';
import { ResetIcon } from '../../components/ui/icons.tsx';
import { seriesColor, seriesKey, seriesName } from '../../lib/chartStyle.ts';
import { moveIds } from '../../lib/order.ts';
import type { ChartData } from './useChart.ts';

/**
 * The chart's color axis: the variable it is colored by, the palette or single color, and each series'
 * color, legend label and order.
 */
export function ChartColorFields({ c, plot }: { c: ChartData; plot: StatPlot }) {
  const { edit, set } = c;
  const st = plot.style;
  const series = c.allSeries;
  const keys = series.map((s) => seriesKey(s.key));
  const moveTo = (moved: string[], target: string, after: boolean) => {
    const next = moveIds(keys, moved, target, after);
    if (next) set('seriesOrder', next, 'Reorder chart series');
  };
  return (
    <>
      <label className="field">
        Color by
        <select
          value={plot.series ?? ''}
          onChange={(e) =>
            edit('Change chart series', (p) => {
              p.series = e.target.value || undefined;
              // Colors, labels and order are per value of the previous variable.
              p.style.seriesColors = {};
              p.style.seriesLabels = {};
              p.style.seriesOrder = [];
            })
          }
        >
          <option value="">—</option>
          {c.variables
            .filter((v) => v.type === 'categorical')
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Color
        <select
          value={st.colorMode}
          onChange={(e) => set('colorMode', e.target.value as ChartStyle['colorMode'], 'Chart color mode')}
        >
          <option value="palette">Categorical palette</option>
          <option value="single">Single color</option>
        </select>
      </label>
      {st.colorMode === 'single' && (
        <label className="field">
          Fill color
          <input
            type="color"
            value={st.color}
            onChange={(e) => set('color', e.target.value, 'Chart color', 'color')}
          />
        </label>
      )}
      {c.seriesLabel ? (
        <>
          <ListActions
            onReverse={() => set('seriesOrder', [...keys].reverse(), 'Reverse chart series')}
            resets={[
              {
                label: 'Order',
                title: 'Reset the order',
                disabled: !st.seriesOrder.length,
                run: () => set('seriesOrder', [], 'Reset chart series order'),
              },
              {
                label: 'Colors',
                title: 'Reset the colors',
                disabled: !Object.keys(st.seriesColors).length,
                run: () => set('seriesColors', {}, 'Reset chart series colors'),
              },
              {
                label: 'Labels',
                title: 'Reset the labels',
                disabled: !Object.keys(st.seriesLabels).length,
                run: () => set('seriesLabels', {}, 'Reset chart series labels'),
              },
            ]}
          />
          <ReorderList
            ids={keys}
            name={(k) => seriesName(series[keys.indexOf(k)]!)}
            gripTitle="Drag to reorder"
            onMove={moveTo}
          >
            {(k, i) => {
              const custom = st.seriesColors[k] !== undefined;
              const name = seriesName(series[i]!);
              return (
                <>
                  <input
                    type="color"
                    className={custom ? 'custom' : ''}
                    value={seriesColor(st, k, i)}
                    title={custom ? 'Custom color' : 'Color from the setting above; pick to override'}
                    aria-label={`Color of ${name}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      edit(
                        'Chart series color',
                        (p) => {
                          p.style.seriesColors[k] = v;
                        },
                        `chart:${plot.id}:color:${k}`,
                      );
                    }}
                  />
                  <input
                    type="text"
                    value={st.seriesLabels[k] ?? ''}
                    placeholder={name}
                    aria-label={`Legend label of ${name}`}
                    onChange={(e) =>
                      edit(
                        'Chart series label',
                        (p) => {
                          if (e.target.value) p.style.seriesLabels[k] = e.target.value;
                          else delete p.style.seriesLabels[k];
                        },
                        `chart:${plot.id}:label:${k}`,
                      )
                    }
                  />
                  <button
                    type="button"
                    className="reset-btn"
                    disabled={!custom}
                    title="Reset color to the setting above"
                    aria-label={`Reset color of ${name}`}
                    onClick={() =>
                      edit('Reset chart series color', (p) => {
                        delete p.style.seriesColors[k];
                      })
                    }
                  >
                    <ResetIcon />
                  </button>
                </>
              );
            }}
          </ReorderList>
        </>
      ) : (
        <p className="small muted">Choose “Color by” to color by a variable.</p>
      )}
    </>
  );
}
