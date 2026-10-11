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

  it('lists the bundled fonts with what they stand in for, and shows an old font id as its font', () => {
    render(<FontSelect label="Font" value="helvetica" onChange={vi.fn()} />);
    const select = screen.getByLabelText('Font') as HTMLSelectElement;
    expect(select.value).toBe('arial');
    expect(select.selectedOptions[0]?.textContent).toBe('Liberation Sans (Arial, Helvetica metrics)');
    expect(screen.getByRole('option', { name: 'Carlito (Calibri metrics)' })).toBeTruthy();
    expect(screen.queryByLabelText('Font name')).toBeNull();
  });
});
