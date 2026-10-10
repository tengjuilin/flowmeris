import type { RidgeStyle } from '@flowmeris/model';
import type { ComponentProps } from 'react';
import { FontSelect } from '../../../components/controls/FontSelect.tsx';
import { ColorField } from '../../../components/ui/ColorField.tsx';
import { NumInput } from '../../../components/ui/NumInput.tsx';
import { Section } from '../../../components/ui/Section.tsx';
import { PercentSlider } from '../../../components/ui/Slider.tsx';
import { clamp } from '../../../lib/math.ts';
import { scaleRidgeFonts } from '../../../lib/ridgePanels.ts';
import { DEFAULT_RIDGE_STYLE } from '../../../lib/ridgeStyle.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** A number input that updates the plot as you type. */
const LiveNum = (p: ComponentProps<typeof NumInput>) => <NumInput live {...p} />;

/** The Figure tab: ridge colors and outline, labels, layout, histogram and base font. */
export function FigureTab({ r, fx, card }: RidgeTabProps) {
  const { style, overlap, update } = r;
  const { set, resetOf } = fx;
  return (
    <>
      <Section
        id="ridgeStyle"
        {...resetOf('ridgeStyle', 'ridge style')}
        title="Ridge style"
        {...card('ridgeStyle')}
      >
        <label className="field">
          Color
          <select
            value={style.colorMode}
            onChange={(e) => set('colorMode', e.target.value as RidgeStyle['colorMode'], 'Ridge color mode')}
          >
            <option value="single">Single color</option>
            <option value="palette">Categorical palette</option>
          </select>
        </label>
        {style.colorMode === 'single' && (
          <ColorField
            inline
            label="Fill color"
            value={style.color}
            onChange={(v) => set('color', v, 'Ridge color', 'color')}
            reset={{
              disabled: style.color === DEFAULT_RIDGE_STYLE.color,
              label: 'Reset fill color to the default',
              title:
                style.color === DEFAULT_RIDGE_STYLE.color
                  ? 'Fill color is the default'
                  : 'Reset fill color to the default',
              onReset: () => set('color', DEFAULT_RIDGE_STYLE.color, 'Ridge color', 'color'),
            }}
          />
        )}
        <PercentSlider
          label="Fill opacity"
          value={style.fillOpacity}
          max={1}
          onChange={(v) => set('fillOpacity', v, 'Ridge opacity', 'opacity')}
        />
        <ColorField
          label="Outline color"
          inputLabel="Outline color"
          inputTitle={
            style.strokeColor === undefined ? 'Matches the background; pick to override' : undefined
          }
          value={style.strokeColor ?? '#ffffff'}
          onChange={(v) => set('strokeColor', v, 'Ridge outline color', 'stroke')}
          reset={{
            disabled: style.strokeColor === undefined,
            label: 'Reset outline color to match the background',
            title:
              style.strokeColor === undefined
                ? 'Outline already matches the background'
                : 'Reset outline to match the background',
            onReset: () => set('strokeColor', undefined, 'Ridge outline color'),
          }}
        />
        <div className="grid2">
          <LiveNum
            label="Outline width"
            step={0.25}
            value={style.strokeWidth}
            onCommit={(v) => set('strokeWidth', clamp(v, 0, 10), 'Ridge outline width')}
          />
        </div>
      </Section>
      <Section id="labels" {...resetOf('labels', 'ridge labels')} title="Ridge labels" {...card('labels')}>
        <label className="field check">
          <input
            type="checkbox"
            checked={style.showLabels}
            onChange={(e) => set('showLabels', e.target.checked, 'Ridge labels')}
          />
          Show labels
        </label>
        <label className="field check sub-option">
          <input
            type="checkbox"
            checked={style.showCounts}
            disabled={!style.showLabels}
            onChange={(e) => set('showCounts', e.target.checked, 'Ridge event counts')}
          />
          Show event counts (n)
        </label>
        <label className="field check sub-option sub-option-2">
          <input
            type="checkbox"
            checked={style.countOnNewLine}
            disabled={!style.showLabels || !style.showCounts}
            onChange={(e) => set('countOnNewLine', e.target.checked, 'Ridge count on new line')}
          />
          Event count on its own line
        </label>
        <div className="grid2">
          <LiveNum
            label="Label width (px)"
            step={10}
            title={style.labelOverflow === 'widen' ? 'Set automatically to fit the longest label' : undefined}
            value={style.labelWidth}
            onCommit={(v) => set('labelWidth', clamp(v, 0, 1000), 'Ridge label width')}
          />
        </div>
        <label className="field" title="What to do with a label wider than the label column">
          Long labels
          <select
            value={style.labelOverflow}
            onChange={(e) =>
              set('labelOverflow', e.target.value as RidgeStyle['labelOverflow'], 'Ridge long labels')
            }
          >
            <option value="wrap">Wrap onto more lines</option>
            <option value="widen">Widen the label column</option>
          </select>
        </label>
      </Section>
      <Section id="layout" {...resetOf('layout', 'layout', true)} title="Layout" {...card('layout')}>
        <PercentSlider
          label="Overlap"
          value={overlap}
          max={0.9}
          onChange={(v) =>
            update(
              'Ridge overlap',
              (l) => {
                l.overlap = v;
              },
              'overlap',
            )
          }
        />
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={style.rowHeight === undefined}
              onChange={(e) => set('rowHeight', e.target.checked ? undefined : 40, 'Ridge row height')}
            />
            Auto row height
          </label>
          {style.rowHeight !== undefined && (
            <div className="sub-option">
              <LiveNum
                label="Row height (px)"
                step={1}
                value={style.rowHeight}
                onCommit={(v) => set('rowHeight', clamp(v, 8, 400), 'Ridge row height')}
              />
            </div>
          )}
        </div>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={style.width === undefined}
              onChange={(e) => set('width', e.target.checked ? undefined : 800, 'Ridge plot width')}
            />
            Fit width
          </label>
          {style.width !== undefined && (
            <div className="sub-option">
              <LiveNum
                label="Width (px)"
                step={10}
                value={style.width}
                onCommit={(v) => set('width', clamp(v, 300, 10000), 'Ridge plot width')}
              />
            </div>
          )}
        </div>
        <div className="grid2">
          <label className="field check">
            <input
              type="checkbox"
              checked={style.aspect === undefined}
              onChange={(e) => set('aspect', e.target.checked ? undefined : 1.5, 'Ridge aspect ratio')}
            />
            Free aspect ratio
          </label>
          {style.aspect !== undefined && (
            <div className="sub-option">
              <LiveNum
                label="Width ÷ height"
                step={0.1}
                title="Fixes the figure's shape; row height is derived to fit"
                value={style.aspect}
                onCommit={(v) => set('aspect', clamp(v, 0.2, 10), 'Ridge aspect ratio')}
              />
            </div>
          )}
        </div>
      </Section>
      <Section id="histogram" {...resetOf('histogram', 'histogram')} title="Histogram" {...card('histogram')}>
        <div className="grid2">
          <LiveNum
            label="Bins"
            step={16}
            title="Histogram bins across the x range"
            value={style.bins}
            onCommit={(v) => set('bins', clamp(Math.round(v), 16, 1024), 'Ridge bins')}
          />
          <LiveNum
            label="Smoothing σ (bins)"
            step={0.5}
            title="Gaussian smoothing of each curve; 0 for none"
            value={style.smoothing}
            onCommit={(v) => set('smoothing', clamp(v, 0, 20), 'Ridge smoothing')}
          />
        </div>
      </Section>
      <Section id="baseFont" {...resetOf('baseFont', 'base font')} title="Base font" {...card('baseFont')}>
        <FontSelect
          label="Base font"
          value={style.fontFamily}
          onChange={(v) => set('fontFamily', v ?? 'arial', 'Ridge font')}
        />
        <ColorField
          inline
          label="Base font color"
          value={style.fontColor}
          onChange={(v) => set('fontColor', v, 'Ridge font color', 'fontColor')}
          reset={{
            disabled: style.fontColor === DEFAULT_RIDGE_STYLE.fontColor,
            label: 'Reset base font color to black',
            title:
              style.fontColor === DEFAULT_RIDGE_STYLE.fontColor
                ? 'Base font color is the default'
                : 'Reset base font color to black',
            onReset: () => set('fontColor', DEFAULT_RIDGE_STYLE.fontColor, 'Ridge font color'),
          }}
        />
        <LiveNum
          label="Base font size (px)"
          step={0.5}
          title="Scales the label, tick and title sizes together"
          value={style.fontSize}
          onCommit={(v) => {
            if (clamp(v, 4, 48) === style.fontSize) return;
            update('Ridge base font size', (l) => void scaleRidgeFonts(l.style, v), 'style:fontSize');
          }}
        />
      </Section>
    </>
  );
}
