import { useStore } from '../state/store.ts';

/** File loading progress (and errors), and the toast message, over the app. */
export function Overlays() {
  const status = useStore((s) => s.status);
  const setStatus = useStore((s) => s.setStatus);
  return (
    <>
      {status.ingest && (
        <output className="ingest">
          {status.ingest.done < status.ingest.total ? (
            <>
              Reading {status.ingest.done + 1}/{status.ingest.total}:{' '}
              <span className="mono">{status.ingest.current}</span>
              <progress max={status.ingest.total} value={status.ingest.done} />
            </>
          ) : (
            <>
              <strong>{status.ingest.errors.length} file(s) could not be read:</strong>
              <ul>
                {status.ingest.errors.map((e) => (
                  <li key={e.file}>
                    <span className="mono">{e.file}</span>: {e.message}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setStatus({ ingest: null })}>
                Dismiss
              </button>
            </>
          )}
        </output>
      )}
      {status.toast && (
        <output className="toast">
          {status.toast.text}
          {status.toast.action && (
            <button
              type="button"
              onClick={() => {
                status.toast?.action?.run();
                setStatus({ toast: null });
              }}
            >
              {status.toast.action.label}
            </button>
          )}
        </output>
      )}
    </>
  );
}
