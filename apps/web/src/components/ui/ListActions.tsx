import { ResetIcon, ReverseIcon } from './icons.tsx';

/** One reset of a reorderable list: "Order", "Colors", "Labels". */
export interface ListReset {
  /** The button's text, after the reset icon. */
  label: string;
  /** Tooltip and accessible name. */
  title: string;
  disabled: boolean;
  run: () => void;
}

/**
 * The buttons above a reorderable list (ridge rows, chart series): Reverse, then one reset per kind of
 * per-row setting, each with its icon.
 */
export function ListActions({ onReverse, resets }: { onReverse: () => void; resets: ListReset[] }) {
  return (
    <div className="list-actions">
      <button type="button" title="Reverse the order" onClick={onReverse}>
        <ReverseIcon />
        Reverse
      </button>
      {resets.map((r) => (
        <button
          key={r.label}
          type="button"
          title={r.title}
          aria-label={r.title}
          disabled={r.disabled}
          onClick={r.run}
        >
          <ResetIcon />
          {r.label}
        </button>
      ))}
    </div>
  );
}
