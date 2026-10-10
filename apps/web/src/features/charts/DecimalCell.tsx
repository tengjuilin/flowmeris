import { fmtChart, splitDecimal } from '../../lib/chartStyle.ts';

/** Width in `ch` of the longest fractional part (with its point and any exponent) among `values`. */
export function fracWidthOf(values: number[]): number {
  return Math.max(0, ...values.map((v) => splitDecimal(fmtChart(v))[1].length));
}

/** A number cell whose decimal points line up down the column: the integer part is right-aligned against a fractional part of fixed width. */
export function DecimalCell({ value, width }: { value: number; width: number }) {
  const [int, frac] = splitDecimal(fmtChart(value));
  return (
    <td>
      {int}
      <span className="decimal-frac" style={{ width: `${width}ch` }}>
        {frac}
      </span>
    </td>
  );
}
