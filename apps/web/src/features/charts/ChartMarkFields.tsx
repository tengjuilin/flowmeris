import { NumInput } from '../../components/ui/NumInput.tsx';
import { Slider } from '../../components/ui/Slider.tsx';
import { LINE_DASHES, MARKER_SHAPES, POINT_SHAPES } from '../../lib/chartMarks.ts';
import { clamp } from '../../lib/math.ts';
import { AutoPxField, PxField, SeriesColorField, StyleColorField, StyleSelect } from './ChartStyleFields.tsx';
import type { ChartData } from './useChart.ts';

/** The fields of each kind of chart mark: mean markers, bars, the line, error bars and replicate points. */

/** Swatch colors shown while a color is the theme's. */
const BACKGROUND = '#ffffff';
const THEME_TEXT = '#6b6b6b';

/** Bar or group width: automatic, or a share of the category (bar and dot charts). */
function BandWidthFields({ c, bar }: { c: ChartData; bar: boolean }) {
  const st = c.plot!.style;
  return (
    <div className="grid2">
      <label className="field check">
        <input
          type="checkbox"
          checked={st.barWidth === undefined}
          onChange={(e) => c.set('barWidth', e.target.checked ? undefined : 0.8, 'Chart bar width')}
        />
        Auto {bar ? 'bar' : 'group'} width
      </label>
      {st.barWidth !== undefined && (
        <NumInput
          label="Width (% of category)"
          step={5}
          value={Math.round(st.barWidth * 100)}
          onCommit={(v) => c.set('barWidth', clamp(v / 100, 0.05, 1), 'Chart bar width')}
        />
      )}
    </div>
  );
}

/** Mean markers (scatter, line and dot charts): shape, size, colors and edge; or the horizontal line. */
export function MeanMarkerFields({ c }: { c: ChartData }) {
  const st = c.plot!.style;
  const hline = st.markerShape === 'hline';
  return (
    <>
      <Slider
        label="Marker opacity"
        value={st.fillOpacity}
        onChange={(v) => c.set('fillOpacity', v, 'Chart opacity', 'opacity')}
      />
      <StyleSelect c={c} k="markerShape" label="Marker shape" options={MARKER_SHAPES} />
      {hline ? (
        <>
          <div className="grid2">
            <PxField c={c} k="meanLineWidth" label="Mean line width (px)" max={20} />
            <AutoPxField
              c={c}
              k="meanLineLength"
              label="Mean line length (px)"
              max={200}
              title="Empty = as wide as the series' replicates"
            />
          </div>
          <SeriesColorField c={c} k="meanLineColor" label="Mean line color" />
        </>
      ) : (
        <>
          <div className="grid2">
            <PxField c={c} k="markerSize" label="Marker size (px)" max={30} step={0.5} />
            <AutoPxField
              c={c}
              k="markerEdgeWidth"
              label="Edge width (px)"
              max={10}
              title="Empty = half the marker size, at most 2 px"
            />
          </div>
          <SeriesColorField c={c} k="markerColor" label="Marker color" />
          <StyleColorField
            c={c}
            k="markerEdgeColor"
            label="Marker edge color"
            shown={BACKGROUND}
            unset="the background"
          />
        </>
      )}
      {c.band && <BandWidthFields c={c} bar={false} />}
    </>
  );
}

/** Bars: opacity, width and outline. */
export function BarFields({ c }: { c: ChartData }) {
  const st = c.plot!.style;
  return (
    <>
      <Slider
        label="Bar opacity"
        value={st.fillOpacity}
        onChange={(v) => c.set('fillOpacity', v, 'Chart opacity', 'opacity')}
      />
      <BandWidthFields c={c} bar />
      <div className="grid2">
        <PxField c={c} k="barEdgeWidth" label="Outline width (px)" max={10} title="0 = no outline" />
      </div>
      <SeriesColorField c={c} k="barEdgeColor" label="Outline color" />
    </>
  );
}

/** The line joining a line chart's means: width, color and dash. */
export function LineFields({ c }: { c: ChartData }) {
  return (
    <>
      <div className="grid2">
        <PxField c={c} k="lineWidth" label="Line width (px)" max={20} />
      </div>
      <SeriesColorField c={c} k="lineColor" label="Line color" />
      <StyleSelect c={c} k="lineDash" label="Line style" options={LINE_DASHES} />
    </>
  );
}

/** Error bars: width, cap width and color. */
export function ErrorBarFields({ c }: { c: ChartData }) {
  return (
    <>
      <div className="grid2">
        <PxField c={c} k="errorWidth" label="Error bar width (px)" max={10} />
        <AutoPxField c={c} k="capWidth" label="Cap width (px)" max={60} title="Empty = automatic" />
      </div>
      <StyleColorField c={c} k="errorColor" label="Error bar color" shown={THEME_TEXT} unset="the theme's" />
    </>
  );
}

/** Replicate points: shape, size, fill and edge, and opacity. */
export function ReplicateFields({ c }: { c: ChartData }) {
  const st = c.plot!.style;
  const bar = c.plot!.kind === 'bar';
  return (
    <>
      <StyleSelect c={c} k="pointShape" label="Replicate shape" options={POINT_SHAPES} />
      <div className="grid2">
        <PxField c={c} k="pointSize" label="Replicate size (px)" max={20} step={0.5} />
        <AutoPxField
          c={c}
          k="pointEdgeWidth"
          label="Edge width (px)"
          max={10}
          title={`Empty = ${bar ? 1 : 1.5} px`}
        />
      </div>
      {bar ? (
        <StyleColorField
          c={c}
          k="pointColor"
          label="Replicate color"
          shown={BACKGROUND}
          unset="the background"
        />
      ) : (
        <SeriesColorField c={c} k="pointColor" label="Replicate color" />
      )}
      <StyleColorField
        c={c}
        k="pointEdgeColor"
        label="Replicate edge color"
        shown={bar ? '#1a1a1a' : BACKGROUND}
        unset={bar ? 'the text color' : 'the background'}
      />
      <label className="field check">
        <input
          type="checkbox"
          checked={st.pointOpacity === undefined}
          onChange={(e) =>
            c.set('pointOpacity', e.target.checked ? undefined : bar ? 0.85 : 0.55, 'Chart replicate opacity')
          }
        />
        Auto replicate opacity
      </label>
      {st.pointOpacity !== undefined && (
        <Slider
          label="Replicate opacity"
          value={st.pointOpacity}
          onChange={(v) => c.set('pointOpacity', v, 'Chart replicate opacity', 'point-opacity')}
        />
      )}
    </>
  );
}
