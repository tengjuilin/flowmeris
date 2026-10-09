import { useEffect, useRef, useState } from 'react';
import type { ImageFormat } from '../lib/exportPlot.ts';
import { toast } from '../state/store.ts';

/** Export button: opens a small form to choose the file format (and DPI for raster formats). */
export function ExportMenu({
  onExport,
  className,
  floating,
}: {
  /** Write the figure as `format`; `dpi` applies to PNG and JPEG. Returns nothing when there is no figure yet. */
  onExport: (format: ImageFormat, dpi: number) => Promise<void> | undefined;
  className?: string;
  /** Place the form in the window under the button, so a clipping parent (a grid plot) doesn't cut it off. */
  floating?: boolean;
}) {
  const [open, setOpen] = useState<false | { top: number; right: number }>(false);
  const [format, setFormat] = useState<ImageFormat>('pdf');
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    // A floating form would stay put while its button scrolls away: close it instead.
    const scroll = (e: Event) => floating && !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open, floating]);
  const run = () => {
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
      <button
        type="button"
        aria-expanded={!!open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setOpen((o) => (o ? false : { top: r.bottom + 4, right: window.innerWidth - r.right }));
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 11v2.5h11V11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Export
      </button>
      {open && (
        <div
          className="export-pop"
          aria-label="Export options"
          style={floating ? { position: 'fixed', top: open.top, right: open.right, left: 'auto' } : undefined}
        >
          <label className="field">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as ImageFormat)}>
              <option value="pdf">PDF (vector)</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
              <option value="svg">SVG (vector)</option>
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
