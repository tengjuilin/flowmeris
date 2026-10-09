# ADR-0006 TypeScript kernels first

**Status.** Accepted.

**Decision.** All numerical kernels are TypeScript behind plain functions. WebAssembly will be added only
for kernels that miss performance budgets, and will be tested against the TypeScript reference.
**Why.** One readable reference implementation that runs in Node for tests and in the browser.
