import { ColorField } from '../../components/ui/ColorField.tsx';
import { NumInput, OptNumInput } from '../../components/ui/NumInput.tsx';
import { seriesColor, seriesKey } from '../../lib/chartStyle.ts';
import { clamp } from '../../lib/math.ts';
import type { ChartData } from './useChart.ts';

/**
 * The size of the mean markers; for the horizontal-line marker, its width, length and color (the series
 * color unless one is picked).
 */
export function MarkerFields({ c }: { c: ChartData }) {
  const { set } = c;
  const st = c.plot!.style;
  if (st.markerShape !== 'hline')
    return (
      <div className="grid2">
        <NumInput
          label="Marker size (px)"
          step={0.5}
          value={st.markerSize}
          onCommit={(v) => set('markerSize', clamp(v, 0, 30), 'Chart marker size')}
        />
      </div>
    );
  const first = seriesColor(st, seriesKey(c.allSeries[0]?.key), 0);
  return (
    <>
      <div className="grid2">
        <NumInput
          label="Mean line width (px)"
          step={0.25}
          value={st.meanLineWidth}
          onCommit={(v) => set('meanLineWidth', clamp(v, 0, 20), 'Chart mean line width')}
        />
        <OptNumInput
          label="Mean line length (px)"
          title="Empty = as wide as the series' replicates"
          value={st.meanLineLength}
          onCommit={(v) =>
            set('meanLineLength', v === undefined ? v : clamp(v, 0, 200), 'Chart mean line length')
          }
        />
      </div>
      <ColorField
        inline
        label="Mean line color"
        inputLabel="Mean line color"
        inputTitle={
          st.meanLineColor === undefined ? "Each series' color; pick one color for every line" : undefined
        }
        value={st.meanLineColor ?? first}
        onChange={(v) => set('meanLineColor', v, 'Chart mean line color')}
        reset={{
          disabled: st.meanLineColor === undefined,
          label: "Reset mean line color to the series' colors",
          title:
            st.meanLineColor === undefined
              ? "Mean lines have their series' colors"
              : "Reset mean line color to the series' colors",
          onReset: () => set('meanLineColor', undefined, 'Chart mean line color'),
        }}
      />
    </>
  );
}
