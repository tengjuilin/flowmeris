/**
 * FCS 2.0 / 3.0 / 3.1 / 3.2 parser (methods M-FCS-*; docs/methods/fcs.md).
 *
 * References:
 *  - Spidlen J. et al. (2010) Data File Standard for Flow Cytometry, Version FCS 3.1. Cytometry A 77:97–100.
 *  - Spidlen J. et al. (2021) Data File Standard for Flow Cytometry, Version FCS 3.2. Cytometry A 99:100–102.
 *
 * Linearisation conventions follow FlowKit/FlowIO so that numerical results can
 * be validated against them (see docs/validation/).
 */

import { type ParseOptions, parseDataset } from './dataset.ts';
import { type FcsDataset, type FcsFile, FcsParseError } from './types.ts';

export type { ParseOptions } from './dataset.ts';
export { parseHeader } from './header.ts';
export { parseTextSegment } from './text.ts';

/** Parse a complete FCS file held in memory. */
export function parseFcs(bytes: Uint8Array, opts: ParseOptions = {}): FcsFile {
  const datasets: FcsDataset[] = [];
  let offset = 0;
  const seen = new Set<number>();
  for (let index = 0; ; index++) {
    if (seen.has(offset))
      throw new FcsParseError('E-NEXTDATA-LOOP', `$NEXTDATA loops back to offset ${offset}`);
    seen.add(offset);
    const ds = parseDataset(bytes, offset, index, opts);
    datasets.push(ds);
    if (opts.firstDatasetOnly) break;
    const next = Number.parseInt((ds.keywords.$NEXTDATA ?? '0').trim(), 10);
    if (!Number.isFinite(next) || next <= 0) break;
    offset += next;
    if (offset >= bytes.length) {
      ds.warnings.push({ code: 'Q-NEXTDATA-OOB', message: '$NEXTDATA points past end of file; ignored' });
      break;
    }
  }
  return { datasets };
}
