import type { ChartStyle, StatPlot } from '@flowmeris/model';
import { TicksEditor } from '../../components/controls/TicksEditor.tsx';
import { OptNumInput } from '../../components/ui/NumInput.tsx';

/** Title, range and ticks of a chart axis (data units; not the cytometry AxisFields of the plots). */
export function ChartAxisFields(props: {
  which: 'x' | 'y';
  plot: StatPlot;
  defaultTitle: string;
  numeric: boolean;
  log: boolean;
  set: <K extends keyof ChartStyle>(key: K, value: ChartStyle[K], label: string, merge?: string) => void;
  edit: (label: string, fn: (p: StatPlot) => void, merge?: string) => void;
}) {
  const { which, plot, set } = props;
  const st = plot.style;
  const X = which.toUpperCase();
  const minKey = which === 'x' ? 'xMin' : 'yMin';
  const maxKey = which === 'x' ? 'xMax' : 'yMax';
  const lo = st[minKey];
  const hi = st[maxKey];
  const bad =
    (lo !== undefined && hi !== undefined && !(hi > lo)) ||
    (props.log && ((lo !== undefined && lo <= 0) || (hi !== undefined && hi <= 0)));
  return (
    <fieldset>
      <legend>{X} axis</legend>
      <label className="field" title="Leave empty for the column name; type a space for no title">
        Title
        <input
          type="text"
          value={(which === 'x' ? plot.xLabel : plot.yLabel) ?? ''}
          placeholder={props.defaultTitle}
          onChange={(e) =>
            props.edit(
              `Change ${which} title`,
              (p) => {
                if (which === 'x') p.xLabel = e.target.value || undefined;
                else p.yLabel = e.target.value || undefined;
              },
              `chart-${which}l:${plot.id}`,
            )
          }
        />
      </label>
      {props.numeric ? (
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
              {props.log ? 'A log axis needs 0 < min < max; ' : 'Min must be below max; '}the range is fitted
              to the data instead.
            </p>
          )}
          <TicksEditor
            ticks={which === 'x' ? st.xTicks : st.yTicks}
            onCommit={(t) => set(which === 'x' ? 'xTicks' : 'yTicks', t, `Chart ${which} ticks`)}
          />
        </>
      ) : (
        <p className="small muted">Categories, in the variable's level order.</p>
      )}
    </fieldset>
  );
}
