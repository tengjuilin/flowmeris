import { type ColumnDef, EXPR_FUNCTIONS } from '@flowmeris/table';
import { describe, expect, it } from 'vitest';
import { FUNCTION_SIGNATURES, MAX_COMPLETIONS, checkFormula, completionsAt, tokenAt } from './formula.ts';

const col = (label: string, type: ColumnDef['type'] = 'numeric', key = label): ColumnDef => ({
  key,
  label,
  type,
  kind: 'stat',
});
const columns = [
  col('Sample', 'categorical', 'sample:name'),
  col('Dose (nM)', 'numeric', 'var:dose'),
  col('All events | Count', 'numeric', 'root|count'),
  col('CD4+ | Median PE-A', 'numeric', 'p1|median'),
  col('CD4+ | Median FITC-A', 'numeric', 'p1|median2'),
];

/** The formula after accepting a completion, and the caret after it. */
function accept(expr: string, c: { insert: string; from: number; to: number }) {
  return [expr.slice(0, c.from) + c.insert + expr.slice(c.to), c.from + c.insert.length] as const;
}

describe('formula suggestions', () => {
  it('after “[”, suggests numeric columns whose label contains the text, case-insensitively', () => {
    const expr = '[median';
    const items = completionsAt(expr, expr.length, columns);
    expect(items.map((c) => c.label)).toEqual(['CD4+ | Median PE-A', 'CD4+ | Median FITC-A']);
    expect(items.every((c) => c.kind === 'column')).toBe(true);
    expect(accept(expr, items[0]!)).toEqual(['[CD4+ | Median PE-A]', 20]);
  });

  it('never suggests categorical columns', () => {
    expect(completionsAt('[sam', 4, columns)).toEqual([]);
    expect(completionsAt('[', 1, columns).map((c) => c.label)).not.toContain('Sample');
  });

  it('replaces through a closing bracket that already follows, but not one of the next reference', () => {
    const expr = '[Med] / 2';
    const [next] = accept(expr, completionsAt(expr, 4, columns)[0]!);
    expect(next).toBe('[CD4+ | Median PE-A] / 2');

    const two = '[Med / [Dose (nM)]';
    const c = completionsAt(two, 4, columns)[0]!;
    expect(c.to).toBe(4);
    expect(accept(two, c)[0]).toBe('[CD4+ | Median PE-A] / [Dose (nM)]');
  });

  it('outside brackets, suggests functions first, then matching columns', () => {
    const items = completionsAt('lo', 2, columns);
    expect(items.map((c) => c.label)).toEqual(['log(x, base)', 'log10(x)', 'log2(x)']);
    expect(accept('lo', items[0]!)).toEqual(['log(', 4]);

    const dose = completionsAt('1 + do', 6, columns);
    expect(dose.map((c) => [c.kind, c.label])).toEqual([['column', 'Dose (nM)']]);
    expect(accept('1 + do', dose[0]!)[0]).toBe('1 + [Dose (nM)]');

    const m = completionsAt('m', 1, columns).map((c) => c.label);
    expect(m.slice(0, 2)).toEqual(['min(a, b, …)', 'max(a, b, …)']);
    expect(m).toContain('CD4+ | Median PE-A');
  });

  it('suggests nothing after a closed reference, a number or an operator', () => {
    expect(completionsAt('[Dose (nM)]', 11, columns)).toEqual([]);
    expect(completionsAt('2 * ', 4, columns)).toEqual([]);
    expect(completionsAt('12', 2, columns)).toEqual([]);
  });

  it('uses the word at the caret, not the end of the formula', () => {
    const expr = 'sq + 1';
    const items = completionsAt(expr, 2, columns);
    expect(items.map((c) => c.label)).toEqual(['sqrt(x)']);
    expect(accept(expr, items[0]!)[0]).toBe('sqrt( + 1');
  });

  it('shows at most a dozen suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => col(`P${i} | Count`));
    expect(completionsAt('[count', 6, many)).toHaveLength(MAX_COMPLETIONS);
    expect(completionsAt('cou', 3, many)).toHaveLength(MAX_COMPLETIONS);
  });
});

describe('formula problems', () => {
  it('accepts valid formulas referencing columns by label or key', () => {
    expect(checkFormula('[CD4+ | Median PE-A] / [CD4+ | Median FITC-A]', columns)).toBeNull();
    expect(checkFormula('log([Dose (nM)], 10) + ln(2)', columns)).toBeNull();
    expect(checkFormula('[root|count] * 2', columns)).toBeNull();
    expect(checkFormula('[ Dose (nM) ]', columns)).toBeNull();
    expect(checkFormula('max(1, 2, 3) ^ 2', columns)).toBeNull();
  });

  it('marks an unknown column reference', () => {
    const expr = '1 + [Nope] * 2';
    expect(checkFormula(expr, columns)).toEqual({ message: 'Unknown column [Nope]', from: 4, to: 10 });
  });

  it('marks the token a syntax error is about', () => {
    expect(checkFormula('foo(1)', columns)).toMatchObject({ from: 0, to: 3 });
    expect(checkFormula('foo(1)', columns)!.message).toMatch(/Unknown function “foo”/);
    expect(checkFormula('log([Dose (nM)])', columns)).toMatchObject({ from: 0, to: 3 });
    expect(checkFormula('log([Dose (nM)])', columns)!.message).toMatch(/needs a base/);
    expect(checkFormula('sqrt(1, 2)', columns)!.message).toBe('sqrt() takes 1 argument(s)');
    expect(checkFormula('1 + [Dose', columns)).toEqual({ message: 'Unclosed “[”', from: 4, to: 9 });
    expect(checkFormula('[ ] + 1', columns)).toMatchObject({
      message: 'Empty column reference',
      from: 0,
      to: 3,
    });
  });

  it('marks the end of a formula that stops early', () => {
    const p = checkFormula('1 +', columns)!;
    expect(p.message).toBe('Unexpected end of formula');
    expect([p.from, p.to]).toEqual([3, 3]);
  });

  it('marks one character for a stray symbol', () => {
    expect(checkFormula('1 $ 2', columns)).toMatchObject({ from: 2, to: 3 });
  });

  it('token spans', () => {
    expect(tokenAt('[a b] + c', 0)).toEqual([0, 5]);
    expect(tokenAt('x + [open', 4)).toEqual([4, 9]);
    expect(tokenAt('abc_1(2)', 0)).toEqual([0, 5]);
    expect(tokenAt('1+2', 1)).toEqual([1, 2]);
    expect(tokenAt('12', 5)).toEqual([2, 2]);
  });
});

describe('function signatures', () => {
  it('cover exactly the functions formulas can call', () => {
    expect(Object.keys(FUNCTION_SIGNATURES).sort()).toEqual([...EXPR_FUNCTIONS].sort());
  });
});
