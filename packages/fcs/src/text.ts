import { FcsParseError, type FcsWarning } from './types.ts';

/** TEXT segment (M-FCS-TEXT): decoding and splitting into keywords. */

const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
export const latin1 = new TextDecoder('latin1');

/** TEXT bytes as UTF-8, or ISO-8859-1 (with a warning) when they are not valid UTF-8. */
export function decodeText(bytes: Uint8Array, warnings: FcsWarning[]): string {
  try {
    return utf8Fatal.decode(bytes);
  } catch {
    warnings.push({
      code: 'Q-TEXT-NOT-UTF8',
      message: 'TEXT segment is not valid UTF-8; decoded as ISO-8859-1',
    });
    return latin1.decode(bytes);
  }
}

/**
 * Split a TEXT segment into keyword/value pairs. The first character is the
 * delimiter; a doubled delimiter inside a keyword or value encodes a literal
 * delimiter character (FCS 3.1 §3.2.9). Keyword names are upper-cased because
 * they are case-insensitive (FCS 3.0+).
 */
export function parseTextSegment(text: string, warnings: FcsWarning[]): Record<string, string> {
  if (text.length === 0) throw new FcsParseError('E-TEXT-EMPTY', 'TEXT segment is empty');
  const delim = text[0] as string;
  const tokens: string[] = [];
  let cur = '';
  let i = 1;
  while (i < text.length) {
    const c = text[i] as string;
    if (c === delim) {
      if (text[i + 1] === delim) {
        cur += delim;
        i += 2;
        continue;
      }
      tokens.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length > 0) {
    // Trailing NULs/whitespace after the final delimiter are common padding.
    if (cur.replace(/[\0\s]/g, '').length > 0) {
      warnings.push({ code: 'Q-TEXT-NO-TRAILING-DELIM', message: 'TEXT segment lacks a final delimiter' });
      tokens.push(cur);
    }
  }
  if (tokens.length % 2 !== 0) {
    warnings.push({
      code: 'Q-TEXT-ODD-TOKENS',
      message: `TEXT segment has an odd number of tokens (${tokens.length}); last token ignored`,
    });
    tokens.pop();
  }
  const out: Record<string, string> = {};
  for (let k = 0; k < tokens.length; k += 2) {
    const key = (tokens[k] as string).trim().toUpperCase();
    const value = tokens[k + 1] as string;
    if (key === '') continue;
    if (key in out) {
      if (out[key] !== value) {
        warnings.push({
          code: 'Q-TEXT-DUP-KEY',
          message: `Keyword ${key} appears more than once; first value kept`,
        });
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}
