import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SideTabs } from './SideTabs.tsx';

const TABS = [
  { id: 'a', label: 'Plots' },
  { id: 'b', label: 'Hotkeys' },
  { id: 'c', label: 'Import and export' },
] as const;

function tabs(onSelect = vi.fn(), current: 'a' | 'b' | 'c' = 'b') {
  render(
    <SideTabs idPrefix="t" label="Settings" tabs={TABS} current={current} onSelect={onSelect}>
      <p>pane of {current}</p>
    </SideTabs>,
  );
  return onSelect;
}

describe('SideTabs', () => {
  it('marks the current tab and labels its pane with it', () => {
    tabs();
    expect(screen.getByRole('tablist', { name: 'Settings' }).getAttribute('aria-orientation')).toBe(
      'vertical',
    );
    expect(screen.getByRole('tab', { name: 'Hotkeys' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Hotkeys' }).textContent).toBe('pane of b');
  });

  it('selects a tab on click, and the next or previous one with the arrows, wrapping around', () => {
    const onSelect = tabs();
    fireEvent.click(screen.getByRole('tab', { name: 'Plots' }));
    expect(onSelect).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Hotkeys' }), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Plots' }), { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });
});
