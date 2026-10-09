# ADR-0003 Worker pool without SharedArrayBuffer

**Status.** Accepted.

**Decision.** Samples are pinned to one worker in a pool (the ingesting worker, otherwise
hash(sample) mod N). Data move between threads only as transferable buffers.
**Why.** Static hosting (GitHub Pages) cannot set the COOP/COEP headers that SharedArrayBuffer requires.
Pinning keeps each sample's caches in one place.
