import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toast, useStore, warning } from '../state/store.ts';
import { Overlays } from './Overlays.tsx';

describe('Overlays', () => {
  it('shows a warning as an alert with an icon until it is dismissed', () => {
    render(<Overlays />);
    act(() => warning('The PDF uses Liberation Sans in place of Arial.'));
    const alert = screen.getByRole('alert');
    expect(alert.className).toBe('toast warning');
    expect(alert.textContent).toContain('The PDF uses Liberation Sans in place of Arial.');
    expect(alert.querySelector('svg.warning-icon')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useStore.getState().status.toast).toBeNull();
  });

  it('shows other messages as a plain toast', () => {
    render(<Overlays />);
    act(() => toast('Saved'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });
});
