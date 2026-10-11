import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField.tsx';

const reset = (over: Partial<Parameters<typeof ColorField>[0]['reset']> = {}) => ({
  disabled: false,
  label: 'Reset axis color',
  title: 'Reset the axis color',
  onReset: vi.fn(),
  ...over,
});

describe('ColorField', () => {
  it('reports a picked color', () => {
    const onChange = vi.fn();
    render(
      <ColorField label="Axis color" inputLabel="Axis" value="#000000" onChange={onChange} reset={reset()} />,
    );
    fireEvent.change(screen.getByLabelText('Axis'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith('#ff0000');
  });

  it('resets, unless the reset is disabled', () => {
    const r = reset();
    const { rerender } = render(
      <ColorField label="Axis color" value="#000000" onChange={() => {}} reset={r} />,
    );
    const button = screen.getByRole('button', { name: 'Reset axis color' });
    expect(button.title).toBe('Reset the axis color');
    fireEvent.click(button);
    expect(r.onReset).toHaveBeenCalledTimes(1);
    rerender(
      <ColorField label="Axis color" value="#000000" onChange={() => {}} reset={{ ...r, disabled: true }} />,
    );
    fireEvent.click(button);
    expect(r.onReset).toHaveBeenCalledTimes(1);
  });

  it('lays out as an inline label or a field, with an icon-styled reset if asked', () => {
    const { container, rerender } = render(
      <ColorField inline label="Fill" value="#000000" onChange={() => {}} reset={reset()} />,
    );
    expect(container.firstElementChild?.tagName).toBe('LABEL');
    expect(container.firstElementChild?.className).toBe('field inline');
    expect(screen.getByRole('button').className).toBe('reset-btn');
    rerender(<ColorField label="Fill" value="#000000" onChange={() => {}} reset={reset({ icon: true })} />);
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(container.firstElementChild?.className).toBe('field');
    expect(screen.getByRole('button').className).toBe('icon reset-btn');
  });
});
