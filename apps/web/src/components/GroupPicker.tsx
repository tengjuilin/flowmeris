import { type MouseEvent, useRef, useState } from 'react';

/** A group of replicates the user can show or hide, with each replicate included or excluded. */
export interface PickerGroup {
  id: string;
  label: string;
  members: { id: string; label: string }[];
}

/**
 * Checklist of groups (combined ridges, chart points). Clicking a group's row shows or hides it; its ▸
 * button lists its replicates, each of which can be left out of the group's curve or mean. Shift-click
 * sets every row from the last clicked one (in the same list) to the clicked row's new state.
 */
export function GroupPicker(props: {
  groups: PickerGroup[];
  hidden: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
  /** Show or hide groups (one undo step). */
  onShow: (ids: string[], show: boolean) => void;
  /** Include or exclude replicates (one undo step). */
  onInclude: (ids: string[], include: boolean) => void;
  /** Show every group and include every replicate (one undo step). */
  onShowAll: () => void;
}) {
  const { groups, hidden, excluded } = props;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Last clicked row: its list (`''` for groups, else the group id) and id.
  const anchor = useRef<{ list: string; id: string } | null>(null);
  const nHidden = groups.filter((g) => hidden.has(g.id)).length;
  const nExcluded = groups.reduce((a, g) => a + g.members.filter((m) => excluded.has(m.id)).length, 0);

  /** Toggle row `id` of `list` (ids in display order), or the range from the anchor with Shift. */
  const click = (e: MouseEvent, list: string, ids: string[], id: string, on: boolean) => {
    const a = anchor.current;
    let range = [id];
    if (e.shiftKey && a?.list === list && ids.includes(a.id)) {
      const [i, j] = [ids.indexOf(a.id), ids.indexOf(id)];
      range = ids.slice(Math.min(i, j), Math.max(i, j) + 1);
      window.getSelection()?.removeAllRanges();
    }
    anchor.current = { list, id };
    if (list) props.onInclude(range, !on);
    else props.onShow(range, !on);
  };
  const groupIds = groups.map((g) => g.id);

  return (
    <>
      <ul className="group-picker small">
        {groups.map((g) => {
          const kept = g.members.filter((m) => !excluded.has(m.id)).length;
          const shown = !hidden.has(g.id);
          const memberIds = g.members.map((m) => m.id);
          return (
            <li key={g.id} className={!shown || !kept ? 'off' : undefined}>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the checkbox inside stays keyboard-operable; its click bubbles here */}
              <div
                className="group-picker-row"
                title={g.members.map((m) => m.label).join('\n')}
                onClick={(e) => click(e, '', groupIds, g.id, shown)}
              >
                <button
                  type="button"
                  className="icon group-picker-toggle"
                  aria-expanded={open.has(g.id)}
                  aria-label={`Replicates of ${g.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = new Set(open);
                    if (!next.delete(g.id)) next.add(g.id);
                    setOpen(next);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M3 1.5 L10 6 L3 10.5 Z" fill="currentColor" />
                  </svg>
                </button>
                <input type="checkbox" checked={shown} aria-label={g.label} onChange={() => {}} />
                <span className="group-picker-label">{g.label}</span>
                <span className="muted">
                  {kept === g.members.length ? kept : `${kept} of ${g.members.length}`}
                </span>
              </div>
              {open.has(g.id) && (
                <ul>
                  {g.members.map((m) => {
                    const on = !excluded.has(m.id);
                    return (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: the checkbox inside stays keyboard-operable; its click bubbles here
                      <li
                        key={m.id}
                        className="group-picker-row"
                        onClick={(e) => click(e, g.id, memberIds, m.id, on)}
                      >
                        <input type="checkbox" checked={on} aria-label={m.label} onChange={() => {}} />
                        <span className="group-picker-label">{m.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {(nHidden > 0 || nExcluded > 0) && (
        <div className="group-picker-actions small">
          <span className="muted">
            {[
              nHidden && `${nHidden} hidden`,
              nExcluded && `${nExcluded} ${nExcluded === 1 ? 'replicate' : 'replicates'} excluded`,
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
          <button type="button" onClick={props.onShowAll}>
            Show all
          </button>
        </div>
      )}
    </>
  );
}

/** `list` with `ids` added (`on`) or removed. */
export function toggleIds(list: string[], ids: string[], on: boolean): string[] {
  const drop = new Set(ids);
  const rest = list.filter((x) => !drop.has(x));
  return on ? [...rest, ...ids] : rest;
}
