import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumInput, OptNumInput } from './NumInput.tsx';

describe('NumInput', () => {
  it('with live={false}, commits the typed value on blur, not while typing', () => {
    const onCommit = vi.fn();
    render(<NumInput live={false} label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3.5' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('3.5');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(3.5);
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<NumInput live={false} label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    input.focus();
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it('commits nothing on a blur without an edit, and shows the value again after a commit', () => {
    const onCommit = vi.fn();
    render(<NumInput live={false} label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2'); // the draft is cleared; the host has not changed `value`
  });

  it.each([
    ['emptied', ''],
    ['blank', '  '],
    ['not a number', 'abc'],
  ])('commits nothing for a field %s, and shows the value again', (_, text) => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: text } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('2');
  });

  it('an emptied field commits the value from before typing again', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<NumInput label="Width" value={12} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1' } }); // deleting the 2 of 12
    rerender(<NumInput label="Width" value={1} onCommit={onCommit} />);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit.mock.calls).toEqual([[1], [12]]);
  });

  it('an emptied field commits nothing when typing changed nothing', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={12} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits while typing but not an empty field', () => {
    const onCommit = vi.fn();
    render(<NumInput label="Width" value={2} onCommit={onCommit} />);
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

  it('commits each number typed at once, and nothing for text that is not one', () => {
    const onCommit = vi.fn();
    render(<OptNumInput label="Max" value={undefined} onCommit={onCommit} />);
    const input = screen.getByLabelText('Max');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(onCommit.mock.calls).toEqual([[4], [45]]);
  });

  it('commits nothing on blur when the value was committed while typing', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<OptNumInput label="Max" value={undefined} onCommit={onCommit} />);
    const input = screen.getByLabelText('Max');
    fireEvent.change(input, { target: { value: '7' } });
    rerender(<OptNumInput label="Max" value={7} onCommit={onCommit} />);
    fireEvent.blur(input);
    expect(onCommit.mock.calls).toEqual([[7]]);
  });
});
