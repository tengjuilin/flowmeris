import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabStrip } from './TabStrip.tsx';

function strip(handlers: Partial<Record<'onSelect' | 'onClose' | 'onAdd', () => void>> = {}) {
  return render(
    <TabStrip
      label="Charts"
      tabs={[
        { id: 'a', label: 'Chart 1' },
        { id: 'b', label: 'Chart 2' },
      ]}
      current="b"
      onSelect={handlers.onSelect ?? (() => {})}
      onClose={handlers.onClose ?? (() => {})}
      closeLabel="Delete chart"
      onAdd={handlers.onAdd ?? (() => {})}
      addLabel="New chart"
    />,
  );
}

describe('TabStrip', () => {
  it('marks the current tab', () => {
    strip();
    expect(screen.getByRole('tablist', { name: 'Charts' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Chart 2' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Chart 1' }).getAttribute('aria-selected')).toBe('false');
  });

  it('selects, closes and adds tabs', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onAdd = vi.fn();
    strip({ onSelect, onClose, onAdd });
    fireEvent.click(screen.getByRole('tab', { name: 'Chart 1' }));
    expect(onSelect).toHaveBeenCalledWith('a');
    const close = screen.getAllByRole('button', { name: 'Delete chart' });
    expect(close).toHaveLength(2);
    fireEvent.click(close[1]!);
    expect(onClose).toHaveBeenCalledWith('b');
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'New chart' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
