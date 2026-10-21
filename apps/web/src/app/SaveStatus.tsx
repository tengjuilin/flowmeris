import { SavedIcon, SavingIcon, UnsavedIcon, WarningIcon } from '../components/ui/icons.tsx';
import { saveStatusText } from '../lib/saveStatus.ts';
import { useStore } from '../state/store.ts';

const ICONS = { saved: SavedIcon, saving: SavingIcon, unsaved: UnsavedIcon, failed: WarningIcon };
const time = (ms: number) => new Date(ms).toLocaleTimeString();

/** The header's save status: whether the workspace is saved in this browser (state/persist.ts autosave). */
export function SaveStatus() {
  const save = useStore((s) => s.status.save);
  const { label, title } = saveStatusText(save, time);
  const Icon = ICONS[save.state];
  return (
    <output className={`save-status ${save.state}`} title={title}>
      <Icon />
      {label}
    </output>
  );
}
