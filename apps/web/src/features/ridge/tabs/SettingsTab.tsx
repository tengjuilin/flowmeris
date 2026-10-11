import { ApplyCard, ResetCard } from '../../../components/ui/settings/index.ts';
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
      <ApplyCard
        card={card('apply')}
        actions={[
          {
            label: 'Apply same settings for all populations',
            title:
              "Give every population's ridge plot this ridge plot's settings now (each keeps its ticks and axis title)",
            disabled: !layout || ridgePopulationsMatch(group, layout.id),
            run: () =>
              editLayout('Apply ridge settings to all populations', (l, g) =>
                applyRidgeToPopulations(g, l.id),
              ),
          },
          {
            label: 'Apply same settings for all plots',
            title: 'Give every axis channel of this population these settings now',
            disabled: !layout || ridgeChannelsMatch(layout),
            run: () => editLayout('Apply ridge settings to all plots', (l) => applyRidgeToChannels(l)),
          },
        ]}
        checks={[
          {
            label: 'Carry settings to next populations',
            title:
              'On: the population you open next takes the settings of the one you leave (each keeps its ticks and axis title). Nothing changes when you tick it.',
            checked: group.ridgeStyleFollow,
            onChange: (on) =>
              mutate(on ? 'Carry ridge settings to populations' : 'Ridge settings per population', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (g) g.ridgeStyleFollow = on;
              }),
          },
          {
            label: 'Carry settings to next plots',
            title:
              'On: the axis channel you switch to next takes the settings in use. Off: each channel keeps its own. Nothing changes when you tick it.',
            checked: layout?.styleFollow !== false,
            disabled: !layout,
            onChange: (on) =>
              editLayout(on ? 'Carry ridge settings to plots' : 'Ridge settings per channel', (l) =>
                setRidgeChannelStyles(l, !on),
              ),
          },
        ]}
      />
      <ResetCard
        card={card('resetAll')}
        actions={[
          {
            label: 'All settings in this plot',
            title: 'Reset the settings of this ridge plot (this population, this axis channel)',
            disabled: !layout || isDefaultRidge({ style, overlap }),
            run: () => editLayout('Reset the settings of this ridge plot', (l) => resetRidgeCurrent(l)),
          },
          {
            label: 'All plots of this population',
            title: 'Reset the settings of every axis channel of this population',
            disabled: !layout || ridgeAtDefaults(layout),
            run: () =>
              editLayout('Reset the ridge settings of every channel of this population', (l) =>
                resetRidgeLayout(l),
              ),
          },
          {
            label: 'All populations in this plot',
            title: 'Reset the settings of this axis channel in every population',
            disabled: !layout || ridgeChannelAtDefaults(group, layout.axis.channel),
            run: () =>
              editLayout('Reset the ridge settings of this channel in every population', (l, g) =>
                resetRidgeChannel(g, l.axis.channel),
              ),
          },
          {
            label: 'All plots in all populations',
            title: 'Reset the settings of every ridge plot in every population',
            disabled: allRidgesAtDefaults(group),
            run: () =>
              mutate('Reset every ridge plot', (w) => {
                const g = w.groups.find((x) => x.id === group.id);
                if (g) resetAllRidges(g);
              }),
          },
        ]}
      />
    </>
  );
}
