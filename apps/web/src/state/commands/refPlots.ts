import type { Group, RefPlot, Workspace } from '@flowmeris/model';
import { newId } from '@flowmeris/model';
import { defaultAxis, defaultChannels } from '../../lib/axisDefaults.ts';
import { DEFAULT_STYLE } from '../../lib/figure.ts';
import { mutateGroup, useStore } from '../store.ts';

/** Commands on the Gate view's reference plots. */

/** Edit reference plot `refId` of the group. */
export function editRef(
  groupId: string,
  refId: string,
  label: string,
  fn: (r: RefPlot, g: Group, w: Workspace) => void,
) {
  mutateGroup(groupId, label, (g, w) => {
    const r = g.refPlots.find((x) => x.id === refId);
    if (r) fn(r, g, w);
  });
}

/** Add a reference plot on the default channels to the Gate view and show it. */
export function addRef(groupId: string) {
  let id = '';
  mutateGroup(groupId, 'Add reference plot', (g, w) => {
    const [xc, yc] = defaultChannels(w, g);
    const r: RefPlot = {
      id: newId('ref_'),
      kind: 'pseudocolor',
      x: { ...defaultAxis(w, g, xc) },
      y: { ...defaultAxis(w, g, yc) },
      style: { ...DEFAULT_STYLE },
      backgate: false,
    };
    g.refPlots.push(r);
    id = r.id;
  });
  if (id) useStore.getState().setUi({ refPlotId: id });
}

export function removeRef(groupId: string, refId: string) {
  mutateGroup(groupId, 'Remove reference plot', (g) => {
    g.refPlots = g.refPlots.filter((r) => r.id !== refId);
  });
}
