import { useEffect, useRef, useState } from 'react';
import type { ImageFormat } from '../../lib/export/svg.ts';
import { toast } from '../../state/store.ts';
import { ExportIcon } from '../ui/icons.tsx';

/**
 * Export button: opens a small form to choose the file format (and DPI for raster formats), and with
 * `csv` also the figure's data as CSV.
 */
export function ExportMenu({
  onExport,
  csv,
  className,
  disabled = false,
}: {
  /** Write the figure as `format`; `dpi` applies to PNG and JPEG. Returns nothing when there is no figure yet. */
  onExport: (format: ImageFormat, dpi: number) => Promise<void> | undefined;
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
    const job = onExport(format, Math.min(1200, Math.max(72, dpi || 300)));
    if (!job) return;
    setBusy(true);
    job
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
              <option value="pdf">PDF (vector)</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
              <option value="svg">SVG (vector)</option>
              {csv && <option value="csv">{csv.label}</option>}
            </select>
          </label>
          {(format === 'png' || format === 'jpeg') && (
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
