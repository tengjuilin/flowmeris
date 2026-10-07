/**
 * Formula columns (M-STAT-EXPR): a small arithmetic language evaluated without
 * `eval`. Grammar:
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := '-' unary | power
 *   power  := atom ('^' unary)?
 *   atom   := number | '[' column label ']' | name '(' expr (',' expr)* ')' | '(' expr ')'
 *
 * Functions: log10, ln, log2, exp, sqrt, abs, min, max. Any missing or
 * non-numeric input gives NaN.
 */

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; a: Expr }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Expr; b: Expr }
  | { t: 'call'; fn: string; args: Expr[] };

export class ExprError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
  }
}

const FUNCS: Record<string, { arity: [number, number]; f: (...x: number[]) => number }> = {
  log10: { arity: [1, 1], f: Math.log10 },
  ln: { arity: [1, 1], f: Math.log },
  log2: { arity: [1, 1], f: Math.log2 },
  exp: { arity: [1, 1], f: Math.exp },
  sqrt: { arity: [1, 1], f: Math.sqrt },
  abs: { arity: [1, 1], f: Math.abs },
  min: { arity: [1, 64], f: Math.min },
  max: { arity: [1, 64], f: Math.max },
};

export const EXPR_FUNCTIONS = Object.keys(FUNCS);

export function parseExpr(src: string): Expr {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const peek = () => {
    ws();
    return src[i];
  };
  const expect = (c: string) => {
    if (peek() !== c) throw new ExprError(`Expected “${c}”`, i);
    i++;
  };
  const atom = (): Expr => {
    const c = peek();
    if (c === undefined) throw new ExprError('Unexpected end of formula', i);
    if (c === '(') {
      i++;
      const e = expr();
      expect(')');
      return e;
    }
    if (c === '[') {
      const start = i++;
      const end = src.indexOf(']', i);
      if (end < 0) throw new ExprError('Unclosed “[”', start);
      const name = src.slice(i, end).trim();
      if (!name) throw new ExprError('Empty column reference', start);
      i = end + 1;
      return { t: 'ref', name };
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return { t: 'num', v: Number(num[0]) };
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      const start = i;
      const fn = id[0].toLowerCase();
      i += id[0].length;
      const spec = FUNCS[fn];
      if (!spec) throw new ExprError(`Unknown function “${id[0]}” (columns go in [brackets])`, start);
      expect('(');
      const args = [expr()];
      while (peek() === ',') {
        i++;
        args.push(expr());
      }
      expect(')');
      if (args.length < spec.arity[0] || args.length > spec.arity[1])
        throw new ExprError(`${fn}() takes ${spec.arity[0]} argument(s)`, start);
      return { t: 'call', fn, args };
    }
    throw new ExprError(`Unexpected “${c}”`, i);
  };
  const power = (): Expr => {
    const a = atom();
    if (peek() === '^') {
      i++;
      return { t: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const unary = (): Expr => {
    if (peek() === '-') {
      i++;
      return { t: 'neg', a: unary() };
    }
    if (peek() === '+') {
      i++;
      return unary();
    }
    return power();
  };
  const term = (): Expr => {
    let a = unary();
    for (let c = peek(); c === '*' || c === '/'; c = peek()) {
      i++;
      a = { t: 'bin', op: c, a, b: unary() };
    }
    return a;
  };
  const expr = (): Expr => {
    let a = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) {
      i++;
      a = { t: 'bin', op: c, a, b: term() };
    }
    return a;
  };
  const e = expr();
  if (peek() !== undefined) throw new ExprError(`Unexpected “${src[i]}”`, i);
  return e;
}

/** Column names referenced by an expression. */
export function exprRefs(e: Expr, out: Set<string> = new Set()): Set<string> {
  if (e.t === 'ref') out.add(e.name);
  else if (e.t === 'neg') exprRefs(e.a, out);
  else if (e.t === 'bin') {
    exprRefs(e.a, out);
    exprRefs(e.b, out);
  } else if (e.t === 'call') for (const a of e.args) exprRefs(a, out);
  return out;
}

export function evalExpr(e: Expr, lookup: (name: string) => number): number {
  switch (e.t) {
    case 'num':
      return e.v;
    case 'ref':
      return lookup(e.name);
    case 'neg':
      return -evalExpr(e.a, lookup);
    case 'call':
      return FUNCS[e.fn]!.f(...e.args.map((a) => evalExpr(a, lookup)));
    case 'bin': {
      const a = evalExpr(e.a, lookup);
      const b = evalExpr(e.b, lookup);
      if (e.op === '+') return a + b;
      if (e.op === '-') return a - b;
      if (e.op === '*') return a * b;
      if (e.op === '/') return a / b;
      return a ** b;
    }
  }
}
