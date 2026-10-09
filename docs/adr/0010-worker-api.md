# ADR-0010 Worker API contract

**Status.** Proposed.

**Decision.** The request and response types of every compute-worker method are defined once, in
`@flowmeris/engine`. The worker and the `WorkerPool` derive their signatures from those types instead of
repeating them. Every pool call goes through one scheduler, which handles queueing, cancellation and
(for methods marked cacheable) result caching. The pool is created on first use and can be replaced in
tests.

**Why.** When parameter lists are repeated in the engine, the worker and the pool, adding a parameter
means editing three places, and the compiler checks only one of the boundaries. One scheduling path
makes cancellation and caching uniform, and an injectable pool lets code that calls it be tested in Node.
