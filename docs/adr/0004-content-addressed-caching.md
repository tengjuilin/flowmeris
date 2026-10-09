# ADR-0004 Content-addressed caching

**Status.** Accepted.

**Decision.** Every derived result (transformed column, population bitset) is cached under a fingerprint
of all of its inputs: file SHA-256, compensation matrix, transform parameters, effective gate geometry of
the whole ancestry, and kernel version.
**Why.** No cache can be stale, so there is no invalidation logic to get wrong. Undo returns to cached
results immediately, and overridden samples keep their cache when the template changes.
