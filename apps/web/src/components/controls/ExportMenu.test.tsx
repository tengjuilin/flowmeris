import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigureSource } from '../../lib/export/index.ts';
import { exportFigure } from '../../state/export.ts';
import { ExportMenu } from './ExportMenu.tsx';

vi.mock('../../state/export.ts', () => ({ exportFigure: vi.fn(() => Promise.resolve()) }));

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Export' }));
const format = () => screen.getByLabelText('Format') as HTMLSelectElement;
const figure: FigureSource = { build: () => Promise.resolve('<svg/>') };

describe('ExportMenu', () => {
  beforeEach(() => vi.mocked(exportFigure).mockClear());

  it('exports the figure in the chosen format and resolution', async () => {
    render(<ExportMenu target={() => ({ figure, name: 'fig' })} />);
    open();
    expect([...format().options].map((o) => o.value)).toEqual(['pdf', 'png', 'jpeg', 'svg']);
    expect(screen.queryByLabelText('Resolution (DPI)')).toBeNull();
    fireEvent.change(format(), { target: { value: 'png' } });
    fireEvent.change(screen.getByLabelText('Resolution (DPI)'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(exportFigure).toHaveBeenCalledWith(figure, 'png', 'fig', 600);
  });

  it('keeps the resolution within 72–1200 DPI', () => {
    render(<ExportMenu target={() => ({ figure, name: 'fig' })} />);
    open();
    fireEvent.change(format(), { target: { value: 'jpeg' } });
    fireEvent.change(screen.getByLabelText('Resolution (DPI)'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(exportFigure).toHaveBeenCalledWith(figure, 'jpeg', 'fig', 1200);
  });

  it('does nothing while there is no figure', () => {
    render(<ExportMenu target={() => undefined} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(exportFigure).not.toHaveBeenCalled();
  });

  it('offers the data as CSV when given, without a resolution', () => {
    const write = vi.fn();
    render(
      <ExportMenu target={() => ({ figure, name: 'fig' })} csv={{ label: 'CSV (plotted data)', write }} />,
    );
    open();
    fireEvent.change(format(), { target: { value: 'csv' } });
    expect(format().selectedOptions[0]?.textContent).toBe('CSV (plotted data)');
    expect(screen.queryByLabelText('Resolution (DPI)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(exportFigure).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Format')).toBeNull();
  });
});
