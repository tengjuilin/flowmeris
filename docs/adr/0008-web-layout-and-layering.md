# ADR-0008 Web app layout and import layering

**Status.** Accepted. Adopted in phases P2 to P4 of the 2026 refactor; `pnpm lint:deps` and `pnpm lint:size` enforce it, and neither has known violations or allowlisted files. [`apps/web/CLAUDE.md`](https://github.com/tengjuilin/flowmeris/blob/main/apps/web/CLAUDE.md) shows the current layout.

**Decision.** `apps/web/src` is organized in layers, and imports only point down:

| Layer | Contents | May import |
|---|---|---|
| `app/` | shell: header, tab bar, view registry, hotkeys | everything below |
| `features/<name>/` | one view with its inspector, hooks and CSS; public API in `index.ts` | `components/`, `state/`, `lib/`, packages, other features' `index.ts` |
| `components/ui`, `components/controls`, `components/hooks` | generic controls and hooks | `state/`, `lib/`, packages |
| `state/` | zustand store, commands, preferences, data hooks | `engine-client/`, `lib/`, packages |
| `engine-client/`, `workers/` | worker pool and compute worker | `lib/`, packages |
| `lib/` | pure functions, tested in Node | packages only |

Code outside a feature, and other features, import it only through its `index.ts`. All CSS is global, so a
feature's CSS file is imported by `styles/index.css` in cascade order rather than by the feature's modules.

Packages never import `apps/`. A package imports only the workspace packages declared in its
`package.json`, and only through their entry points. Source files are capped at 500 lines; files that were
larger when the cap was introduced were allowlisted and could only shrink (all were split by P4).

**Why.** Coding agents (and people) change one feature at a time. When a feature lives in one folder,
logic is pure and tested, and boundaries are checked by `pnpm lint:deps` and `pnpm lint:size`, the
files a change affects can be found from the import graph rather than by reading the whole app.
