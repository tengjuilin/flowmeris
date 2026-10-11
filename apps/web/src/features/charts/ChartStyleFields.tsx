import type { ChartStyle } from '@flowmeris/model';
import { ColorField } from '../../components/ui/ColorField.tsx';
import { NumInput, OptNumInput } from '../../components/ui/NumInput.tsx';
import { seriesColor, seriesKey } from '../../lib/chartStyle.ts';
import { clamp } from '../../lib/math.ts';
import type { ChartData } from './useChart.ts';

/** The building blocks of the chart's line and point settings, so every mark offers them the same way. */

type ColorKey = {
  [K in keyof ChartStyle]-?: ChartStyle[K] extends string | undefined ? K : never;
}[keyof ChartStyle];
type NumKey = {
  [K in keyof ChartStyle]-?: ChartStyle[K] extends number | undefined ? K : never;
}[keyof ChartStyle];

/**
 * A color that is unset until picked. `unset` says what is drawn meanwhile ("the series' colors",
 * "the theme's"), and `shown` is the swatch's color then.
 */
export function StyleColorField({
  c,
  k,
  label,
  shown,
  unset,
}: {
  c: ChartData;
  k: ColorKey;
  label: string;
  shown: string;
  unset: string;
}) {
  const v = c.plot!.style[k] as string | undefined;
  return (
    <ColorField
      inline
      label={label}
      inputLabel={label}
      inputTitle={
        v === undefined ? `${unset[0]!.toUpperCase()}${unset.slice(1)}; pick to override` : undefined
      }
      value={v ?? shown}
      onChange={(x) => c.set(k, x, `Chart ${label.toLowerCase()}`)}
      reset={{
        disabled: v === undefined,
        label: `Reset ${label.toLowerCase()} to ${unset}`,
        title: v === undefined ? `${label} is ${unset}` : `Reset ${label.toLowerCase()} to ${unset}`,
        onReset: () => c.set(k, undefined, `Chart ${label.toLowerCase()}`),
      }}
    />
  );
}

/** A color that follows each series until one color is picked for all of them. */
export function SeriesColorField({ c, k, label }: { c: ChartData; k: ColorKey; label: string }) {
  const st = c.plot!.style;
  const first = seriesColor(st, seriesKey(c.allSeries[0]?.key), 0);
  return <StyleColorField c={c} k={k} label={label} shown={first} unset="the series' colors" />;
}

/** A width or size in px, clamped to [0, max]. */
export function PxField({
  c,
  k,
  label,
  max,
  step = 0.25,
  title,
}: {
  c: ChartData;
  k: NumKey;
  label: string;
  max: number;
  step?: number;
  title?: string;
}) {
  const v = c.plot!.style[k] as number;
  return (
    <NumInput
      label={label}
      step={step}
      title={title}
      value={v}
      onCommit={(x) => c.set(k, clamp(x, 0, max), `Chart ${label.replace(/ \(px\)$/, '').toLowerCase()}`)}
    />
  );
}

/** A width in px that may be left empty (= automatic). */
export function AutoPxField({
  c,
  k,
  label,
  max,
  title,
}: {
  c: ChartData;
  k: NumKey;
  label: string;
  max: number;
  title: string;
}) {
  return (
    <OptNumInput
      label={label}
      title={title}
      value={c.plot!.style[k] as number | undefined}
      onCommit={(x) =>
        c.set(
          k,
          x === undefined ? x : clamp(x, 0, max),
          `Chart ${label.replace(/ \(px\)$/, '').toLowerCase()}`,
        )
      }
    />
  );
}

/** A choice among `options`. */
export function StyleSelect<K extends keyof ChartStyle>({
  c,
  k,
  label,
  options,
}: {
  c: ChartData;
  k: K;
  label: string;
  options: { id: ChartStyle[K] & string; label: string }[];
}) {
  return (
    <label className="field">
      {label}
      <select
        value={c.plot!.style[k] as string}
        onChange={(e) => c.set(k, e.target.value as ChartStyle[K], `Chart ${label.toLowerCase()}`)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
