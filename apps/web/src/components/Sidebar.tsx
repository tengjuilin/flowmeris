import type { Group } from '@flowmeris/model';
import { useRef, useState } from 'react';
import { drill } from '../state/commands/plots.ts';
import { useSampleNames, useStore } from '../state/store.ts';

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

export function Sidebar() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const missing = useStore((s) => s.status.missing);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  const activeGroup = ws.groups.find((g) => g.id === ui.groupId);
  const names = useSampleNames(activeGroup);
  const [editing, setEditing] = useState<string | null>(null);
  /** Last sample clicked: the start of a shift-click range. */
  const anchor = useRef<string | null>(null);

  /**
   * Multi-select of the shown samples, like a file list: shift-click adds or removes the range from the last
   * click, ctrl/cmd-click adds or removes one sample. Returns false for a plain click.
   */
  const multiSelect = (
    g: Group,
    id: string,
    e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => {
    const from = anchor.current ? g.sampleIds.indexOf(anchor.current) : -1;
    if (e.shiftKey && from >= 0) {
      const [lo, hi] = [from, g.sampleIds.indexOf(id)].sort((a, b) => a - b) as [number, number];
      // Hide the range if it is all shown, else show all of it; samples outside it are left as they are.
      const range = g.sampleIds.slice(lo, hi + 1);
      const show = range.some((sid) => ui.excluded[sid]);
      const excluded = { ...ui.excluded };
      for (const sid of range) {
        if (show) delete excluded[sid];
        else excluded[sid] = true;
      }
      setUi({ excluded });
      return true;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) {
      const excluded = { ...ui.excluded };
      if (excluded[id]) delete excluded[id];
      else excluded[id] = true;
      setUi({ excluded });
      return true;
    }
    return false;
  };

  return (
    <nav className="sidebar" aria-label="Groups and samples">
      {ws.groups.map((g) => {
        const active = g.id === ui.groupId;
        const nOv = new Set(g.overrides.map((o) => o.sampleId));
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
            {active && (
              <ul className="sample-list">
                {g.sampleIds.map((id) => {
                  const s = ws.samples[id];
                  if (!s) return null;
                  const sel = id === ui.sampleId;
                  return (
                    <li key={id}>
                      <input
                        type="checkbox"
                        checked={!ui.excluded[id]}
                        aria-label={`Show ${names[id] ?? s.fileName} in Tiles, Ridge and Statistics`}
                        title="Show in the Tiles, Ridge and Statistics views"
                        onChange={(e) => {
                          const excluded = { ...ui.excluded };
                          const from = anchor.current ? g.sampleIds.indexOf(anchor.current) : -1;
                          const shift = (e.nativeEvent as MouseEvent).shiftKey && from >= 0;
                          const to = g.sampleIds.indexOf(id);
                          const ids = shift
                            ? g.sampleIds.slice(Math.min(from, to), Math.max(from, to) + 1)
                            : [id];
                          for (const sid of ids) {
                            if (e.target.checked) delete excluded[sid];
                            else excluded[sid] = true;
                          }
                          anchor.current = id;
                          setUi({ excluded });
                        }}
                      />
                      {editing === id ? (
                        <input
                          autoFocus
                          className="sample-rename"
                          defaultValue={names[id] ?? s.fileName}
                          aria-label="Sample name"
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const label = e.target.value.trim();
                            if (label !== (names[id] ?? s.fileName))
                              mutate('Rename sample', (w) => {
                                const smp = w.samples[id];
                                if (!smp) return;
                                if (label) smp.label = label;
                                else smp.label = undefined;
                              });
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={sel ? 'on' : ''}
                          onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                          onClick={(e) => {
                            if (!multiSelect(g, id, e)) setUi({ sampleId: id });
                          }}
                          // On macOS ctrl-click is a right-click and sends no click event.
                          onContextMenu={(e) => {
                            if (!e.ctrlKey) return;
                            e.preventDefault();
                            multiSelect(g, id, e);
                          }}
                          onDoubleClick={() => setEditing(id)}
                          title={`Click to open · shift-click for a range, ctrl/cmd-click to add or remove\nDouble-click to rename\n${s.relativePath}${s.datasetIndex ? ` (dataset ${s.datasetIndex + 1})` : ''}\nSHA-256 ${s.sha256}`}
                        >
                          <span className="name">{names[id] ?? s.fileName}</span>
                          <span className="badges">
                            {missing[id] && (
                              <span
                                className="badge danger"
                                title="Event data missing from browser storage — re-add the file"
                              >
                                missing
                              </span>
                            )}
                            {nOv.has(id) && (
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
                })}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
