import type { Group } from '@flowmeris/model';
import { useSampleNames, useStore } from '../state/store.ts';
import { drill } from './PlotPanel.tsx';

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
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  const activeGroup = ws.groups.find((g) => g.id === ui.groupId);
  const names = useSampleNames(activeGroup);

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
                          if (e.target.checked) delete excluded[id];
                          else excluded[id] = true;
                          setUi({ excluded });
                        }}
                      />
                      <button
                        type="button"
                        className={sel ? 'on' : ''}
                        onClick={() => setUi({ sampleId: id })}
                        title={`${s.relativePath}${s.datasetIndex ? ` (dataset ${s.datasetIndex + 1})` : ''}\nSHA-256 ${s.sha256}`}
                      >
                        <span className="name">{names[id] ?? s.fileName}</span>
                        <span className="badges">
                          {ui.missing[id] && (
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
