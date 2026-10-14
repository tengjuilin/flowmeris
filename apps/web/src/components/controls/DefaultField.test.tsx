import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSpec } from '../../lib/settings/index.ts';
import { DefaultField } from './DefaultField.tsx';

function field(f: FieldSpec, value: unknown, atFactory = false) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <DefaultField field={f} value={value} atFactory={atFactory} onChange={onChange} onReset={onReset} />,
  );
  return { onChange, onReset };
}

describe('DefaultField', () => {
  it('clamps a number to the field limits and rounds an integer field', () => {
    const { onChange } = field(
      { key: 'histBins', label: 'Bins', kind: 'number', min: 16, max: 1024, int: true },
      256,
    );
    const input = screen.getByLabelText('Bins');
    fireEvent.change(input, { target: { value: '5000' } });
    expect(onChange).toHaveBeenLastCalledWith(1024);
    fireEvent.change(input, { target: { value: '100.4' } });
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('reports a checkbox, a menu choice and a color', () => {
    const a = field({ key: 'showGrid', label: 'Gridlines', kind: 'bool' }, true);
    fireEvent.click(screen.getByLabelText('Gridlines'));
    expect(a.onChange).toHaveBeenCalledWith(false);

    const b = field(
      {
        key: 'n',
        label: 'Bins kind',
        kind: 'select',
        options: [
          [64, '64'],
          [128, '128'],
        ],
      },
      64,
    );
    fireEvent.change(screen.getByLabelText('Bins kind'), { target: { value: '128' } });
    // The option's own value, a number here.
    expect(b.onChange).toHaveBeenCalledWith(128);

    const c = field(
      { key: 'gridColor', label: 'Gridline color', kind: 'color', optional: 'Theme color' },
      undefined,
    );
    expect(screen.getByText('Theme color')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Gridline color', { selector: 'input' }), {
      target: { value: '#ff0000' },
    });
    expect(c.onChange).toHaveBeenCalledWith('#ff0000');
  });

  it('resets to the factory default, unless already there', () => {
    const f: FieldSpec = { key: 'pointPx', label: 'Point size', kind: 'number', min: 0, max: 10 };
    const { onReset } = field(f, 4);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Point size' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('disables the reset at the factory default', () => {
    field({ key: 'pointPx', label: 'Point size', kind: 'number', min: 0, max: 10 }, 3, true);
    expect((screen.getByRole('button', { name: 'Reset Point size' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
