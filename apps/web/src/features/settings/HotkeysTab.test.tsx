import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_SETTINGS } from '../../lib/settings/index.ts';
import { useSettings } from '../../state/settings.ts';
import { HotkeysTab } from './HotkeysTab.tsx';

const keysOf = (action: string) => screen.getByLabelText(`${action} keys`).textContent;

beforeEach(() => useSettings.getState().replace(EMPTY_SETTINGS));

describe('HotkeysTab', () => {
  it('records the next key press as the new key, and moves it from the action that had it', () => {
    render(<HotkeysTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Rectangle' }));
    expect(screen.getByRole('button', { name: 'Press the new key for Rectangle' })).toBeTruthy();
    // A modifier alone waits for the key.
    fireEvent.keyDown(window, { key: 'Shift', shiftKey: true });
    fireEvent.keyDown(window, { key: 'v' });
    expect(keysOf('Rectangle')).toBe('V');
    expect(keysOf('Select')).toBe('None');
    expect(screen.getByText(/V moved from Select to Rectangle/)).toBeTruthy();
    expect(useSettings.getState().settings.hotkeys).toEqual({ 'tool.rect': ['V'], 'tool.select': [] });
  });

  it('records Escape rather than letting it close the dialog', () => {
    render(<HotkeysTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Undo' }));
    const esc = fireEvent.keyDown(window, { key: 'Escape' });
    expect(esc).toBe(false); // default prevented
    expect(keysOf('Undo')).toBe('Esc');
  });

  it('resets and clears an action', () => {
    render(<HotkeysTab />);
    const row = (name: string) => screen.getByText(name, { selector: 'span' }).parentElement!;
    fireEvent.click(within(row('Redo')).getByRole('button', { name: 'Clear Redo' }));
    expect(keysOf('Redo')).toBe('None');
    fireEvent.click(within(row('Redo')).getByRole('button', { name: 'Reset Redo' }));
    expect(useSettings.getState().settings.hotkeys).toEqual({});
    expect((screen.getByRole('button', { name: 'Reset all hotkeys' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
