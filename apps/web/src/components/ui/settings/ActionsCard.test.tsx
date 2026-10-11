import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplyCard, ResetCard } from './ActionsCard.tsx';

const card = { id: 'c', title: 'Apply settings', open: true, onToggle: () => {} };

describe('ApplyCard and ResetCard', () => {
  it('runs an action from its button, unless it is disabled', () => {
    const run = vi.fn();
    const off = vi.fn();
    render(
      <ResetCard
        card={{ ...card, title: 'Reset settings' }}
        actions={[
          { label: 'All settings in this plot', title: 'Reset this plot', run },
          { label: 'All plots', title: 'Reset every plot', disabled: true, run: off },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reset settings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset this plot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset every plot' }));
    expect(run).toHaveBeenCalledOnce();
    expect(off).not.toHaveBeenCalled();
    expect(screen.getByText('All plots')).toBeTruthy();
  });

  it('shows its checkboxes after the actions and reports changes', () => {
    const onChange = vi.fn();
    render(
      <ApplyCard
        card={card}
        actions={[{ label: 'Apply to all', title: 'Apply now', run: () => {} }]}
        checks={[{ label: 'Carry settings', title: 'On: carried', checked: false, onChange }]}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Carry settings' });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
