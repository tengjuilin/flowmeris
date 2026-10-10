import type { ColumnDef } from '@flowmeris/table';
import type { PickOption } from '../../components/ui/PickerMenu.tsx';
import { columnGroups } from '../../lib/chartStyle.ts';

/** Columns as picker options, under their headings. */
export function columnOptions(columns: ColumnDef[]): PickOption[] {
  return columnGroups(columns).flatMap((g) =>
    g.cols.map((c) => ({ value: c.key, label: c.label, group: g.title })),
  );
}

/** A column select, its options under the headings of `columnGroups`. */
export function ColumnSelect(props: {
  label: string;
  value: string;
  columns: ColumnDef[];
  onChange: (key: string) => void;
}) {
  const groups = columnGroups(props.columns);
  const known = props.columns.some((c) => c.key === props.value);
  return (
    <label className="field">
      {props.label}
      <select value={known ? props.value : ''} onChange={(e) => props.onChange(e.target.value)}>
        {!known && <option value="">(missing column)</option>}
        {groups.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.cols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
