import type { ChartStyle, StatPlot } from '@flowmeris/model';
import { ReorderList } from '../../components/ui/ReorderList.tsx';
import { seriesColor, seriesKey, seriesName } from '../../lib/chartStyle.ts';
import { moveIds } from '../../lib/order.ts';
import type { ChartData } from './useChart.ts';

/**
 * The chart's colour axis: the variable it is coloured by, the palette or single colour, and each series'
 * colour, legend label and order.
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
        Colour by
        <select
          value={plot.series ?? ''}
          onChange={(e) =>
            edit('Change chart series', (p) => {
              p.series = e.target.value || undefined;
              // Colours, labels and order are per value of the previous variable.
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
        Colour
        <select
          value={st.colorMode}
          onChange={(e) => set('colorMode', e.target.value as ChartStyle['colorMode'], 'Chart colour mode')}
        >
          <option value="palette">Categorical palette</option>
          <option value="single">Single colour</option>
        </select>
      </label>
      {st.colorMode === 'single' && (
        <label className="field">
          Fill colour
          <input
            type="color"
            value={st.color}
            onChange={(e) => set('color', e.target.value, 'Chart colour', 'color')}
          />
        </label>
      )}
      {c.seriesLabel ? (
        <>
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
                    title={custom ? 'Custom colour' : 'Colour from the setting above; pick to override'}
                    aria-label={`Colour of ${name}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      edit(
                        'Chart series colour',
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
                  {custom && (
                    <button
                      type="button"
                      className="icon"
                      title="Reset colour"
                      aria-label={`Reset colour of ${name}`}
                      onClick={() =>
                        edit('Reset chart series colour', (p) => {
                          delete p.style.seriesColors[k];
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </>
              );
            }}
          </ReorderList>
          <div className="list-actions">
            <button
              type="button"
              onClick={() => set('seriesOrder', [...keys].reverse(), 'Reverse chart series')}
            >
              Reverse
            </button>
            <button
              type="button"
              disabled={!st.seriesOrder.length}
              onClick={() => set('seriesOrder', [], 'Reset chart series order')}
            >
              Reset order
            </button>
            <button
              type="button"
              disabled={!Object.keys(st.seriesColors).length}
              onClick={() => set('seriesColors', {}, 'Reset chart series colours')}
            >
              Reset colours
            </button>
            <button
              type="button"
              disabled={!Object.keys(st.seriesLabels).length}
              onClick={() => set('seriesLabels', {}, 'Reset chart series labels')}
            >
              Reset labels
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">Choose “Colour by” to colour by a variable.</p>
      )}
    </>
  );
}
