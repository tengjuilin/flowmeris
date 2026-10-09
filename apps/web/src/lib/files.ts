/** File names of the data files the app reads: FCS (`.fcs`) and Beckman Coulter list mode (`.lmd`). */
export const DATA_FILE_RE = /\.(fcs|lmd)$/i;

/** `accept` attribute of file inputs for data files. */
export const DATA_FILE_ACCEPT = '.fcs,.lmd,.FCS,.LMD';

/** A data file's name without its extension. */
export function stripDataExt(name: string): string {
  return name.replace(DATA_FILE_RE, '');
}
