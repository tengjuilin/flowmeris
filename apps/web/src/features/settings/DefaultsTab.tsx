import { DefaultField } from '../../components/controls/DefaultField.tsx';
import { sameJson } from '../../lib/json.ts';
import { type DefaultsTabSpec, FACTORY_DEFAULTS, defaultValue } from '../../lib/settings/index.ts';
import { useSettings } from '../../state/settings.ts';

/**
 * A tab of default appearance (Plots, Ridges or Charts): a group of fields per card of its spec. A change
 * applies at once, to new figures and to the open workspace's figures still at the old default.
 */
export function DefaultsTab({ tab }: { tab: DefaultsTabSpec }) {
  const defaults = useSettings((s) => s.defaults);
  const setDefault = useSettings((s) => s.setDefault);
  const resetDefaults = useSettings((s) => s.resetDefaults);
  const atFactory = (section: DefaultsTabSpec['cards'][number]['section'], key: string) =>
    sameJson(defaultValue(defaults, section, key), defaultValue(FACTORY_DEFAULTS, section, key));
  const tabAtFactory = tab.cards.every((c) => c.fields.every((f) => atFactory(c.section, f.key)));
  return (
    <>
      <div className="settings-intro">
        <p>
          {tab.intro} New figures start from these settings. Changing one also changes it in the open
          workspace's figures that still have the old default; figures you set otherwise keep their own.
        </p>
        <button
          type="button"
          disabled={tabAtFactory}
          onClick={() =>
            resetDefaults(tab.cards.map((c) => [c.section, c.fields.map((f) => f.key)] as const))
          }
        >
          Reset {tab.title.toLowerCase()} to factory defaults
        </button>
      </div>
      {tab.cards.map((c) => (
        <fieldset key={c.id} className="settings-group">
          <legend>{c.title}</legend>
          {c.fields.map((f) => (
            <DefaultField
              key={f.key}
              field={f}
              value={defaultValue(defaults, c.section, f.key)}
              atFactory={atFactory(c.section, f.key)}
              onChange={(v) => setDefault(c.section, f.key, v)}
              onReset={() => resetDefaults([[c.section, [f.key]]])}
            />
          ))}
        </fieldset>
      ))}
    </>
  );
}
