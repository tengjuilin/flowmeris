import type { Variable } from '@flowmeris/model';
import { useEffect, useState } from 'react';
import { InspectorTabs } from '../../components/ui/InspectorTabs.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { DeleteIcon } from '../../components/ui/icons.tsx';
import { activeVariable, addVariable } from '../../lib/metadata.ts';
import { deleteVariable } from '../../state/commands/metadata.ts';
import { useGroup, useStore } from '../../state/store.ts';
import { ValuesTab } from './ValuesTab.tsx';
import { VariableFields } from './VariableFields.tsx';

type MetaTab = 'variables' | 'values';
const META_TABS: { id: MetaTab; label: string }[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'values', label: 'Values' },
];

/** Settings panel of the Metadata view: the variables (cards), and setting values on the plate map. */
export function MetadataInspector() {
  const group = useGroup();
  const vars = useStore((s) => s.ws.variables);
  const mode = useStore((s) => s.views.metaMode);
  const metaVarId = useStore((s) => s.ui.metaVarId);
  const setUi = useStore((s) => s.setUi);
  const mutate = useStore((s) => s.mutate);
  // The plate map opens on Values (what it is for), the table on Variables.
  const [tab, setTab] = useState<MetaTab>(mode === 'plate' ? 'values' : 'variables');
  useEffect(() => setTab(mode === 'plate' ? 'values' : 'variables'), [mode]);
  if (!group) return null;
  // Values act on the plate map's selected wells, so that tab is for the plate map only.
  const shown: MetaTab = mode === 'plate' ? tab : 'variables';
  const openId = metaVarId ?? vars[0]?.id;

  const add = (type: Variable['type']) => {
    let id = '';
    mutate('Add variable', (w) => void (id = addVariable(w, type === 'numeric' ? 'Dose' : 'Group', type)));
    setUi({ metaVarId: id });
  };

  return (
    <aside className="inspector insp-panel meta-inspector" aria-label="Metadata settings">
      <div className="insp-head">
        <InspectorTabs
          idPrefix="meta"
          label="Metadata settings"
          tabs={META_TABS.map((t) =>
            t.id === 'values' && mode !== 'plate'
              ? { ...t, disabled: true, title: 'Values are set on the plate map' }
              : t,
          )}
          current={shown}
          onSelect={setTab}
        />
        {shown === 'variables' && (
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
        )}
      </div>
      <div id="meta-tabpanel" role="tabpanel" aria-labelledby={`meta-tab-${shown}`}>
        {shown === 'variables' ? (
          vars.map((v) => (
            <Section
              key={v.id}
              id={`var-${v.id}`}
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
            </Section>
          ))
        ) : (
          <ValuesTab group={group} variable={activeVariable(vars, metaVarId)} />
        )}
      </div>
    </aside>
  );
}
