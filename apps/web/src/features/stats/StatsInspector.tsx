import { tidyRows, toCsv, wideRows } from '@flowmeris/export';
import { populationPath } from '@flowmeris/model';
import { type Cell, tableRows } from '@flowmeris/table';
import { ActionRow } from '../../components/ui/ActionRow.tsx';
import { InspectorTabs } from '../../components/ui/InspectorTabs.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { ExportIcon } from '../../components/ui/icons.tsx';
import { getPool } from '../../engine-client/pool.ts';
import { download } from '../../lib/download.ts';
import { distinctValues, eventsFileName, gatingMlFiles, statsCsvName } from '../../lib/statsExport.ts';
import { exportKeys } from '../../lib/statsFormat.ts';
import { useAnalysisTable } from '../../state/hooks/stats.ts';
import { usePanelState } from '../../state/prefs.ts';
import { APP_INFO, contextFor, useGroup, useStore } from '../../state/store.ts';

import { DerivedPanel } from './DerivedColumns.tsx';
import { AddStatForm, ColumnsChecklist, GroupByFields, SummaryFields } from './StatsFields.tsx';

type StatsTab = 'statistics' | 'replicates' | 'export';
type StatsSectionId =
  | 'addStat'
  | 'derived'
  | 'combine'
  | 'summaries'
  | 'tableCsv'
  | 'statsCsv'
  | 'gatingMl'
  | 'events';

const STATS_TABS: { id: StatsTab; label: string }[] = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'replicates', label: 'Replicates' },
  { id: 'export', label: 'Export' },
];

const STATS_PANEL_KEY = 'flowmeris.statsPanel';
const STATS_DEFAULT_OPEN: Partial<Record<StatsSectionId, boolean>> = {
  addStat: true,
  derived: true,
  combine: true,
  summaries: true,
  tableCsv: true,
  statsCsv: true,
  gatingMl: true,
  events: true,
};

/** Settings panel of the Statistics view: statistics and derived columns, replicates, exports. */
export function StatsInspector() {
  const popId = useStore((s) => s.ui.popId);
  const selectedSample = useStore((s) => s.ui.sampleId);
  const group = useGroup();
  const { stats, perSample, aggregated, errors } = useAnalysisTable(group);
  const { pops, rows, busy, complete, marker, shown } = stats;
  // The last tab and open sections, remembered in this browser.
  const { tab, open, setTab, toggle } = usePanelState<StatsTab, StatsSectionId>(
    STATS_PANEL_KEY,
    STATS_TABS.map((t) => t.id),
    { tab: 'statistics', open: STATS_DEFAULT_OPEN },
    STATS_DEFAULT_OPEN,
  );

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
    <aside className="inspector insp-panel stats-inspector" aria-label="Statistics settings">
      <div className="insp-head">
        <InspectorTabs
          idPrefix="stats"
          label="Statistics settings"
          tabs={STATS_TABS}
          current={tab}
          onSelect={setTab}
        />
        {(shown.length < group.sampleIds.length || busy > 0) && (
          <p className="muted small stats-status">
            {shown.length < group.sampleIds.length &&
              `${shown.length} of ${group.sampleIds.length} samples (sidebar selection)`}
            {shown.length < group.sampleIds.length && busy > 0 && ' · '}
            {busy > 0 && `computing… ${busy} sample(s) left`}
          </p>
        )}
      </div>
      <div id="stats-tabpanel" role="tabpanel" aria-labelledby={`stats-tab-${tab}`}>
        {tab === 'statistics' && (
          <>
            <Section
              id="addStat"
              title="New statistic"
              open={!!open.addStat}
              onToggle={() => toggle('addStat')}
            >
              <AddStatForm group={group} pops={pops} marker={marker} />
            </Section>
            <Section
              id="derived"
              title="Derived columns"
              open={!!open.derived}
              onToggle={() => toggle('derived')}
            >
              <DerivedPanel group={group} columns={perSample.columns} errors={errors} valuesOf={valuesOf} />
            </Section>
          </>
        )}
        {tab === 'replicates' && (
          <>
            <Section
              id="combine"
              title="Combine replicates"
              open={!!open.combine}
              onToggle={() => toggle('combine')}
            >
              <GroupByFields group={group} />
            </Section>
            <Section
              id="summaries"
              title="Summaries"
              open={!!open.summaries}
              onToggle={() => toggle('summaries')}
            >
              <SummaryFields group={group} />
            </Section>
          </>
        )}
        {tab === 'export' && (
          <>
            <Section
              id="tableCsv"
              title="Statistics table"
              open={!!open.tableCsv}
              onToggle={() => toggle('tableCsv')}
            >
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
            </Section>
            <Section
              id="statsCsv"
              title="Statistics with provenance"
              open={!!open.statsCsv}
              onToggle={() => toggle('statsCsv')}
            >
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
            </Section>
            <Section id="gatingMl" title="Gates" open={!!open.gatingMl} onToggle={() => toggle('gatingMl')}>
              <ActionRow
                label="Gating-ML"
                title="Download Gating-ML 2.0 for the group template (+ effective gates of overridden samples)"
                icon={<ExportIcon />}
                disabled={false}
                onClick={exportGml}
              />
            </Section>
            <Section id="events" title="Events" open={!!open.events} onToggle={() => toggle('events')}>
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
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
