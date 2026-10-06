# Architecture decision records

## ADR-0001 CPU rasterisation in workers

**Decision.** Plots are binned and coloured on the CPU in Web Workers. The main thread receives an RGBA
image. WebGL is not used.
**Why.** Binning 10⁶ events costs a few milliseconds, about the same as uploading them to a GPU. The
output is byte-deterministic, which allows golden-image tests, and the same code serves screen and
export. Tiled views with dozens of panels would exceed browsers' limit of about 16 WebGL contexts.

## ADR-0002 Float64 analysis arithmetic

**Decision.** Compensation, transforms, gating and statistics use float64. Stored columns are float32
only when that is exact.
**Why.** Event-level agreement with reference implementations (FlowKit works in float64) and
reproducible boundary decisions.

## ADR-0003 Worker pool without SharedArrayBuffer

**Decision.** Samples are pinned to one worker in a pool (the ingesting worker, otherwise
hash(sample) mod N). Data move between threads only as transferable buffers.
**Why.** Static hosting (GitHub Pages) cannot set the COOP/COEP headers that SharedArrayBuffer requires.
Pinning keeps each sample's caches in one place.

## ADR-0004 Content-addressed caching

**Decision.** Every derived result (transformed column, population bitset) is cached under a fingerprint
of all of its inputs: file SHA-256, compensation matrix, transform parameters, effective gate geometry of
the whole ancestry, and kernel version.
**Why.** No cache can be stale, so there is no invalidation logic to get wrong. Undo returns to cached
results immediately, and overridden samples keep their cache when the template changes.

## ADR-0005 Gates live in their own transform space

**Decision.** Gates store the transform of each dimension (Gating-ML semantics). Transforms are immutable
and content-addressed.
**Why.** Changing a display scale must never change population membership.

## ADR-0006 TypeScript kernels first

**Decision.** All numerical kernels are TypeScript behind plain functions. WebAssembly will be added only
for kernels that miss performance budgets, and will be tested against the TypeScript reference.
**Why.** One readable reference implementation that runs in Node for tests and in the browser.

## ADR-0007 Local-only data handling

**Decision.** No server component. The production build sets a Content-Security-Policy with
`connect-src 'self'`. Data persist only in the browser's origin-private storage (OPFS) and IndexedDB.
**Why.** Research and clinical data often may not leave the institution. The browser itself enforces
that the app cannot send them anywhere.
