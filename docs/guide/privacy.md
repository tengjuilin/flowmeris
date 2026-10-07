# Privacy and storage

- **No uploads.** Files are read with the browser's File API and processed in Web Workers inside the
  tab. The production build's Content-Security-Policy (`connect-src 'self'`) makes the browser block any
  request to another origin.
- **Where data are kept.** Decoded event columns are stored in the Origin Private File System (OPFS).
  The workspace autosaves to IndexedDB, together with its last 20 versions. Both stay in this browser
  profile on this computer. Flowmeris asks the browser to make this storage persistent.
- **Private browsing.** Some browsers disable OPFS in private windows. Flowmeris then keeps data in memory
  for the session and shows a notice.
- **Moving an analysis.** *Save workspace* writes a JSON file without event data. On another computer,
  open it and add the same FCS folder again: samples are re-linked by SHA-256, so a modified file is never
  silently substituted.
- **Clearing data.** Clearing the site data for Flowmeris in the browser settings removes all stored
  samples and workspaces.
