import type { Group } from '@flowmeris/model';
import { useStore } from '../../state/store.ts';

/** Edit group `groupId` as one undo step (merged with others of the same `merge` key). */
export function useGroupMutate(groupId: string) {
  const mutate = useStore((s) => s.mutate);
  return (label: string, fn: (g: Group) => void, merge?: string) =>
    mutate(label, (w) => fn(w.groups.find((x) => x.id === groupId)!), merge);
}
