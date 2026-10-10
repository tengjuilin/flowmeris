import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelSpec } from '../../../lib/settingsPanel.ts';
import { EmptyPanel, SettingsPanel } from './SettingsPanel.tsx';

const SPEC: PanelSpec<'axis' | 'settings', 'x'> = {
  key: 'k',
  idPrefix: 'p',
  name: 'Plot settings',
  noun: 'plot',
  defaultTab: 'axis',
  tabs: [
    { id: 'axis', label: 'Axis', cards: { x: 'X axis' } },
    { id: 'settings', label: 'Settings', cards: {}, resettable: false },
  ],
};

describe('SettingsPanel', () => {
  it('draws the tabs and the open tab, and resets it with an undo label', () => {
    const onReset = vi.fn();
    render(
      <SettingsPanel spec={SPEC} tab="axis" onTab={() => {}} reset={{ disabled: false, onReset }}>
        <p>body</p>
      </SettingsPanel>,
    );
    expect(screen.getByRole('complementary', { name: 'Plot settings' })).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('p-tab-axis');
    expect(screen.getByText('body')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset the settings in this panel' }));
    expect(onReset).toHaveBeenCalledWith('Reset plot axis settings');
  });

  it('has no panel reset on a tab with nothing to reset, and can disable a tab', () => {
    render(
      <SettingsPanel
        spec={SPEC}
        tab="settings"
        onTab={() => {}}
        disabledTabs={{ axis: 'Not now' }}
        reset={{ disabled: false, onReset: () => {} }}
      >
        <p>body</p>
      </SettingsPanel>,
    );
    expect(screen.queryByRole('button', { name: 'Reset the settings in this panel' })).toBeNull();
    const axis = screen.getByRole('tab', { name: 'Axis' }) as HTMLButtonElement;
    expect([axis.disabled, axis.title]).toEqual([true, 'Not now']);
  });

  it('says what to do first when there is nothing to edit', () => {
    const { rerender } = render(<EmptyPanel spec={SPEC} />);
    expect(screen.getByText('Add samples to change these settings.')).toBeTruthy();
    rerender(<EmptyPanel spec={SPEC}>Add a chart to change its settings.</EmptyPanel>);
    expect(screen.getByText('Add a chart to change its settings.')).toBeTruthy();
  });
});
