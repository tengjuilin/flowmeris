import { type ColumnDef, EXPR_FUNCTIONS, ExprError, exprRefs, parseExpr } from '@flowmeris/table';

/** A suggestion for the formula at the caret: a column reference or a function. */
export interface Completion {
  kind: 'column' | 'function';
  label: string;
  /** Text that replaces expr[from, to). */
  insert: string;
  from: number;
  to: number;
}

export const MAX_COMPLETIONS = 12;

/** How each formula function is called, shown in the suggestions. One entry per @flowmeris/table EXPR_FUNCTIONS. */
export const FUNCTION_SIGNATURES: Record<string, string> = {
  log: 'log(x, base)',
  ln: 'ln(x)',
  log2: 'log2(x)',
  log10: 'log10(x)',
  exp: 'exp(x)',
  sqrt: 'sqrt(x)',
  abs: 'abs(x)',
  min: 'min(a, b, …)',
  max: 'max(a, b, …)',
};

/** Completions for the word being typed at `caret`: inside `[`, columns; otherwise functions and columns. */
export function completionsAt(expr: string, caret: number, columns: ColumnDef[]): Completion[] {
  const before = expr.slice(0, caret);
  const open = before.lastIndexOf('[');
  const numeric = columns.filter((c) => c.type === 'numeric');
  if (open > before.lastIndexOf(']')) {
    const q = before.slice(open + 1).toLowerCase();
    // Replace through the closing bracket if one already follows.
    const close = expr.indexOf(']', caret);
    const nextOpen = expr.indexOf('[', caret);
    const to = close >= 0 && (nextOpen < 0 || close < nextOpen) ? close + 1 : caret;
    return numeric
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, MAX_COMPLETIONS)
      .map((c) => ({ kind: 'column', label: c.label, insert: `[${c.label}]`, from: open, to }));
  }
  const word = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0];
  if (!word) return [];
  const q = word.toLowerCase();
  const from = caret - word.length;
  const fns: Completion[] = EXPR_FUNCTIONS.filter((f) => f.startsWith(q)).map((f) => ({
    kind: 'function',
    label: FUNCTION_SIGNATURES[f] ?? `${f}( )`,
    insert: `${f}(`,
    from,
    to: caret,
  }));
  const cols: Completion[] = numeric
    .filter((c) => c.label.toLowerCase().includes(q))
    .map((c) => ({ kind: 'column', label: c.label, insert: `[${c.label}]`, from, to: caret }));
  return [...fns, ...cols].slice(0, MAX_COMPLETIONS);
}

/** A problem with a formula and the span of the formula it is about. */
export interface FormulaProblem {
  message: string;
  from: number;
  to: number;
}

/** Span of the token at `pos`: a [column reference], a name, or one character. */
export function tokenAt(expr: string, pos: number): [number, number] {
  if (pos >= expr.length) return [expr.length, expr.length];
  if (expr[pos] === '[') {
    const end = expr.indexOf(']', pos);
    return [pos, end < 0 ? expr.length : end + 1];
  }
  const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(pos));
  return [pos, pos + (word ? word[0].length : 1)];
}

/** The first problem with `expr` given the columns it may use, as the table would report it. */
export function checkFormula(expr: string, columns: ColumnDef[]): FormulaProblem | null {
  let refs: Set<string>;
  try {
    refs = exprRefs(parseExpr(expr));
  } catch (err) {
    if (!(err instanceof ExprError)) return { message: String((err as Error).message), from: 0, to: 0 };
    const [from, to] = tokenAt(expr, err.pos);
    return { message: err.message, from, to };
  }
  const known = new Set(columns.flatMap((c) => [c.label, c.key]));
  for (const m of expr.matchAll(/\[([^\]]*)\]/g)) {
    const name = m[1]!.trim();
    if (refs.has(name) && !known.has(name))
      return { message: `Unknown column [${name}]`, from: m.index, to: m.index + m[0].length };
  }
  return null;
}
