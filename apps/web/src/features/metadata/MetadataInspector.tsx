import type { Variable } from '@flowmeris/model';
import { useEffect, useState } from 'react';
import { DeleteIcon } from '../../components/ui/icons.tsx';
import { Card, EmptyPanel, SettingsPanel } from '../../components/ui/settings/index.ts';
import { activeVariable, addVariable } from '../../lib/metadata.ts';
import { META_PANEL, type MetaPanelTab } from '../../lib/panelSpecs.ts';
import { deleteVariable } from '../../state/commands/metadata.ts';
import { useSettingsPanel } from '../../state/prefs.ts';
import { useGroup, useStore } from '../../state/store.ts';
import { ValuesTab } from './ValuesTab.tsx';
import { VariableFields } from './VariableFields.tsx';

/** Settings panel of the Metadata view: the variables (cards), and setting values on the plate map. */
export function MetadataInspector() {
  const group = useGroup();
  const vars = useStore((s) => s.ws.variables);
  const mode = useStore((s) => s.views.metaMode);
  const metaVarId = useStore((s) => s.ui.metaVarId);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  // The plate map opens on Values (what it is for), the table on Variables.
  const [tab, setTab] = useState<MetaPanelTab>(mode === 'plate' ? 'values' : 'variables');
  useEffect(() => setTab(mode === 'plate' ? 'values' : 'variables'), [mode]);
  // The Values tab's collapsed cards, remembered in this browser (the tab follows the table or plate map).
  const { card } = useSettingsPanel(META_PANEL);
  if (!group) return <EmptyPanel spec={META_PANEL} className="meta-inspector" />;
  // Values act on the plate map's selected wells, so that tab is for the plate map only.
  const shown: MetaPanelTab = mode === 'plate' ? tab : 'variables';
  const openId = metaVarId ?? vars[0]?.id;

  const add = (type: Variable['type']) => {
    let id = '';
    mutate('Add variable', (w) => void (id = addVariable(w, type === 'numeric' ? 'Dose' : 'Group', type)));
    setUi({ metaVarId: id });
  };

  return (
    <SettingsPanel
      spec={META_PANEL}
      tab={shown}
      onTab={setTab}
      // Values act on the plate map's selected wells.
      disabledTabs={mode === 'plate' ? {} : { values: 'Values are set on the plate map' }}
      className="meta-inspector"
      head={
        shown === 'variables' && (
          <div className="row meta-add">
            <button
              type="button"
              onClick={() => add('numeric')}
              title="A number per sample, e.g. dose, time, concentration"
            >
              + Numeric
            </button>
            <button
              type="button"
              onClick={() => add('categorical')}
              title="A label per sample, e.g. replicate, condition, cell line"
            >
              + Categorical
            </button>
          </div>
        )
      }
    >
      {shown === 'variables' ? (
        vars.map((v) => (
          <Card
            key={v.id}
            id={`meta-var-${v.id}`}
            title={`${v.name}${v.unit ? ` (${v.unit})` : ''}`}
            open={openId === v.id}
            // Closing leaves no card open ('' matches none); the plate map then shows the first variable.
            onToggle={() => setUi({ metaVarId: openId === v.id ? '' : v.id })}
            actions={
              <>
                <span className="muted small var-type">{v.type === 'numeric' ? '#' : 'abc'}</span>
                <button
                  type="button"
                  className="icon reset-btn danger-icon"
                  title={`Delete variable ${v.name}`}
                  aria-label={`Delete variable ${v.name}`}
                  onClick={() => deleteVariable(v)}
                >
                  <DeleteIcon />
                </button>
              </>
            }
          >
            <VariableFields v={v} />
          </Card>
        ))
      ) : (
        <ValuesTab group={group} variable={activeVariable(vars, metaVarId)} card={card} />
      )}
    </SettingsPanel>
  );
}
