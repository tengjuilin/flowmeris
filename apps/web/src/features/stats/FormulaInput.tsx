import type { ColumnDef } from '@flowmeris/table';
import { useLayoutEffect, useRef, useState } from 'react';
import { type Completion, type FormulaProblem, completionsAt } from '../../lib/formula.ts';

/** Formula input that suggests column names (typed, or after “[”) and function names at the caret. */
export function FormulaInput(props: {
  value: string;
  columns: ColumnDef[];
  onChange: (expr: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const { value } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Caret to restore after a completion is inserted, as soon as the new value is in the DOM.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(at, at);
  });
  // Grow with the formula instead of scrolling inside the box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  const items = caret === null || dismissed ? [] : completionsAt(value, caret, props.columns);
  const open = items.length > 0;
  const sync = () => {
    const el = ref.current;
    if (el && document.activeElement === el) setCaret(el.selectionStart);
  };
  const accept = (c: Completion) => {
    const next = value.slice(0, c.from) + c.insert + value.slice(c.to);
    const at = c.from + c.insert.length;
    props.onChange(next);
    setCaret(at);
    setActive(0);
    pendingCaret.current = at;
  };
  return (
    <div className="formula-input">
      <textarea
        ref={ref}
        rows={2}
        className="mono"
        aria-label="Formula"
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.invalid ? 'formula-error' : undefined}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="formula-completions"
        aria-activedescendant={open ? `formula-completion-${active}` : undefined}
        spellCheck={false}
        autoComplete="off"
        value={value}
        placeholder="[CD4+ | Median PE-A] / [CD4+ | Median FITC-A]"
        onChange={(e) => {
          props.onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setActive(0);
          setDismissed(false);
        }}
        onSelect={sync}
        onFocus={sync}
        onBlur={() => {
          setCaret(null);
          props.onBlur?.();
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const d = e.key === 'ArrowDown' ? 1 : -1;
            setActive((i) => (i + d + items.length) % items.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            accept(items[Math.min(active, items.length - 1)]!);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }
        }}
      />
      {open && (
        // biome-ignore lint/a11y/useSemanticElements: a native <select> cannot be the popup of a text input; this is the ARIA combobox pattern
        <div id="formula-completions" className="formula-completions" role="listbox" tabIndex={-1}>
          {items.map((c, i) => (
            <div
              key={`${c.kind}:${c.label}`}
              id={`formula-completion-${i}`}
              // biome-ignore lint/a11y/useSemanticElements: options of the ARIA combobox above; the input keeps the focus
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              className={i === active ? 'on' : undefined}
              // Keep the focus (and caret) in the input.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="completion-kind">{c.kind === 'function' ? 'ƒ' : '[ ]'}</span>
              <span className={c.kind === 'function' ? 'mono' : undefined}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The error message, and the formula with the part it is about marked. */
export function FormulaError({ expr, problem, id }: { expr: string; problem: FormulaProblem; id?: string }) {
  const { from, to } = problem;
  return (
    <div className="formula-error" id={id} role="alert">
      <div className="formula-error-msg">
        {problem.message}
        {from < expr.length ? ` (at character ${from + 1})` : ''}
      </div>
      <div className="formula-error-src mono">
        {expr.slice(0, from)}
        <mark className={to > from ? undefined : 'gap'}>{to > from ? expr.slice(from, to) : '\u00a0'}</mark>
        {expr.slice(to)}
      </div>
    </div>
  );
}
