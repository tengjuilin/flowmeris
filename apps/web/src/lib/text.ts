/** Fitting label text: line wrapping and text measurement. */

/**
 * Break `text` into lines no wider than `maxW` by `measure`, at spaces and after `_ - . /`. A word
 * wider than `maxW` is broken between characters.
 */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const words = text.match(/[^\s_\-./]*[_\-./]?\s*/g)?.filter(Boolean) ?? [];
  const lines: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) lines.push(cur.trimEnd());
    cur = '';
  };
  for (const word of words) {
    if (cur && measure((cur + word).trimEnd()) > maxW) flush();
    if (!cur && measure(word.trimEnd()) > maxW) {
      for (const ch of word.trimEnd()) {
        if (cur && measure(cur + ch) > maxW) flush();
        cur += ch;
      }
    } else cur += word;
  }
  flush();
  return lines.length ? lines : [text];
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Width in px of a string at `fontSize` in `family`; estimated from the length where no canvas exists. */
export function textMeasure(
  fontSize: number,
  family: string,
  { bold = false, italic = false } = {},
): (s: string) => number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  const ctx = measureCtx;
  if (!ctx) return (s) => s.length * fontSize * 0.55;
  return (s) => {
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${family}`;
    // Figure text is drawn without kerning (styles/base.css), as in its PDF.
    if ('fontKerning' in ctx) ctx.fontKerning = 'none';
    return ctx.measureText(s).width;
  };
}
