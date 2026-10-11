import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FontSelect } from './FontSelect.tsx';

describe('FontSelect', () => {
  it('offers "same as figure" when inheriting, as undefined', () => {
    const onChange = vi.fn();
    render(<FontSelect label="Font" value="Courier" inherit="Arial" onChange={onChange} />);
    const select = screen.getByLabelText('Font') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('option', { name: 'Same as figure (Arial)' })).toBeTruthy();
  });

  it('switches to a typed font name for "Other installed font…"', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FontSelect label="Font" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Font'), { target: { value: '__custom' } });
    expect(onChange).toHaveBeenCalledWith('Helvetica Neue');
    rerender(<FontSelect label="Font" value="Helvetica Neue" onChange={onChange} />);
    const name = screen.getByLabelText('Font name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: ' Futura ' } });
    fireEvent.blur(name);
    expect(onChange).toHaveBeenLastCalledWith('Futura');
  });

  it('lists the system fonts by name, and a saved font outside the list while it is chosen', () => {
    const names = () => [...(screen.getByLabelText('Font') as HTMLSelectElement).options].map((o) => o.text);
    const { rerender } = render(<FontSelect label="Font" value="sans" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Font') as HTMLSelectElement).value).toBe('arial');
    expect(names()).toEqual([
      'Arial',
      'Helvetica',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
      'Consolas',
      'Other installed font…',
    ]);
    rerender(<FontSelect label="Font" value="georgia" onChange={vi.fn()} />);
    expect(names()).toContain('Georgia');
    expect((screen.getByLabelText('Font') as HTMLSelectElement).value).toBe('georgia');
    expect(screen.queryByLabelText('Font name')).toBeNull();
  });
});
