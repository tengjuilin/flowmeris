# Architecture decision records

Each record states a decision and why it was made. Code comments cite them by number (for example
`ADR-0004`).

| ADR | Decision | Status |
|---|---|---|
| [0001](./0001-cpu-rasterisation) | CPU rasterisation in workers | Accepted |
| [0002](./0002-float64-arithmetic) | Float64 analysis arithmetic | Accepted |
| [0003](./0003-worker-pool) | Worker pool without SharedArrayBuffer | Accepted |
| [0004](./0004-content-addressed-caching) | Content-addressed caching | Accepted |
| [0005](./0005-gate-transform-space) | Gates live in their own transform space | Accepted |
| [0006](./0006-typescript-kernels) | TypeScript kernels first | Accepted |
| [0007](./0007-local-only-data) | Local-only data handling | Accepted |
| [0008](./0008-web-layout-and-layering) | Web app layout and import layering | Proposed |
| [0009](./0009-store-commands) | Store commands and explicit side effects | Accepted |
| [0010](./0010-worker-api) | Worker API contract | Accepted |

To add a record, copy the shape of an existing one (title, status, decision, why) into the next number
and add it to this table and to the sidebar in `docs/.vitepress/config.ts`.
