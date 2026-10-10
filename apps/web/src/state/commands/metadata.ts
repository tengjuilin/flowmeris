import { type Variable, removeVariable } from '@flowmeris/model';
import { detectWells } from '../../lib/metadata.ts';
import { toast, useStore } from '../store.ts';

/** Commands of the Metadata view. */

/** Delete a variable and its values everywhere, after asking; true if deleted. */
export function deleteVariable(v: Variable): boolean {
  if (!window.confirm(`Delete “${v.name}” and its values in all groups?`)) return false;
  useStore.getState().mutate('Delete variable', (w) => removeVariable(w, v.id));
  return true;
}

/** Find the wells of the samples without one (see `detectWells`), and say how many were found. */
export function detectSampleWells(sampleIds: string[]) {
  let n = 0;
  useStore.getState().mutate('Detect wells', (w) => void (n = detectWells(w, sampleIds)));
  toast(n ? `Found wells for ${n} sample(s).` : 'No further wells found in keywords or file names.');
}
