# ADR-0002 Float64 analysis arithmetic

**Status.** Accepted.

**Decision.** Compensation, transforms, gating and statistics use float64. Stored columns are float32
only when that is exact.
**Why.** Event-level agreement with reference implementations (FlowKit works in float64) and
reproducible boundary decisions.
