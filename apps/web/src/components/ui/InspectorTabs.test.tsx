import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InspectorTabs } from './InspectorTabs.tsx';

const TABS = [
  { id: 'a', label: 'Axis' },
  { id: 'b', label: 'Text', disabled: true, title: 'Not now' },
] as const;

describe('InspectorTabs', () => {
  it('marks the current tab and links each tab to the tab panel', () => {
    render(<InspectorTabs idPrefix="p" label="Settings" tabs={TABS} current="a" onSelect={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeTruthy();
    const axis = screen.getByRole('tab', { name: 'Axis' });
    expect(axis.getAttribute('aria-selected')).toBe('true');
    expect(axis.id).toBe('p-tab-a');
    expect(axis.getAttribute('aria-controls')).toBe('p-tabpanel');
    expect(axis.className).toBe('on');
  });

  it('selects a tab on click, but not a disabled one', () => {
    const onSelect = vi.fn();
    render(<InspectorTabs idPrefix="p" label="Settings" tabs={TABS} current="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Text' }).title).toBe('Not now');
    fireEvent.click(screen.getByRole('tab', { name: 'Axis' }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
