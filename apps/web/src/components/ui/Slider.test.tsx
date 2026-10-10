import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PercentSlider } from './Slider.tsx';

describe('PercentSlider', () => {
  it('takes a typed percentage as a fraction, limited to 0..max', () => {
    const onChange = vi.fn();
    render(<PercentSlider label="Overlap" value={0.5} max={2} onChange={onChange} />);
    const box = screen.getByLabelText('Overlap (%)') as HTMLInputElement;
    expect(box.value).toBe('50');
    fireEvent.change(box, { target: { value: '75' } });
    expect(onChange).toHaveBeenLastCalledWith(0.75);
    fireEvent.change(box, { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('moves with the slider', () => {
    const onChange = vi.fn();
    render(<PercentSlider label="Overlap" value={0.5} max={2} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Overlap'), { target: { value: '1.25' } });
    expect(onChange).toHaveBeenCalledWith(1.25);
  });
});
