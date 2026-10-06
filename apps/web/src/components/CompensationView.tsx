import { CONDITION_WARN, conditionNumber, findSpillover, parseMatrixCsv } from '@flowmeris/compensation';
import { type CompMatrix, newId } from '@flowmeris/model';
import { toast, useGroup, useStore } from '../state/store.ts';

export function CompensationView() {
  const ws = useStore((s) => s.ws);
  const ui = useStore((s) => s.ui);
  const mutate = useStore((s) => s.mutate);
  const group = useGroup();
  if (!group) return <div className="empty">Select a group.</div>;
  const sid = ui.sampleId && group.sampleIds.includes(ui.sampleId) ? ui.sampleId : group.sampleIds[0]!;
  const sample = ws.samples[sid];
  const kw = sample ? findSpillover(sample.keywords) : null;
  const mode = group.compensation;
  const matrix: {
    detectors: string[];
    spill: number[][];
    label: string;
    editable: boolean;
    id?: string;
    base?: CompMatrix;
  } | null =
    mode.mode === 'none'
      ? null
      : mode.mode === 'per-sample-keyword'
        ? kw
          ? { ...kw.matrix, label: `${kw.keyword} keyword of ${sample?.fileName}`, editable: false }
          : null
        : (() => {
            const m = ws.compMatrices[mode.matrixId];
            const base =
              m?.source.kind === 'manual' && m.source.basedOn ? ws.compMatrices[m.source.basedOn] : undefined;
            return m
              ? {
                  detectors: m.detectors,
                  spill: m.spill,
                  label: m.name,
                  editable: true,
                  id: m.id,
                  ...(base ? { base } : {}),
                }
              : null;
          })();
  let cond = Number.NaN;
  try {
    if (matrix) cond = conditionNumber(matrix.spill);
  } catch {
    cond = Number.POSITIVE_INFINITY;
  }

  const setMode = (v: string) =>
    mutate('Change compensation', (w) => {
      const g = w.groups.find((x) => x.id === group.id)!;
      g.compensation =
        v === 'none'
          ? { mode: 'none' }
          : v === 'kw'
            ? { mode: 'per-sample-keyword' }
            : { mode: 'matrix', matrixId: v };
    });

  const makeEditable = () => {
    if (!matrix) return;
    const id = newId('cm_');
    mutate('Create editable matrix', (w) => {
      const m: CompMatrix = {
        id,
        name: `Edited ${matrix.label}`,
        source: { kind: 'manual' },
        detectors: [...matrix.detectors],
        spill: matrix.spill.map((r) => [...r]),
      };
      if (kw && mode.mode === 'per-sample-keyword') {
        const src: CompMatrix = {
          id: newId('cm_'),
          name: `${kw.keyword} of ${sample?.fileName}`,
          source: { kind: 'fcs-keyword', sampleId: sid, keyword: kw.keyword },
          detectors: [...kw.matrix.detectors],
          spill: kw.matrix.spill.map((r) => [...r]),
        };
        w.compMatrices[src.id] = src;
        m.source = { kind: 'manual', basedOn: src.id };
      }
      w.compMatrices[id] = m;
      w.groups.find((x) => x.id === group.id)!.compensation = { mode: 'matrix', matrixId: id };
    });
  };

  const importCsv = async (f: File) => {
    try {
      const m = parseMatrixCsv(await f.text());
      const missing = m.detectors.filter((d) => !group.channels.includes(d));
      if (missing.length) throw new Error(`Detectors not in this group: ${missing.join(', ')}`);
      const id = newId('cm_');
      mutate('Import compensation matrix', (w) => {
        w.compMatrices[id] = {
          id,
          name: f.name,
          source: { kind: 'manual' },
          detectors: m.detectors,
          spill: m.spill,
        };
        w.groups.find((x) => x.id === group.id)!.compensation = { mode: 'matrix', matrixId: id };
      });
    } catch (e) {
      toast(`Matrix import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const setCell = (i: number, j: number, pct: number) => {
    if (!matrix?.id) return;
    mutate('Edit spillover value', (w) => {
      const m = w.compMatrices[matrix.id!]!;
      m.spill[i]![j] = pct / 100;
    });
  };

  return (
    <div className="comp-view">
      <div className="toolbar">
        <label className="field">
          Compensation for “{group.name}”
          <select
            value={mode.mode === 'none' ? 'none' : mode.mode === 'per-sample-keyword' ? 'kw' : mode.matrixId}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="none">None (uncompensated)</option>
            <option value="kw">Each sample’s own $SPILLOVER keyword</option>
            {Object.values(ws.compMatrices).map((m) => (
              <option key={m.id} value={m.id}>
                Matrix: {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={makeEditable} disabled={!matrix}>
          Create editable copy
        </button>
        <label className="button">
          Import CSV…
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            hidden
            onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])}
          />
        </label>
      </div>
      {!matrix ? (
        <p className="muted">
          {mode.mode === 'per-sample-keyword'
            ? `${sample?.fileName} has no spillover keyword; its data are used uncompensated.`
            : 'Data are not compensated.'}
        </p>
      ) : (
        <>
          <p>
            <strong>{matrix.label}</strong> · {matrix.detectors.length} detectors · condition number κ₁ ={' '}
            {cond.toFixed(1)}
            {cond > CONDITION_WARN && (
              <span className="badge danger"> ill-conditioned — results are sensitive to small errors</span>
            )}
          </p>
          <p className="muted small">
            Spillover S (% of the row fluorochrome’s signal seen in the column detector). Compensated values =
            observed · S⁻¹. Applies to every sample in the group
            {mode.mode === 'per-sample-keyword' ? ' (each with its own keyword matrix)' : ''}.
          </p>
          <div className="table-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th />
                  {matrix.detectors.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.spill.map((row, i) => (
                  <tr key={matrix.detectors[i]}>
                    <th>{matrix.detectors[i]}</th>
                    {row.map((v, j) => {
                      const changed = matrix.base && matrix.base.spill[i]?.[j] !== v;
                      const shade = i === j ? 0 : Math.min(1, Math.abs(v) / 0.5);
                      return (
                        <td
                          key={j}
                          className={`${i === j ? 'diag' : ''}${changed ? ' changed' : ''}`}
                          style={{
                            background: i === j ? undefined : `rgba(42,120,214,${0.08 + shade * 0.5})`,
                          }}
                        >
                          {matrix.editable && i !== j ? (
                            <input
                              type="number"
                              step="0.01"
                              defaultValue={Number((v * 100).toFixed(4))}
                              aria-label={`Spillover of ${matrix.detectors[i]} into ${matrix.detectors[j]} (%)`}
                              onBlur={(e) => {
                                const x = Number(e.target.value);
                                if (Number.isFinite(x) && x / 100 !== v) setCell(i, j, x);
                              }}
                            />
                          ) : (
                            (v * 100).toFixed(2)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Check compensation on N×N plots of all fluorescence pairs before gating (Cossarizza et al. 2021):
            look for “leaning” or over-compensated (super-negative) populations.
          </p>
        </>
      )}
    </div>
  );
}

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
      <div className="table-wrap">
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
          <div className="table-wrap">
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
