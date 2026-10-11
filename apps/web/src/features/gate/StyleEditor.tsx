import type { PlotSpec } from '@flowmeris/model';
import { COLORMAPS } from '@flowmeris/render';
import { NumInput } from '../../components/ui/NumInput.tsx';
import { Card } from '../../components/ui/settings/index.ts';
import { DEFAULT_FIGURE, DEFAULT_STYLE, TILE_FIGURE } from '../../lib/figure.ts';
import type { PlotCard } from '../../lib/panelSpecs.ts';
import type { CardOf } from '../../lib/settingsPanel.ts';
import { type PlotTarget, plotsOf } from '../../state/commands/plots.ts';
import { useGroup, useStore } from '../../state/store.ts';

/** The Display card: how events are drawn (colour map, point size, smoothing and so on) and the off-scale note. */
export function StyleEditor({
  plot,
  card,
  target = 'gate',
}: { plot: PlotSpec; card: CardOf<PlotCard>; target?: PlotTarget }) {
  const group = useGroup()!;
  const mutate = useStore((s) => s.mutate);
  /** Edits sharing `merge` (typing one number) fold into one undo step. */
  const set = (fn: (st: PlotSpec['style']) => void, merge?: string) =>
    mutate(
      'Change plot style',
      (w) => {
        const g = w.groups.find((x) => x.id === group.id)!;
        fn(plotsOf(g, target).find((x) => x.id === plot.id)!.style);
      },
      merge && `style:${plot.id}:${merge}`,
    );
  const st = plot.style;
  const showNote = st.figure?.showOffScaleNote ?? true;
  const changed =
    !showNote ||
    (Object.keys(DEFAULT_STYLE) as (keyof PlotSpec['style'])[]).some(
      (k) => JSON.stringify(st[k]) !== JSON.stringify(DEFAULT_STYLE[k]),
    );
  return (
    <Card
      {...card('display', {
        changed,
        onReset: () =>
          set((s) => {
            Object.assign(s, structuredClone(DEFAULT_STYLE));
            if (s.figure) s.figure.showOffScaleNote = true;
          }),
      })}
    >
      {plot.kind !== 'histogram' && (
        <div className="grid2">
          {plot.kind !== 'dot' && (
            <label className="field">
              Colour map
              <select value={st.colormap} onChange={(e) => set((s) => void (s.colormap = e.target.value))}>
                {COLORMAPS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'classic' ? 'classic (not perceptually uniform)' : c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NumInput
            label="Point size (px)"
            step={0.25}
            value={st.pointPx}
            onCommit={(v) => set((s) => void (s.pointPx = Math.max(0.25, Math.min(10, v))), 'pointPx')}
            title="Size of each event's point, 0.25–10 px; fractional sizes are allowed"
          />
          {plot.kind !== 'dot' && (
            <NumInput
              label="Smoothing σ (px)"
              value={st.smoothSigmaBins}
              onCommit={(v) =>
                set((s) => void (s.smoothSigmaBins = Math.max(0, Math.min(20, v))), 'smoothing')
              }
              title="Gaussian kernel σ of the binned density estimate, in display pixels (0 = none)"
            />
          )}
        </div>
      )}
      {plot.kind === 'contour' && (
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
          <label className="field check">
            <input
              type="checkbox"
              checked={st.showOutliers}
              onChange={(e) => set((s) => void (s.showOutliers = e.target.checked))}
            />
            Show outliers
          </label>
        </div>
      )}
      {plot.kind === 'histogram' && (
        <div className="grid2">
          <label className="field">
            Bins
            <select
              value={st.histBins}
              onChange={(e) => set((s) => void (s.histBins = Number(e.target.value)))}
            >
              {[64, 128, 256, 512, 1024].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Y axis
            <select
              value={st.histNorm}
              onChange={(e) => set((s) => void (s.histNorm = e.target.value as typeof s.histNorm))}
            >
              <option value="mode">% of max (mode)</option>
              <option value="count">Count</option>
              <option value="area">Fraction (area)</option>
            </select>
          </label>
          <label className="field check">
            <input
              type="checkbox"
              checked={st.histSmooth}
              onChange={(e) => set((s) => void (s.histSmooth = e.target.checked))}
            />
            Smooth (σ = 1.5 bins)
          </label>
        </div>
      )}
      <label
        className="field check"
        title="The count of events outside the axis range, drawn on the plot edges"
      >
        <input
          type="checkbox"
          checked={showNote}
          onChange={(e) =>
            set((s) => {
              s.figure ??= structuredClone(target === 'gate' ? DEFAULT_FIGURE : TILE_FIGURE);
              s.figure.showOffScaleNote = e.target.checked;
            })
          }
        />
        Show off-scale note
      </label>
    </Card>
  );
}
