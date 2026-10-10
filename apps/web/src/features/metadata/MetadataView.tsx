import { toCsv } from '@flowmeris/export';
import { useRef, useState } from 'react';
import { SettingsToggle } from '../../components/ui/SettingsToggle.tsx';
import { ExportIcon, ImportIcon } from '../../components/ui/icons.tsx';
import { download, safeName } from '../../lib/download.ts';
import { activeVariable } from '../../lib/metadata.ts';
import { type Sheet, TABLE_ACCEPT, readTableFile } from '../../lib/sheets.ts';
import { deleteVariable, detectSampleWells } from '../../state/commands/metadata.ts';
import { toast, useGroup, useSampleNames, useStore } from '../../state/store.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { MetaTable } from './MetaTable.tsx';
import { PlateMap } from './PlateMap.tsx';

export function MetadataView() {
  const group = useGroup();
  const ws = useStore((s) => s.ws);
  const names = useSampleNames(group);
  const mode = useStore((s) => s.views.metaMode);
  const metaVarId = useStore((s) => s.ui.metaVarId);
  const settingsOpen = useStore((s) => s.views.metaSettings);
  const setUi = useStore((s) => s.setUi);
  const setViews = useStore((s) => s.setViews);
  const setMode = (m: 'table' | 'plate') => setViews({ metaMode: m });
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!group) return <div className="empty">Select a group.</div>;

  const vars = ws.variables;
  const active = activeVariable(vars, metaVarId);

  const exportTemplate = () => {
    const header = ['file_name', 'sample', 'well', ...vars.map((v) => v.name)];
    const rows = group.sampleIds.flatMap((id) => {
      const s = ws.samples[id];
      return s ? [[s.fileName, names[id] ?? '', s.well ?? '', ...vars.map((v) => s.meta[v.id] ?? '')]] : [];
    });
    download(`${safeName(`${group.name}_sample_variables`)}.csv`, toCsv([header, ...rows]), 'text/csv');
  };

  const openFile = async (file: File) => {
    try {
      const read = await readTableFile(file);
      if (read.every((s) => s.grid.length === 0)) toast('The file is empty.');
      else setSheets(read);
    } catch (e) {
      toast(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className={`metadata-view ${mode === 'table' ? 'table-mode' : 'plate-mode'}`}>
      <div className="toolbar">
        <div className="seg">
          <button type="button" className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>
            Table
          </button>
          <button type="button" className={mode === 'plate' ? 'on' : ''} onClick={() => setMode('plate')}>
            Plate map
          </button>
        </div>
        <div className="spacer" />
        <button
          type="button"
          className="icon-text"
          onClick={() => fileInput.current?.click()}
          title="CSV, TSV or Excel: one row per sample, or plate-layout blocks"
        >
          <ImportIcon />
          Import
        </button>
        <button
          type="button"
          className="icon-text"
          onClick={exportTemplate}
          title="CSV of the samples with their wells and variables, to fill in and import"
        >
          <ExportIcon />
          Export
        </button>
        <button
          type="button"
          onClick={() => detectSampleWells(group.sampleIds)}
          title="Read wells from the $WELLID keyword or the file names"
        >
          Detect wells
        </button>
        <SettingsToggle open={settingsOpen} onToggle={() => setViews({ metaSettings: !settingsOpen })} />
        <input
          ref={fileInput}
          type="file"
          hidden
          accept={TABLE_ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFile(f);
            e.target.value = '';
          }}
          data-testid="meta-input"
        />
      </div>
      {vars.length > 0 && (
        <div className="variable-bar">
          {vars.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`chip${active?.id === v.id ? ' on' : ''}`}
              aria-pressed={active?.id === v.id}
              onClick={() => setUi({ metaVarId: v.id })}
              onKeyDown={(e) => {
                if (e.key !== 'Delete' && e.key !== 'Backspace') return;
                e.preventDefault();
                deleteVariable(v);
              }}
              title="Select (Delete to remove)"
            >
              {v.name}
              {v.unit ? ` (${v.unit})` : ''}
              <span className="muted small">{v.type === 'numeric' ? '#' : 'abc'}</span>
            </button>
          ))}
        </div>
      )}
      {mode === 'table' ? <MetaTable group={group} /> : <PlateMap group={group} variable={active} />}
      {sheets && <ImportDialog group={group} sheets={sheets} onClose={() => setSheets(null)} />}
    </div>
  );
}
