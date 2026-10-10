import { ActionRow } from '../../../components/ui/ActionRow.tsx';
import { ApplyIcon, ResetIcon } from '../../../components/ui/icons.tsx';
import { Card } from '../../../components/ui/settings/index.ts';
import {
  allRidgesAtDefaults,
  applyRidgeToChannels,
  applyRidgeToPopulations,
  isDefaultRidge,
  resetAllRidges,
  resetRidgeChannel,
  resetRidgeCurrent,
  resetRidgeLayout,
  ridgeAtDefaults,
  ridgeChannelAtDefaults,
  ridgeChannelsMatch,
  ridgePopulationsMatch,
  setRidgeChannelStyles,
} from '../../../lib/ridgeStyle.ts';
import { useStore } from '../../../state/store.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/** The Settings tab: apply this ridge plot's settings to other plots, or reset them at several scopes. */
export function SettingsTab({ r, group, fx, card }: RidgeTabProps) {
  const { layout, style, overlap } = r;
  const { editLayout } = fx;
  const mutate = useStore((s) => s.mutate);
  return (
    <>
      <Card {...card('apply')}>
        <ActionRow
          label="Apply same settings for all populations"
          title="Give every population's ridge plot this ridge plot's settings now (each keeps its ticks and axis title)"
          icon={<ApplyIcon />}
          disabled={!layout || ridgePopulationsMatch(group, layout.id)}
          onClick={() =>
            editLayout('Apply ridge settings to all populations', (l, g) => applyRidgeToPopulations(g, l.id))
          }
        />
        <ActionRow
          label="Apply same settings for all plots"
          title="Give every axis channel of this population these settings now"
          icon={<ApplyIcon />}
          disabled={!layout || ridgeChannelsMatch(layout)}
          onClick={() => editLayout('Apply ridge settings to all plots', (l) => applyRidgeToChannels(l))}
        />
        <label
          className="field check"
          title="On: the population you open next takes the settings of the one you leave (each keeps its ticks and axis title). Nothing changes when you tick it."
        >
          <input
            type="checkbox"
            checked={group.ridgeStyleFollow}
            onChange={(e) => {
              const on = e.target.checked;
              mutate(on ? 'Carry ridge settings to populations' : 'Ridge settings per population', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (g) g.ridgeStyleFollow = on;
              });
            }}
          />
          Carry settings to next populations
        </label>
        <label
          className="field check"
          title="On: the axis channel you switch to next takes the settings in use. Off: each channel keeps its own. Nothing changes when you tick it."
        >
          <input
            type="checkbox"
            checked={layout?.styleFollow !== false}
            disabled={!layout}
            onChange={(e) => {
              const on = e.target.checked;
              editLayout(on ? 'Carry ridge settings to plots' : 'Ridge settings per channel', (l) =>
                setRidgeChannelStyles(l, !on),
              );
            }}
          />
          Carry settings to next plots
        </label>
      </Card>
      <Card {...card('resetAll')}>
        <ActionRow
          label="All settings in this plot"
          title="Reset the settings of this ridge plot (this population, this axis channel)"
          icon={<ResetIcon />}
          disabled={!layout || isDefaultRidge({ style, overlap })}
          onClick={() => editLayout('Reset the settings of this ridge plot', (l) => resetRidgeCurrent(l))}
        />
        <ActionRow
          label="All plots of this population"
          title="Reset the settings of every axis channel of this population"
          icon={<ResetIcon />}
          disabled={!layout || ridgeAtDefaults(layout)}
          onClick={() =>
            editLayout('Reset the ridge settings of every channel of this population', (l) =>
              resetRidgeLayout(l),
            )
          }
        />
        <ActionRow
          label="All populations in this plot"
          title="Reset the settings of this axis channel in every population"
          icon={<ResetIcon />}
          disabled={!layout || ridgeChannelAtDefaults(group, layout.axis.channel)}
          onClick={() =>
            editLayout('Reset the ridge settings of this channel in every population', (l, g) =>
              resetRidgeChannel(g, l.axis.channel),
            )
          }
        />
        <ActionRow
          label="All plots in all populations"
          title="Reset the settings of every ridge plot in every population"
          icon={<ResetIcon />}
          disabled={allRidgesAtDefaults(group)}
          onClick={() =>
            mutate('Reset every ridge plot', (w) => {
              const g = w.groups.find((x) => x.id === group.id);
              if (g) resetAllRidges(g);
            })
          }
        />
      </Card>
    </>
  );
}
