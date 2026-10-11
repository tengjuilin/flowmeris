# ADR-0010 Worker API contract

**Status.** Accepted.

**Decision.** Types of the compute worker's API that are not Engine's own are defined once, in
`@flowmeris/engine` (`api.ts`). The worker's methods that only pass through take
`Parameters<Engine[method]>`, and the `WorkerPool` calls the worker through Comlink with those types, so
a mismatch between engine, worker and pool is a type error.

The pool has two kinds of request:

- **Plot requests** (`raster`, `histogram`, `counts`) go through the `Scheduler`
  (`apps/web/src/engine-client/scheduler.ts`): at most two in flight per worker, the rest queued and
  dropped when canceled, identical requests shared and results cached by the caller's key.
- **Direct requests** (`table`, `preview`, `channelValues`, `exportEvents`, `ingest`, `hasSample`) go
  to the worker at once. They are interactive (a gate preview while dragging) or few, and must not wait
  behind a queue of tile rasters.

The pool is started on first use (`getPool()`) and can be replaced in tests (`setPool()`).

**Why.** Repeating parameter lists in the engine, the worker and the pool meant three edits per new
parameter, with only some boundaries type-checked. The scheduler is separate from the workers so its
queueing, sharing and cancellation are tested in Node. Queuing every request would make gate previews
wait for queued plots, so the two kinds stay distinct.
