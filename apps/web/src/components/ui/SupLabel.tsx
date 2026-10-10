const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUP_RE = /^(.*?10)([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/;

/**
 * SVG text content for a tick label; a power of ten such as "10⁵" is drawn as "10" plus a smaller,
 * raised exponent (the Unicode superscript glyphs are missing from many fonts and from the PDF's).
 */
export function SupLabel({ label, fontSize }: { label: string; fontSize: number }) {
  const m = SUP_RE.exec(label);
  if (!m) return <>{label}</>;
  const exp = [...m[2]!].map((c) => (c === '⁻' ? '−' : String(SUP_DIGITS.indexOf(c)))).join('');
  return (
    <>
      {m[1]}
      <tspan fontSize={fontSize * 0.7} dy={-fontSize * 0.4}>
        {exp}
      </tspan>
    </>
  );
}
