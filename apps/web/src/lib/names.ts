/**
 * Short display names for the samples of a group. File names often repeat the
 * folder name and share a common prefix/suffix (date, experiment, panel); only
 * the distinguishing part is shown. Trimming happens at separator boundaries
 * (`_`, `-`, `.`, space), never mid-token, and falls back to the full base name
 * whenever the result would be empty or ambiguous. The full path stays in tooltips.
 */

export interface NameInput {
  id: string;
  fileName: string;
  relativePath: string;
  datasetIndex: number;
}

const EXT_RE = /\.(fcs|lmd)$/i;
const SEP = /[\s_.-]/;
const SEP_RUN = /[\s_.-]+/g;

function trimSeps(s: string): string {
  return s.replace(/^[\s_.-]+|[\s_.-]+$/g, '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove every occurrence of the folder name (case-insensitive, whole tokens only). */
function stripFolder(base: string, folder: string): string {
  const f = trimSeps(folder);
  if (f.length < 2) return base;
  const re = new RegExp(`(^|[\\s_.-])${escapeRe(f)}(?=$|[\\s_.-])`, 'gi');
  const out = base.replace(re, '$1').replace(SEP_RUN, (m) => m[0]!);
  return trimSeps(out);
}

/** Length of the common prefix of all strings, cut back to just after a separator. */
function commonPrefix(xs: string[]): number {
  const first = xs[0]!;
  let n = first.length;
  for (const x of xs) {
    let i = 0;
    while (i < n && i < x.length && x[i] === first[i]) i++;
    n = i;
  }
  // Keep only whole tokens: the prefix must end on a separator.
  while (n > 0 && !SEP.test(first[n - 1]!)) n--;
  return n;
}

function commonSuffix(xs: string[]): number {
  return commonPrefix(xs.map((x) => [...x].reverse().join('')));
}

export function displayNames(samples: NameInput[]): Record<string, string> {
  const out: Record<string, string> = {};
  const full = samples.map((s) => s.fileName.replace(EXT_RE, ''));
  let names = samples.map((s, i) => {
    const parts = s.relativePath.split('/');
    const folder = parts.length > 1 ? parts[parts.length - 2]! : '';
    return stripFolder(full[i]!, folder) || full[i]!;
  });
  const distinct = [...new Set(names)];
  if (distinct.length > 1) {
    const pre = commonPrefix(distinct);
    const suf = commonSuffix(distinct.map((x) => x.slice(pre)));
    const cut = names.map((x) => trimSeps(x.slice(pre, x.length - suf)));
    if (cut.every((x) => x.length > 0) && new Set(cut).size === distinct.length) names = cut;
  }
  // Never let trimming merge two different files into one label.
  const seen = new Map<string, number>();
  for (let i = 0; i < samples.length; i++) {
    const k = `${names[i]}\u0000${samples[i]!.datasetIndex}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  samples.forEach((s, i) => {
    const dup = (seen.get(`${names[i]}\u0000${s.datasetIndex}`) ?? 0) > 1;
    const name = dup ? full[i]! : names[i]!;
    out[s.id] = s.datasetIndex > 0 ? `${name} #${s.datasetIndex + 1}` : name;
  });
  return out;
}
