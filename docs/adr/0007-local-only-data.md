# ADR-0007 Local-only data handling

**Status.** Accepted.

**Decision.** No server component. The production build sets a Content-Security-Policy with
`connect-src 'self'`. Data persist only in the browser's origin-private storage (OPFS) and IndexedDB.
**Why.** Research and clinical data often may not leave the institution. The browser itself enforces
that the app cannot send them anywhere.
