import type { Group, Sample } from '@flowmeris/model';
import { memo, useMemo, useRef, useState } from 'react';
import { drill } from '../../state/commands/plots.ts';
import { useSampleNames, useStore } from '../../state/store.ts';

function SelectionControls({ g }: { g: Group }) {
  const excluded = useStore((s) => s.ui.excluded);
  const setUi = useStore((s) => s.setUi);
  const nSel = g.sampleIds.filter((id) => !excluded[id]).length;
  const set = (all: boolean) => {
    const next = { ...excluded };
    for (const id of g.sampleIds) {
      if (all) delete next[id];
      else next[id] = true;
    }
    setUi({ excluded: next });
  };
  return (
    <div className="selection-controls muted small">
      <span title="Checked samples are shown in the Tiles, Ridge and Statistics views">
        {nSel}/{g.sampleIds.length} shown
      </span>
      <button type="button" className="link" onClick={() => set(true)} disabled={nSel === g.sampleIds.length}>
        all
      </button>
      <button type="button" className="link" onClick={() => set(false)} disabled={nSel === 0}>
        none
      </button>
    </div>
  );
}

type Mods = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** What a sample row does: one object per sample list, so a row re-renders only when its own data changes. */
interface RowActions {
  /** Its checkbox: shift-click checks or unchecks the range from the last click. */
  check: (id: string, checked: boolean, shiftKey: boolean) => void;
  /**
   * Multi-select of the shown samples, like a file list: shift-click adds or removes the range from the last
   * click, ctrl/cmd-click adds or removes one sample. Returns false for a plain click.
   */
  multiSelect: (id: string, e: Mods) => boolean;
  open: (id: string) => void;
  startRename: (id: string) => void;
  /** Ends renaming; `label` is the new name, or undefined to keep the name. */
  endRename: (id: string, label?: string) => void;
}

/** The checked samples now (handlers read them when called, so they need not change with them). */
const excludedNow = () => useStore.getState().ui.excluded;

function toggleRange(ids: string[], show: boolean) {
  const excluded = { ...excludedNow() };
  for (const sid of ids) {
    if (show) delete excluded[sid];
    else excluded[sid] = true;
  }
  return excluded;
}

function useRowActions(sampleIds: string[] | undefined, setEditing: (id: string | null) => void): RowActions {
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  /** Last sample clicked: the start of a shift-click range. */
  const anchor = useRef<string | null>(null);
  return useMemo<RowActions>(() => {
    const ids = sampleIds ?? [];
    const anchorAt = () => (anchor.current ? ids.indexOf(anchor.current) : -1);
    return {
      check: (id, checked, shiftKey) => {
        const from = anchorAt();
        const to = ids.indexOf(id);
        const range = shiftKey && from >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
        anchor.current = id;
        setUi({ excluded: toggleRange(range, checked) });
      },
      multiSelect: (id, e) => {
        const from = anchorAt();
        if (e.shiftKey && from >= 0) {
          const [lo, hi] = [from, ids.indexOf(id)].sort((a, b) => a - b) as [number, number];
          // Hide the range if it is all shown, else show all of it; samples outside it are left as they are.
          const range = ids.slice(lo, hi + 1);
          const now = excludedNow();
          setUi({
            excluded: toggleRange(
              range,
              range.some((sid) => now[sid]),
            ),
          });
          return true;
        }
        anchor.current = id;
        if (e.ctrlKey || e.metaKey) {
          setUi({ excluded: toggleRange([id], !!excludedNow()[id]) });
          return true;
        }
        return false;
      },
      open: (id) => setUi({ sampleId: id }),
      startRename: (id) => setEditing(id),
      endRename: (id, label) => {
        if (label !== undefined)
          mutate('Rename sample', (w) => {
            const smp = w.samples[id];
            if (!smp) return;
            if (label) smp.label = label;
            else smp.label = undefined;
          });
        setEditing(null);
      },
    };
  }, [sampleIds, setUi, mutate, setEditing]);
}

export function Sidebar() {
  const groups = useStore((s) => s.ws.groups);
  const groupId = useStore((s) => s.ui.groupId);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  const activeGroup = groups.find((g) => g.id === groupId);
  const [editing, setEditing] = useState<string | null>(null);
  const actions = useRowActions(activeGroup?.sampleIds, setEditing);

  return (
    <nav className="sidebar" aria-label="Groups and samples">
      {groups.map((g) => {
        const active = g.id === groupId;
        return (
          <section key={g.id} className={`group-block${active ? ' active' : ''}`}>
            <header>
              <button
                type="button"
                className="group-name"
                onClick={() => {
                  setUi({
                    groupId: g.id,
                    sampleId: g.sampleIds[0] ?? null,
                    popId: 'root',
                    plotId: null,
                    selectedGateId: null,
                  });
                  drill('root');
                }}
                title="Open group"
              >
                {g.name}
              </button>
              <span className="muted small">{g.sampleIds.length}</span>
              {active && (
                <button
                  type="button"
                  className="icon"
                  title="Rename group"
                  onClick={() => {
                    const name = prompt('Group name', g.name);
                    if (name)
                      mutate('Rename group', (w) => void (w.groups.find((x) => x.id === g.id)!.name = name));
                  }}
                >
                  ✎
                </button>
              )}
            </header>
            {active && <SelectionControls g={g} />}
            {active && <SampleList g={g} editing={editing} actions={actions} />}
          </section>
        );
      })}
    </nav>
  );
}

function SampleList({ g, editing, actions }: { g: Group; editing: string | null; actions: RowActions }) {
  const samples = useStore((s) => s.ws.samples);
  const sampleId = useStore((s) => s.ui.sampleId);
  const excluded = useStore((s) => s.ui.excluded);
  const missing = useStore((s) => s.status.missing);
  const names = useSampleNames(g);
  const overridden = useMemo(() => new Set(g.overrides.map((o) => o.sampleId)), [g.overrides]);
  return (
    <ul className="sample-list">
      {g.sampleIds.map((id) => {
        const s = samples[id];
        if (!s) return null;
        return (
          <SampleRow
            key={id}
            id={id}
            sample={s}
            name={names[id] ?? s.fileName}
            selected={id === sampleId}
            shown={!excluded[id]}
            missing={!!missing[id]}
            overridden={overridden.has(id)}
            editing={editing === id}
            actions={actions}
          />
        );
      })}
    </ul>
  );
}

const SampleRow = memo(function SampleRow({
  id,
  sample: s,
  name,
  selected,
  shown,
  missing,
  overridden,
  editing,
  actions,
}: {
  id: string;
  sample: Sample;
  name: string;
  selected: boolean;
  shown: boolean;
  missing: boolean;
  overridden: boolean;
  editing: boolean;
  actions: RowActions;
}) {
  return (
    <li>
      <input
        type="checkbox"
        checked={shown}
        aria-label={`Show ${name} in Tiles, Ridge and Statistics`}
        title="Show in the Tiles, Ridge and Statistics views"
        onChange={(e) => actions.check(id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
      />
      {editing ? (
        <input
          autoFocus
          className="sample-rename"
          defaultValue={name}
          aria-label="Sample name"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const label = e.target.value.trim();
            actions.endRename(id, label !== name ? label : undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') actions.endRename(id);
          }}
        />
      ) : (
        <button
          type="button"
          className={selected ? 'on' : ''}
          onMouseDown={(e) => e.shiftKey && e.preventDefault()}
          onClick={(e) => {
            if (!actions.multiSelect(id, e)) actions.open(id);
          }}
          // On macOS ctrl-click is a right-click and sends no click event.
          onContextMenu={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            actions.multiSelect(id, e);
          }}
          onDoubleClick={() => actions.startRename(id)}
          title={`Click to open · shift-click for a range, ctrl/cmd-click to add or remove\nDouble-click to rename\n${s.relativePath}${s.datasetIndex ? ` (dataset ${s.datasetIndex + 1})` : ''}\nSHA-256 ${s.sha256}`}
        >
          <span className="name">{name}</span>
          <span className="badges">
            {missing && (
              <span
                className="badge danger"
                title="Event data missing from browser storage — re-add the file"
              >
                missing
              </span>
            )}
            {overridden && (
              <span className="badge warn" title="This sample has gate overrides">
                override
              </span>
            )}
            {s.parseWarnings.length > 0 && (
              <span
                className="badge"
                title={s.parseWarnings.map((w) => `${w.code}: ${w.message}`).join('\n')}
              >
                {s.parseWarnings.length} note{s.parseWarnings.length > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </button>
      )}
    </li>
  );
});
