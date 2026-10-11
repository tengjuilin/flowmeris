# Flowmeris: notes for coding agents

Flowmeris is a browser-only flow cytometry app. It reads FCS files, gates them, plots them and exports
statistics and Gating-ML. It is a pnpm monorepo: numerical libraries live in `packages/*` and the React
app in `apps/web`. Every computation is documented in `docs/methods` and validated against reference
implementations (FlowKit, NumPy, SciPy).

More specific notes: [`packages/CLAUDE.md`](packages/CLAUDE.md) and [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md).
`AGENTS.md` is a symlink to this file.

## Commands

Use `corepack pnpm …` (pnpm 9 through corepack, Node ≥ 20).

| Command | What it does |
|---|---|
| `corepack pnpm check` | lint, `lint:deps`, `lint:size`, typecheck, all vitest projects. Run before every commit. |
| `corepack pnpm test` | vitest, all projects (`unit`, `golden`, `dom`) |
| `corepack pnpm test:golden` | only the golden project (`packages/*/test/**`) |
| `corepack pnpm lint:deps` | import boundaries (dependency-cruiser, `.dependency-cruiser.cjs`) |
| `corepack pnpm lint:size` | 500-line cap on `.ts`/`.tsx` (`tools/check-size.mjs`, `tools/size-allowlist.json`) |
| `corepack pnpm build && corepack pnpm e2e` | Playwright on Chromium, Firefox and WebKit against `vite preview` on :4173 |
| `corepack pnpm dev` | the app with HMR (`.claude/launch.json` has `web` on :5173) |
| `corepack pnpm fixtures:fetch` | download large fixtures (SHA-256 checked). Tests that need them are skipped without them. |

## Layout

```
packages/      numerical libraries, app-independent (see packages/CLAUDE.md)
apps/web/      React app, zustand store, compute worker pool (see apps/web/CLAUDE.md)
e2e/           Playwright specs; helpers.ts writes small synthetic FCS files
docs/          VitePress site: guide/ (users), methods/ (definitions), validation/, adr/ (decisions)
fixtures/      reference data: flowio/, flowkit/ (ISAC Gating-ML suite), golden/ (generated), remote/ (fetched)
tools/         fetch-fixtures.mjs, check-size.mjs, golden/ (Python generator + compare.mjs)
```

Imports only point down: `apps/web` → `packages/*`, and packages never import from `apps/`. Within the
packages, `model` is the base and `engine` sits on top. A package may import only the workspace packages
listed in its `package.json` (`dependencies` from src, plus `devDependencies` from tests), and only by
package name, never by a path into another package's `src/`. `pnpm lint:deps` enforces this.
[ADR-0008](docs/adr/0008-web-layout-and-layering.md) describes the layers.

## Tests

- **Unit**: `src/**/*.test.ts`, next to the code, in Node (vitest project `unit`). Put pure logic in a
  function you can test this way instead of inside a React component.
- **Component**: `apps/web/src/**/*.test.tsx` (project `dom`: jsdom and Testing Library), for shared
  controls.
- **Golden**: `packages/*/test/**/*.test.ts` (project `golden`). These compare against values in
  `fixtures/golden`, which FlowKit/NumPy/SciPy generate:
  1. `corepack pnpm golden:inputs` writes the files the app exports (`fixtures/golden/inputs`), and the
     unit run checks they are still written byte for byte;
  2. `corepack pnpm golden` also runs `tools/golden/python/generate.py` (needs `uv`) to recompute the
     reference values;
  3. CI's `golden-drift` job regenerates them and compares with `tools/golden/compare.mjs`.

  Never edit files in `fixtures/golden` by hand. If a golden test fails, the code is wrong until shown
  otherwise.
- **E2E**: `e2e/*.spec.ts`. Use them for UI behavior; select elements by role and label where possible.
  Locally, run only Chromium and WebKit (`--project=chromium --project=webkit`); you do not need to run
  Firefox locally, because CI runs it.
- Tolerances are in `@flowmeris/testkit` (`TOL`); do not loosen them to make a test pass.

## Conventions

- **Method IDs.** Every computation has an ID such as `M-TR-LOGICLE`, defined in `docs/methods/*.md`
  (index in `docs/methods/index.md`). Cite the ID in a doc comment where the method is implemented. If you
  change what a method computes, update its page in the same commit.
- **ADRs.** `docs/adr/NNNN-*.md`, cited in comments as `ADR-0004`. A change that goes against an ADR
  needs a new ADR.
- **Refactors do not change behavior.** A behavior change, even a fix found while refactoring, goes
  in its own commit with a test that shows it.
- **File size.** Keep `.ts`/`.tsx` files under 500 lines and split them by responsibility.
  `tools/size-allowlist.json` would list files over the limit (empty now). Do not add to it: split the
  file instead.
- **Known boundary violations** would be listed in `.dependency-cruiser-known-violations.json` (empty
  now). Do not add to it: fix the import instead.
- **Style.** Biome (`biome.json`): 2 spaces, single quotes, line width 110. Imports carry their `.ts`
  extension. TypeScript is strict with `noUncheckedIndexedAccess` and `noUnusedLocals`. Biome warns on functions whose
  cognitive complexity is over 25; do not add new ones.
- **American English** everywhere: UI text, undo labels, identifiers, comments and docs ("color",
  "center", "normalize", "behavior", "gray", "labeled"). The HTML attribute `aria-labelledby` keeps its
  spelling.
- **Docs.** The user guide (`docs/guide`) describes behavior users see. Update it when that changes.
