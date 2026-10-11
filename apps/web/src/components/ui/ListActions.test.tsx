import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListActions } from './ListActions.tsx';

describe('ListActions', () => {
  it('draws an icon on every button and runs each reset unless it is disabled', () => {
    const reverse = vi.fn();
    const order = vi.fn();
    const colors = vi.fn();
    const { container } = render(
      <ListActions
        onReverse={reverse}
        resets={[
          { label: 'Order', title: 'Reset the order', disabled: false, run: order },
          { label: 'Colors', title: 'Reset the colors', disabled: true, run: colors },
        ]}
      />,
    );
    expect(container.querySelectorAll('button svg')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset the order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset the colors' }));
    expect(reverse).toHaveBeenCalledOnce();
    expect(order).toHaveBeenCalledOnce();
    expect(colors).not.toHaveBeenCalled();
    expect(screen.getByText('Order')).toBeTruthy();
  });
});
