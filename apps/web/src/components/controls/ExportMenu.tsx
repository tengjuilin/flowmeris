import { useEffect, useRef, useState } from 'react';
import {
  FORMATS,
  FORMAT_IDS,
  type FigureSource,
  type ImageFormat,
  clampDpi,
} from '../../lib/export/index.ts';
import { exportFigure } from '../../state/export.ts';
import { toast } from '../../state/store.ts';
import { ExportIcon } from '../ui/icons.tsx';

/** What an Export menu writes: the figure and its file name (without extension). */
export interface ExportTarget {
  figure: FigureSource;
  name: string;
}

/**
 * The Export button of every figure: opens a small form to choose the file format (and DPI for raster
 * formats), and with `csv` also the figure's data as CSV. Formats come from lib/export (FORMATS).
 */
export function ExportMenu({
  target,
  csv,
  className,
  disabled = false,
}: {
  /** The figure to export, read when Download is clicked; undefined when there is none yet. */
  target: () => ExportTarget | undefined;
  /** Adds a CSV format to the list, labeled `label`, which `write` downloads. */
  csv?: { label: string; write: () => void };
  className?: string;
  /** Gray out the button (nothing to export). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ImageFormat | 'csv'>('pdf');
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const run = () => {
    if (format === 'csv') {
      csv?.write();
      setOpen(false);
      return;
    }
    const t = target();
    if (!t) return;
    setBusy(true);
    exportFigure(t.figure, format, t.name, clampDpi(dpi))
      .then(() => setOpen(false))
      .catch((e) => toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  };
  return (
    <div className={className ? `export-menu ${className}` : 'export-menu'} ref={ref}>
      <button type="button" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <ExportIcon />
        Export
      </button>
      {open && (
        <div className="export-pop" aria-label="Export options">
          <label className="field">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as ImageFormat | 'csv')}>
              {FORMAT_IDS.map((f) => (
                <option key={f} value={f}>
                  {FORMATS[f].label}
                </option>
              ))}
              {csv && <option value="csv">{csv.label}</option>}
            </select>
          </label>
          {format !== 'csv' && FORMATS[format].raster && (
            <label className="field">
              Resolution (DPI)
              <input
                type="number"
                min={72}
                max={1200}
                step={50}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              />
            </label>
          )}
          <button type="button" className="primary" disabled={busy} onClick={run}>
            {busy ? 'Exporting…' : 'Download'}
          </button>
        </div>
      )}
    </div>
  );
}
