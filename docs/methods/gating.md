# Gating

Implementation: `packages/gating` (membership), `packages/engine` (populations and caching).
Tests: `packages/gating/src/gating.test.ts`, `packages/gatingml/src/compliance.test.ts`,
`packages/engine/src/engine.test.ts`.

## M-GATE-SPACE — coordinates of a gate

Each gate stores, for each of its one or two dimensions, the channel (`$PnN`), whether the group's
compensation applies, and the transform its coordinates are expressed in — exactly as Gating-ML 2.0
does. A gate drawn on a logicle axis is therefore defined in logicle units of *that* logicle transform.

If an axis scale is changed afterwards, the gate is still evaluated in its own space and is drawn mapped
onto the new axis (edges are densely resampled so curved images of straight edges are shown truthfully).
Such a gate can be edited after switching the axis back to the gate's scale. Population membership never
changes silently because of a display change.

Evaluation order for an event: linearise → compensate → transform → test membership.

## M-GATE-RECT — rectangle and range

Inside iff $\min_k \le x_k < \max_k$ on every bounded side (**min inclusive, max exclusive**,
Gating-ML 2.0). A missing bound is unbounded. One-dimensional rectangles are the histogram *range* gate.

## M-GATE-POLY — polygon

Inside iff the winding count around the point is **odd**: Sunday's winding-number algorithm with a
half-open crossing rule, preceded by a bounding-box test, identical to FlowUtils `points_in_polygon`
(`wind_count % 2 ≠ 0`). Self-intersecting polygons therefore follow the even–odd rule.

## M-GATE-ELLIPSE — ellipse

Inside iff $(\mathbf{x}-\boldsymbol{\mu})^\top \Sigma^{-1} (\mathbf{x}-\boldsymbol{\mu}) \le d^2$
(boundary inclusive), the Gating-ML ellipsoid definition. The UI edits centre, semi-axes $a \ge b$ and
rotation $\theta$; these map to $\Sigma = R(\theta)\,\mathrm{diag}(a^2, b^2)\,R(\theta)^\top$ with
$d^2 = 1$.

## M-GATE-QUAD — quadrant

A quadrant gate with centre $(c_x, c_y)$ produces four populations, named as in FlowJo:

| Region | x | y |
|---|---|---|
| Q1 (top-left) | $x < c_x$ | $y \ge c_y$ |
| Q2 (top-right) | $x \ge c_x$ | $y \ge c_y$ |
| Q3 (bottom-right) | $x \ge c_x$ | $y < c_y$ |
| Q4 (bottom-left) | $x < c_x$ | $y < c_y$ |

Ties go to the upper side, as for Gating-ML quadrant dividers ($[\,c, +\infty)$). The four counts sum
to the parent count unless some events have NaN coordinates ([M-TR-LOGNP](./transforms#m-tr-lognp-non-positive-values-on-a-log-scale)).

## M-GATE-SPIDER — spider

A spider gate is a quadrant gate whose four dividers are rays from the centre through four arm points
(up, right, down, left) that can be rotated independently (FlowJo "spider" gate). Arms are stored as points rather
than angles because angles are not invariant under axis rescaling.

Membership: the left and right rays form a "horizontal" divider $y = h(x)$, the up and down rays a
"vertical" divider $x = v(y)$. An event is on the + side of each divider by the same inclusive rule as a
quadrant gate ($y \ge h(x)$, $x \ge v(y)$), and regions are assigned as in the quadrant table. Sides are
determined with cross products (no slopes, no division).

Arms are constrained so that the up arm is above the centre, the right arm to its right, and so on, and
so that they stay in clockwise order. Under these constraints the regions are the four angular sectors.
Property tests verify that every event falls in exactly one region and that axis-aligned arms
reproduce the quadrant gate exactly, including on the dividers.

Gating-ML has no spider gate: export writes four polygon gates (one per sector, with outer vertices far
outside any data range) plus a `flowmeris:spider` element holding the exact definition. Events exactly on
a ray may be classified differently by other tools' polygon tests; everywhere else the result is identical
(verified by round-trip test).

## M-GATE-TREE — hierarchy, groups and overrides

- A population is the set of events of its parent population that are inside its gate (region).
  Membership is stored as a bitset per population and sample.
- Each group has one gating **template**. Plots and statistics belong to the group, so every analysis
  applies to every sample in it.
- A sample may **override** a gate's geometry (not its dimensions or children). The effective gate of a
  sample is its override if present, otherwise the template gate. Overrides are flagged in the sample list,
  population tree, tiles and statistics exports (`gate_overridden_on_path`, `overridden_gate_ids`).
- Results are cached by a content fingerprint of everything they depend on (file hash, compensation
  matrix, transform parameters, effective gate geometry of every ancestor, kernel version), so a cached
  result is valid by construction ([ADR-0004](../adr/#adr-0004-content-addressed-caching)).
