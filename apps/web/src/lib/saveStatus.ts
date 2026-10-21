/**
 * The browser autosave's state (state/persist.ts), shown in the header: a change waiting for the
 * autosave, being written, written at `at` (ms since the epoch, null before the first save), or failed.
 */
export interface SaveState {
  state: 'unsaved' | 'saving' | 'saved' | 'failed';
  at: number | null;
  error?: string;
}

/** The header's word for the save state and its tooltip. */
export function saveStatusText(
  s: SaveState,
  formatTime: (ms: number) => string,
): { label: string; title: string } {
  const keep = 'To keep a copy outside this browser, use Workspace → Export.';
  if (s.state === 'unsaved')
    return { label: 'Unsaved', title: 'Changes are saved in this browser a second after the last edit.' };
  if (s.state === 'saving') return { label: 'Saving…', title: 'Saving the workspace in this browser.' };
  if (s.state === 'failed')
    return {
      label: 'Not saved',
      title: `Saving in this browser failed${s.error ? `: ${s.error}` : ''}. ${keep}`,
    };
  return {
    label: 'Saved',
    title: `${s.at === null ? 'Saved in this browser' : `Saved in this browser at ${formatTime(s.at)}`}. ${keep}`,
  };
}
