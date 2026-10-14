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

/** Warning: an exclamation mark in a triangle. */
export function WarningIcon() {
  return (
    <svg className="warning-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
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

/** Undo: the reset arrow, for the header's Undo button. */
export function UndoIcon() {
  return <ResetIcon />;
}

/** Redo: the undo arrow mirrored. */
export function RedoIcon() {
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
      style={{ transform: 'scaleX(-1)' }}
    >
      <path d="M5.8 3L2.4 6L5.8 9" />
      <path d="M2.8 6H10.5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

/** Help: a question mark in a circle. */
export function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.1 6.2a1.9 1.9 0 1 1 2.8 1.7c-.6.4-.9.8-.9 1.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r=".85" fill="currentColor" />
    </svg>
  );
}

/** Folder: a folder with a tab. */
export function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.8 3.5h4l1.5 1.7h6.9v7.3H1.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** File: a sheet with a folded corner. */
export function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 1.8h5.8l3.2 3.2v9.2h-9zM9.3 1.8V5h3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Settings (the app's): a gear. */
export function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M12.66 6.18L14.5 6.84v2.32l-1.84.66-.08.18.83 1.77-1.64 1.64-1.77-.83-.18.08-.66 1.84H6.84l-.66-1.84-.18-.08-1.77.83-1.64-1.64.83-1.77-.08-.18-1.84-.66V6.84l1.84-.66.08-.18-.83-1.77 1.64-1.64 1.77.83.18-.08.66-1.84h2.32l.66 1.84.18.08 1.77-.83 1.64 1.64-.83 1.77z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** GitHub: its mark, filled. */
export function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
