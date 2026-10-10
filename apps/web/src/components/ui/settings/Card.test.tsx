import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card } from './Card.tsx';

describe('Card', () => {
  it('shows its body only when open, and toggles from its heading', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Card id="x" title="Ticks" open={false} onToggle={onToggle}>
        <p>body</p>
      </Card>,
    );
    const head = screen.getByRole('button', { name: 'Ticks' });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('body')).toBeNull();
    fireEvent.click(head);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <Card id="x" title="Ticks" open onToggle={onToggle}>
        <p>body</p>
      </Card>,
    );
    expect(screen.getByText('body').parentElement?.id).toBe('insp-section-x');
  });

  it('enables its reset button only when a setting changed', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <Card id="x" title="Ticks" open onToggle={() => {}} onReset={onReset}>
        <p>body</p>
      </Card>,
    );
    const reset = screen.getByRole('button', { name: 'Reset ticks' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    expect(reset.title).toBe('Already at the defaults');
    rerender(
      <Card id="x" title="Ticks" open onToggle={() => {}} changed onReset={onReset}>
        <p>body</p>
      </Card>,
    );
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
