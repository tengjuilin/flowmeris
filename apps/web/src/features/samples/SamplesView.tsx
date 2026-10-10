import { useGroup, useStore } from '../../state/store.ts';

/** The Samples view: the group's files, and the selected one's channels, parser notes and keywords. */
export function SamplesView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  if (!group) return <div className="empty">Select a group.</div>;
  const sid = ui.sampleId ?? group.sampleIds[0]!;
  const s = ws.samples[sid];
  return (
    <div className="samples-view">
      <div className="table-wrap stats-scroll">
        <table className="stats">
          <thead>
            <tr>
              <th>File</th>
              <th>Events</th>
              <th>FCS</th>
              <th>Cytometer</th>
              <th>Date</th>
              <th>Notes</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {group.sampleIds.map((id) => {
              const x = ws.samples[id]!;
              return (
                <tr key={id} className={id === sid ? 'on' : ''}>
                  <th scope="row">
                    <button type="button" className="link" onClick={() => setUi({ sampleId: id })}>
                      {x.relativePath}
                    </button>
                  </th>
                  <td>{x.eventCount.toLocaleString()}</td>
                  <td>{x.fcsVersion}</td>
                  <td>{x.keywords.$CYT ?? ''}</td>
                  <td>{x.keywords.$DATE ?? ''}</td>
                  <td title={x.parseWarnings.map((w) => `${w.code}: ${w.message}`).join('\n')}>
                    {x.parseWarnings.length || ''}
                  </td>
                  <td className="mono small">{x.sha256.slice(0, 12)}…</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s && (
        <>
          <h3>Channels · {s.fileName}</h3>
          <div className="table-wrap stats-scroll">
            <table className="stats">
              <thead>
                <tr>
                  <th>#</th>
                  <th>$PnN</th>
                  <th>$PnS</th>
                  <th>Type</th>
                  <th>$PnB</th>
                  <th>$PnR</th>
                  <th>$PnE</th>
                  <th>$PnG</th>
                </tr>
              </thead>
              <tbody>
                {s.channels.map((c) => (
                  <tr key={c.n}>
                    <td>{c.n}</td>
                    <th scope="row">{c.pnn}</th>
                    <td>{c.pns ?? ''}</td>
                    <td>
                      {c.kind} ({c.dataType})
                    </td>
                    <td>{c.pnb}</td>
                    <td>{c.pnr}</td>
                    <td>{c.pne.join(',')}</td>
                    <td>{c.png ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.parseWarnings.length > 0 && (
            <>
              <h3>Parser notes</h3>
              <ul className="warnings">
                {s.parseWarnings.map((w, i) => (
                  <li key={i}>
                    <code>{w.code}</code> {w.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Keywords</h3>
          <div className="table-wrap keywords">
            <table className="stats">
              <tbody>
                {Object.entries(s.keywords)
                  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                  .map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row" className="mono">
                        {k}
                      </th>
                      <td className="mono">{v.length > 300 ? `${v.slice(0, 300)}…` : v}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
