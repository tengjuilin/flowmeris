import { z } from 'zod';
import { Id, Num } from './common.ts';

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const ChannelSpecSchema = z.object({
  /** 1-based parameter index n. */
  n: z.number().int().positive(),
  pnn: z.string(),
  pns: z.string().optional(),
  pnb: z.union([z.number().int().positive(), z.literal('*')]),
  pne: z.tuple([Num, Num]),
  png: Num.optional(),
  pnr: Num,
  dataType: z.enum(['I', 'F', 'D', 'A']),
  kind: z.enum(['scatter', 'fluor', 'time', 'other']),
  /** Largest linearized value of a time channel (seconds); sets the default time axis. */
  dataMax: Num.optional(),
});
export type ChannelSpec = z.infer<typeof ChannelSpecSchema>;

export const ParseWarningSchema = z.object({ code: z.string(), message: z.string() });
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const SampleSchema = z.object({
  id: Id,
  fileName: z.string(),
  /** User-chosen display name; overrides the derived short name. */
  label: z.string().optional(),
  relativePath: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative(),
  datasetIndex: z.number().int().nonnegative(),
  fcsVersion: z.string(),
  eventCount: z.number().int().nonnegative(),
  keywords: z.record(z.string()),
  channels: z.array(ChannelSpecSchema),
  parseWarnings: z.array(ParseWarningSchema),
  /** Plate well, normalized "A01"–"H12"; from $WELLID or the file name, or assigned on the plate map. */
  well: z.string().optional(),
  /** Values of the workspace's sample variables, by variable id. */
  meta: z.record(z.union([Num, z.string()])).default({}),
});
export type Sample = z.infer<typeof SampleSchema>;
