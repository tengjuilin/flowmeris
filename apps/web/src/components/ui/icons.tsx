// Small line icons for buttons: 14 px (13 px for import and export), drawn in currentColor.

/** Reset: an undo arrow, an open arrowhead on a line that turns back on itself in a half circle. */
export function ResetIcon() {
  return (
    <svg
      className="reset-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.8 3L2.4 6L5.8 9" />
      <path d="M2.8 6H10.5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

/** Settings: two slider tracks with their knobs. */
export function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1 3.5h12M1 10.5h12" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="3.5" r="1.9" fill="var(--surface)" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.5" cy="10.5" r="1.9" fill="var(--surface)" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Open in another view: an arrow leaving a box. */
export function OpenInIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 12.5V3.5h13v13h-9" />
      <path d="M3.5 16.5l7-7M7 9.5h3.5V13" />
    </svg>
  );
}

/** Apply: a check mark copying onto a second sheet. */
export function ApplyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="8" height="8" rx="1.5" />
      <path d="M6 13.5h6a1.5 1.5 0 0 0 1.5-1.5V6M4.5 6l1.5 1.5 2.5-3" />
    </svg>
  );
}

/** Trash can: a lid with a handle over a bin with two slats. */
export function DeleteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5" />
    </svg>
  );
}

/** Import: an arrow up out of a tray (the reverse of the export icon). */
export function ImportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 10V2M4.5 5.5 8 2l3.5 3.5M2.5 11v2.5h11V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Export: an arrow down into a tray. */
export function ExportIcon() {
  return (
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
  );
}

/** Reverse: two arrows pointing opposite ways, up and down. */
export function ReverseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13V3M2.5 5.5L5 3l2.5 2.5" />
      <path d="M11 3v10M8.5 10.5L11 13l2.5-2.5" />
    </svg>
  );
}

/** Close: a small ×, for closing a tab. */
export function CloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 2l6 6M8 2 2 8" />
    </svg>
  );
}

/** Add: a small +, for adding a tab. */
export function AddIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 1.5v7M1.5 5h7" />
    </svg>
  );
}

/** Duplicate: two overlapping sheets. */
export function DuplicateIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5V3A1 1 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6a1 1 0 0 0 1 1h.5" />
    </svg>
  );
}
