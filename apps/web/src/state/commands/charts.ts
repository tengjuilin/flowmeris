import type { StatPlot } from '@flowmeris/model';
import { mutateGroup, useStore } from '../store.ts';

/** Commands on the Charts view's charts. */

/** Edit chart `chartId` of the group. */
export function editChart(
  groupId: string,
  chartId: string,
  label: string,
  fn: (p: StatPlot) => void,
  merge?: string,
) {
  mutateGroup(
    groupId,
    label,
    (g) => {
      const p = g.statPlots.find((x) => x.id === chartId);
      if (p) fn(p);
    },
    merge,
  );
}

/** Add `chart` to the group (a new chart or a copy) and show it. */
export function addChart(groupId: string, chart: StatPlot, label = 'Add chart') {
  mutateGroup(groupId, label, (g) => void g.statPlots.push(chart));
  useStore.getState().setUi({ chartId: chart.id });
}

/** Delete chart `chartId`; when it was shown, the chart next to it is shown instead. */
export function removeChart(groupId: string, chartId: string) {
  const st = useStore.getState();
  const plots = st.ws.groups.find((g) => g.id === groupId)?.statPlots ?? [];
  const i = plots.findIndex((p) => p.id === chartId);
  const shown = plots.find((p) => p.id === st.ui.chartId) ?? plots[0];
  mutateGroup(groupId, 'Delete chart', (g) => {
    g.statPlots = g.statPlots.filter((p) => p.id !== chartId);
  });
  if (shown?.id === chartId) st.setUi({ chartId: (plots[i + 1] ?? plots[i - 1])?.id ?? null });
}
