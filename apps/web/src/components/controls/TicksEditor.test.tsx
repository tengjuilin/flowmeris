import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicksEditor } from './TicksEditor.tsx';

describe('TicksEditor', () => {
  it('shows the ticks one per line and commits edits on blur', () => {
    const onCommit = vi.fn();
    render(<TicksEditor ticks={[{ value: 0 }, { value: 1000, label: '1k' }]} onCommit={onCommit} />);
    const box = screen.getByLabelText('Custom ticks') as HTMLTextAreaElement;
    expect(box.value).toBe('0\n1000 = 1k');
    fireEvent.change(box, { target: { value: '10, 100 = a' } });
    fireEvent.blur(box);
    expect(onCommit).toHaveBeenCalledWith([{ value: 10 }, { value: 100, label: 'a' }]);
  });

  it('commits undefined (automatic) for empty text', () => {
    const onCommit = vi.fn();
    render(<TicksEditor ticks={[{ value: 1 }]} onCommit={onCommit} />);
    const box = screen.getByLabelText('Custom ticks');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(onCommit).toHaveBeenCalledWith(undefined);
  });

  it('flags a malformed entry and keeps the text', () => {
    const onCommit = vi.fn();
    render(<TicksEditor ticks={undefined} onCommit={onCommit} />);
    const box = screen.getByLabelText('Custom ticks') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'ten' } });
    fireEvent.blur(box);
    expect(onCommit).not.toHaveBeenCalled();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.value).toBe('ten');
    expect(screen.getByText(/must be a number/)).toBeTruthy();
  });
});
