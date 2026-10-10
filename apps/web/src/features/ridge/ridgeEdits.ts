import type { Group, RidgeLayout, RidgeStyle } from '@flowmeris/model';
import { RIDGE_CARD_KEYS, resetRidgeKeys, ridgeKeysAtDefaults } from '../../lib/ridgePanels.ts';
import { useStore } from '../../state/store.ts';
import type { Ridge } from './useRidge.ts';

/** The collapsible cards of the ridge settings panel: the style cards and the Settings tab's. */
export type RidgeCard = keyof typeof RIDGE_CARD_KEYS | 'apply' | 'resetAll' | 'scale';

/** What every tab of the ridge settings panel gets: the ridge plot, its edits and the panel's open cards. */
export interface RidgeTabProps {
  r: Ridge;
  group: Group;
  fx: RidgeEdits;
  /** Card `id`'s open state and toggle, as `Section` props. */
  card: (id: RidgeCard) => { open: boolean; onToggle: () => void };
}

export type RidgeEdits = ReturnType<typeof ridgeEdits>;

/** Edits of the current population's ridge plot `r`, in group `group`. */
export function ridgeEdits(r: Ridge, group: Group) {
  const { layout, style, overlap, update } = r;
  /** Set style `key`; edits of one key coalesce into one undo step unless `merge` says otherwise. */
  const set = <K extends keyof RidgeStyle>(key: K, value: RidgeStyle[K], label: string, merge?: string) =>
    update(
      label,
      (l) => {
        if (value === undefined) delete l.style[key];
        else l.style[key] = value;
      },
      merge ?? `style:${key}`,
    );

  /** Reset props for card `card`, whose settings are its style keys (and the overlap, if `withOverlap`). */
  const resetOf = (card: keyof typeof RIDGE_CARD_KEYS, title: string, withOverlap = false) => {
    const keys = RIDGE_CARD_KEYS[card];
    return {
      changed: !ridgeKeysAtDefaults(style, overlap, keys, withOverlap),
      onReset: () => update(`Reset ${title}`, (l) => resetRidgeKeys(l, keys, withOverlap)),
    };
  };

  /** Edit this population's ridge plot, if it has one. */
  const editLayout = (label: string, fn: (l: RidgeLayout, g: Group) => void) =>
    useStore.getState().mutate(label, (w) => {
      const g = w.groups.find((x) => x.id === group.id);
      const l = g?.layouts.find((x): x is RidgeLayout => x.kind === 'ridge' && x.id === layout?.id);
      if (g && l) fn(l, g);
    });

  return { set, resetOf, editLayout };
}
