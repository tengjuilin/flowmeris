import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportMenu } from './ExportMenu.tsx';

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Export' }));
const format = () => screen.getByLabelText('Format') as HTMLSelectElement;

describe('ExportMenu', () => {
  it('exports the figure in the chosen format and resolution', async () => {
    const onExport = vi.fn(() => Promise.resolve());
    render(<ExportMenu onExport={onExport} />);
    open();
    expect([...format().options].map((o) => o.value)).toEqual(['pdf', 'png', 'jpeg', 'svg']);
    expect(screen.queryByLabelText('Resolution (DPI)')).toBeNull();
    fireEvent.change(format(), { target: { value: 'png' } });
    fireEvent.change(screen.getByLabelText('Resolution (DPI)'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onExport).toHaveBeenCalledWith('png', 600);
  });

  it('offers the data as CSV when given, without a resolution', () => {
    const onExport = vi.fn(() => Promise.resolve());
    const write = vi.fn();
    render(<ExportMenu onExport={onExport} csv={{ label: 'CSV (plotted data)', write }} />);
    open();
    fireEvent.change(format(), { target: { value: 'csv' } });
    expect(format().selectedOptions[0]?.textContent).toBe('CSV (plotted data)');
    expect(screen.queryByLabelText('Resolution (DPI)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Format')).toBeNull();
  });
});
