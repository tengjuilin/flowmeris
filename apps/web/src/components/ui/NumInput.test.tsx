import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumInput, OptNumInput } from './NumInput.tsx';

describe('NumInput', () => {
  it('commits the typed value on blur, not while typing', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3.5' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('3.5');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(3.5);
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    input.focus();
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it('commits nothing on a blur without an edit, and shows the value again after a commit', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2'); // the draft is cleared; the host has not changed `value`
  });

  it('commits 0 for an emptied field (the browser also empties a number field holding text)', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it('with live, commits while typing but not an empty field', () => {
    const onCommit = vi.fn();
    render(<NumInput live label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    fireEvent.change(input, { target: { value: '4' } });
    expect(onCommit).toHaveBeenLastCalledWith(4);
    onCommit.mockClear();
    fireEvent.change(input, { target: { value: '' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows the value to 8 significant digits', () => {
    render(<NumInput label="Width" value={1 / 3} onCommit={() => {}} />);
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('0.33333333');
  });
});

describe('OptNumInput', () => {
  it('commits undefined for an emptied field and shows Auto', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<OptNumInput label="Min" value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Min') as HTMLInputElement;
    fireEvent.change(input, { target: { value: ' ' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(undefined);
    rerender(<OptNumInput label="Min" value={undefined} onCommit={onCommit} />);
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Auto');
  });
});
