import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Section } from './Section.tsx';

describe('Section', () => {
  it('shows its body only when open, and toggles from its heading', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Section id="x" title="Ticks" open={false} onToggle={onToggle}>
        <p>body</p>
      </Section>,
    );
    const head = screen.getByRole('button', { name: 'Ticks' });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('body')).toBeNull();
    fireEvent.click(head);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <Section id="x" title="Ticks" open onToggle={onToggle}>
        <p>body</p>
      </Section>,
    );
    expect(screen.getByText('body').parentElement?.id).toBe('insp-section-x');
  });

  it('enables its reset button only when a setting changed', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <Section id="x" title="Ticks" open onToggle={() => {}} onReset={onReset}>
        <p>body</p>
      </Section>,
    );
    const reset = screen.getByRole('button', { name: 'Reset ticks' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    rerender(
      <Section id="x" title="Ticks" open onToggle={() => {}} changed onReset={onReset}>
        <p>body</p>
      </Section>,
    );
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledOnce();
  });
});
