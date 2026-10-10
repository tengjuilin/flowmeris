import type { StatPlot } from '@flowmeris/model';
import { TicksEditor } from '../../components/controls/TicksEditor.tsx';
import { OptNumInput } from '../../components/ui/NumInput.tsx';
import { ColumnSelect } from './ColumnSelect.tsx';
import type { ChartData } from './useChart.ts';

/**
 * A chart axis in data units (not the cytometry AxisFields of the plots): its column and scale, title,
 * range and ticks.
 */
export function ChartAxisFields({ which, c, plot }: { which: 'x' | 'y'; c: ChartData; plot: StatPlot }) {
  const { set, edit } = c;
  const st = plot.style;
  const x = which === 'x';
  const col = x ? c.xCol : c.yCol;
  // Categories along x have no scale, range or ticks.
  const numeric = !x || !c.band;
  const scale = x ? plot.xScale : plot.yScale;
  const log = numeric && scale === 'log10';
  const minKey = x ? 'xMin' : 'yMin';
  const maxKey = x ? 'xMax' : 'yMax';
  const lo = st[minKey];
  const hi = st[maxKey];
  const bad =
    (lo !== undefined && hi !== undefined && !(hi > lo)) ||
    (log && ((lo !== undefined && lo <= 0) || (hi !== undefined && hi <= 0)));
  return (
    <>
      <ColumnSelect
        label="Column"
        value={plot[which]}
        columns={x ? c.columns : c.yOptions}
        onChange={(k) => edit(`Change chart ${which}`, (p) => void (p[which] = k))}
      />
      <label className="field">
        Scale
        <select
          value={numeric ? scale : 'linear'}
          disabled={!numeric}
          title={numeric ? undefined : 'Categories: no scale'}
          onChange={(e) =>
            edit(`Change chart ${which} scale`, (p) => {
              const v = e.target.value as StatPlot['xScale'];
              if (x) p.xScale = v;
              else p.yScale = v;
            })
          }
        >
          <option value="linear">linear</option>
          <option value="log10">log</option>
        </select>
      </label>
      <label className="field short-text" title="Leave empty for the column name; type a space for no title">
        Title
        <input
          type="text"
          value={(x ? plot.xLabel : plot.yLabel) ?? ''}
          placeholder={col?.label ?? plot[which]}
          onChange={(e) =>
            edit(
              `Change ${which} title`,
              (p) => {
                if (x) p.xLabel = e.target.value || undefined;
                else p.yLabel = e.target.value || undefined;
              },
              `chart-${which}l:${plot.id}`,
            )
          }
        />
      </label>
      {numeric ? (
        <>
          <div className="grid2">
            <OptNumInput
              label="Min"
              value={lo}
              title="Axis start in data units; empty = fit the data"
              onCommit={(v) => set(minKey, v, `Chart ${which} min`)}
            />
            <OptNumInput
              label="Max"
              value={hi}
              title="Axis end in data units; empty = fit the data"
              onCommit={(v) => set(maxKey, v, `Chart ${which} max`)}
            />
          </div>
          {bad && (
            <p className="field-error small">
              {log ? 'A log axis needs 0 < min < max; ' : 'Min must be below max; '}the range is fitted to the
              data instead.
            </p>
          )}
          <TicksEditor
            ticks={x ? st.xTicks : st.yTicks}
            onCommit={(t) => set(x ? 'xTicks' : 'yTicks', t, `Chart ${which} ticks`)}
          />
        </>
      ) : (
        <p className="small muted">Categories, in the variable's level order.</p>
      )}
    </>
  );
}
