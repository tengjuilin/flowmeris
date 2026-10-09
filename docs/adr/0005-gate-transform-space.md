# ADR-0005 Gates live in their own transform space

**Status.** Accepted.

**Decision.** Gates store the transform of each dimension (Gating-ML semantics). Transforms are immutable
and content-addressed.
**Why.** Changing a display scale must never change population membership.
