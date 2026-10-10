import { tidyRows, toCsv, wideRows } from '@flowmeris/export';
import { populationPath } from '@flowmeris/model';
import { type Cell, tableRows } from '@flowmeris/table';
import { ActionRow } from '../../components/ui/ActionRow.tsx';
import { ExportIcon } from '../../components/ui/icons.tsx';
import { Card, SettingsPanel } from '../../components/ui/settings/index.ts';
import { getPool } from '../../engine-client/pool.ts';
import { download } from '../../lib/download.ts';
import { STATS_PANEL } from '../../lib/panelSpecs.ts';
import { distinctValues, eventsFileName, gatingMlFiles, statsCsvName } from '../../lib/statsExport.ts';
import { exportKeys } from '../../lib/statsFormat.ts';
import { useAnalysisTable } from '../../state/hooks/stats.ts';
import { useSettingsPanel } from '../../state/prefs.ts';
import { APP_INFO, contextFor, useGroup, useStore } from '../../state/store.ts';

import { DerivedPanel } from './DerivedColumns.tsx';
import { AddStatForm, ColumnsChecklist, GroupByFields, SummaryFields } from './StatsFields.tsx';

/** Settings panel of the Statistics view: statistics and derived columns, replicates, exports. */
export function StatsInspector() {
  const popId = useStore((s) => s.ui.popId);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const group = useGroup();
  const { stats, perSample, aggregated, errors } = useAnalysisTable(group);
  const { pops, rows, busy, complete, marker, shown } = stats;
  // The last tab and collapsed cards, remembered in this browser.
  const { tab, setTab, card } = useSettingsPanel(STATS_PANEL);

  if (!group) return null;
  const display = aggregated ?? perSample;

  const valuesOf = (variableId: string): Cell[] => distinctValues(perSample.rows, variableId);

  const exportTable = () => {
    const keys = exportKeys(display, !!aggregated, group.analysis.exportColumns);
    const kind = aggregated ? 'grouped' : 'samples';
    download(statsCsvName(group.name, kind), toCsv(tableRows(display, keys)), 'text/csv');
  };

  const exportStats = (kind: 'tidy' | 'wide') => {
    const ws = useStore.getState().ws;
    // Only the samples checked in the sidebar (cells are computed for those alone).
    const g = { ...group, sampleIds: shown };
    const cells = rows.flatMap((r) => (r.stale || !r.table ? [] : r.table.cells));
    const out = kind === 'tidy' ? tidyRows(ws, g, cells, APP_INFO.version) : wideRows(ws, g, cells);
    download(statsCsvName(group.name, kind), toCsv(out), 'text/csv');
  };

  const exportGml = () => {
    for (const f of gatingMlFiles(useStore.getState().ws, group, APP_INFO.version))
      download(f.name, f.xml, 'application/xml');
  };

  const exportEvents = async (format: 'fcs' | 'csv', mode: 'raw' | 'compensated') => {
    const ws = useStore.getState().ws;
    const sid = selectedSample ?? group.sampleIds[0];
    if (!sid) return;
    const s = ws.samples[sid]!;
    const path = populationPath(group.template, popId);
    const bytes = await getPool().exportEvents(contextFor(ws, group), sid, popId, mode, format, {
      FLOWMERIS_VERSION: `${APP_INFO.version} (${APP_INFO.commit})`,
      FLOWMERIS_SRC_SHA256: s.sha256,
      FLOWMERIS_SRC_FILE: s.fileName,
      FLOWMERIS_POPULATION: path,
      FLOWMERIS_VALUES: mode === 'raw' ? 'linearised, uncompensated' : 'linearised, compensated',
    });
    download(eventsFileName(s.fileName, group.template.populations[popId]?.name, format), bytes);
  };

  const eventSample = useStore.getState().ws.samples[selectedSample ?? group.sampleIds[0] ?? ''];
  const pending = complete ? '' : ' (statistics are still being computed)';

  return (
    <SettingsPanel
      spec={STATS_PANEL}
      tab={tab}
      onTab={setTab}
      className="stats-inspector"
      head={
        (shown.length < group.sampleIds.length || busy > 0) && (
          <p className="muted small stats-status">
            {shown.length < group.sampleIds.length &&
              `${shown.length} of ${group.sampleIds.length} samples (sidebar selection)`}
            {shown.length < group.sampleIds.length && busy > 0 && ' · '}
            {busy > 0 && `computing… ${busy} sample(s) left`}
          </p>
        )
      }
    >
      {tab === 'statistics' && (
        <>
          <Card {...card('addStat')}>
            <AddStatForm group={group} pops={pops} marker={marker} />
          </Card>
          <Card {...card('derived')}>
            <DerivedPanel group={group} columns={perSample.columns} errors={errors} valuesOf={valuesOf} />
          </Card>
        </>
      )}
      {tab === 'replicates' && (
        <>
          <Card {...card('combine')}>
            <GroupByFields group={group} />
          </Card>
          <Card {...card('summaries')}>
            <SummaryFields group={group} />
          </Card>
        </>
      )}
      {tab === 'export' && (
        <>
          <Card {...card('tableCsv')}>
            <ActionRow
              label="CSV (table)"
              title={
                (aggregated
                  ? 'Download the grouped table, with the chosen columns'
                  : 'Download the table as shown, with the chosen columns') + pending
              }
              icon={<ExportIcon />}
              disabled={!complete}
              onClick={exportTable}
            />
            <ColumnsChecklist group={group} table={perSample} />
          </Card>
          <Card {...card('statsCsv')}>
            <ActionRow
              label="CSV (tidy)"
              title={`Download one row per sample × population × statistic, with provenance${pending}`}
              icon={<ExportIcon />}
              disabled={!complete}
              onClick={() => exportStats('tidy')}
            />
            <ActionRow
              label="CSV (wide)"
              title={`Download one row per sample, one column per population × statistic${pending}`}
              icon={<ExportIcon />}
              disabled={!complete}
              onClick={() => exportStats('wide')}
            />
          </Card>
          <Card {...card('gatingMl')}>
            <ActionRow
              label="Gating-ML"
              title="Download Gating-ML 2.0 for the group template (+ effective gates of overridden samples)"
              icon={<ExportIcon />}
              disabled={false}
              onClick={exportGml}
            />
          </Card>
          <Card {...card('events')}>
            <ActionRow
              label="FCS (raw)"
              title="Download FCS 3.1 with linearised, uncompensated values; original keywords and $SPILLOVER kept"
              icon={<ExportIcon />}
              disabled={!eventSample}
              onClick={() => void exportEvents('fcs', 'raw')}
            />
            <ActionRow
              label="CSV (compensated)"
              title="Download the events as CSV, linearised and compensated"
              icon={<ExportIcon />}
              disabled={!eventSample}
              onClick={() => void exportEvents('csv', 'compensated')}
            />
          </Card>
        </>
      )}
    </SettingsPanel>
  );
}
