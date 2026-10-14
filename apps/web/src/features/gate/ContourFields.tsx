import { type PlotStyle, REFERENCE_PLOT_PX } from '@flowmeris/model';
import { ColorField } from '../../components/ui/ColorField.tsx';
import { NumInput } from '../../components/ui/NumInput.tsx';
import { DEFAULT_STYLE } from '../../lib/figure.ts';
import { clamp } from '../../lib/math.ts';

/** Edits the plot's style; edits sharing `merge` (typing one number) fold into one undo step. */
type SetStyle = (fn: (st: PlotStyle) => void, merge?: string) => void;

const SCALES = `px at a ${REFERENCE_PLOT_PX}-px-wide plot; it scales with the plot`;

/** A color of the style, with its reset to the default. */
function StyleColor({
  label,
  title,
  value,
  def,
  onChange,
  merge,
  set,
}: {
  label: string;
  title: string;
  value: string | undefined;
  /** The default; undefined = the theme's color (the swatch shows gray). */
  def: string | undefined;
  onChange: (st: PlotStyle, v: string | undefined) => void;
  merge: string;
  set: SetStyle;
}) {
  const atDefault = (value ?? '').toLowerCase() === (def ?? '').toLowerCase();
  const reset = def === undefined ? "Reset to the theme's" : `Reset ${label.toLowerCase()}`;
  return (
    <ColorField
      inline
      label={label}
      inputLabel={label}
      inputTitle={title}
      value={value ?? '#808080'}
      onChange={(v) => set((s) => onChange(s, v), merge)}
      reset={{
        disabled: atDefault,
        label: `${reset} (${label.toLowerCase()})`,
        title: atDefault ? `${label} is the default` : reset,
        onReset: () => set((s) => onChange(s, def)),
      }}
    />
  );
}

/** The Display card's contour and zebra settings: levels, lines, outliers and the zebra colors. */
export function ContourFields({ st, zebra, set }: { st: PlotStyle; zebra: boolean; set: SetStyle }) {
  const linesShown = !zebra || st.zebraLines;
  return (
    <div className="grid2">
      <label className="field">
        Contours
        <select
          value={st.contour.mode === 'equal-prob' ? `p${st.contour.pct}` : 'log'}
          onChange={(e) =>
            set((s) => {
              const v = e.target.value;
              s.contour =
                v === 'log'
                  ? { mode: 'log', levels: 8 }
                  : { mode: 'equal-prob', pct: Number(v.slice(1)) as 2 | 5 | 10 };
            })
          }
        >
          <option value="p2">Equal probability 2%</option>
          <option value="p5">Equal probability 5%</option>
          <option value="p10">Equal probability 10%</option>
          <option value="log">Logarithmic</option>
        </select>
      </label>
      {zebra && (
        <>
          <StyleColor
            label="Outer color"
            title="Each band's color at its outer contour line"
            value={st.zebraColors[0]}
            def={DEFAULT_STYLE.zebraColors[0]}
            onChange={(s, v) => void (s.zebraColors[0] = v ?? DEFAULT_STYLE.zebraColors[0])}
            merge="zebraColor0"
            set={set}
          />
          <StyleColor
            label="Inner color"
            title="Each band's color at its inner contour line"
            value={st.zebraColors[1]}
            def={DEFAULT_STYLE.zebraColors[1]}
            onChange={(s, v) => void (s.zebraColors[1] = v ?? DEFAULT_STYLE.zebraColors[1])}
            merge="zebraColor1"
            set={set}
          />
          <label className="field check" title="Draw the contour lines over the filled bands">
            <input
              type="checkbox"
              checked={st.zebraLines}
              onChange={(e) => set((s) => void (s.zebraLines = e.target.checked))}
            />
            Contour lines
          </label>
        </>
      )}
      {linesShown && (
        <>
          <NumInput
            label="Line width (px)"
            step={0.25}
            value={st.contourWidth}
            onCommit={(v) => set((s) => void (s.contourWidth = clamp(v, 0, 10)), 'contourWidth')}
            title={`Width of the contour lines, 0–10 ${SCALES}`}
          />
          <StyleColor
            label="Line color"
            title="Color of the contour lines"
            value={st.contourColor}
            def={undefined}
            onChange={(s, v) => void (s.contourColor = v)}
            merge="contourColor"
            set={set}
          />
        </>
      )}
      <label className="field check" title="Draw the events outside the outermost contour line as points">
        <input
          type="checkbox"
          checked={st.showOutliers}
          onChange={(e) => set((s) => void (s.showOutliers = e.target.checked))}
        />
        Show outliers
      </label>
      {st.showOutliers && (
        <>
          <NumInput
            label="Outlier size (px)"
            step={0.25}
            value={st.outlierPx}
            onCommit={(v) => set((s) => void (s.outlierPx = clamp(v, 0.25, 10)), 'outlierPx')}
            title={`Size of each outlier's point, 0.25–10 ${SCALES}`}
          />
          <StyleColor
            label="Outlier color"
            title="Color of the outliers' points"
            value={st.outlierColor}
            def={DEFAULT_STYLE.outlierColor}
            onChange={(s, v) => void (s.outlierColor = v ?? DEFAULT_STYLE.outlierColor)}
            merge="outlierColor"
            set={set}
          />
        </>
      )}
    </div>
  );
}
