# ADR-0014 Scales outside Gating-ML, exported as extension elements

**Status.** Accepted.

**Decision.** Besides the Gating-ML 2.0 transforms, an axis can use FlowJo's biex
([M-TR-BIEX](../methods/transforms#m-tr-biex-flowjo-biex)) and a Miltenyi-style scale
([M-TR-MILTENYI](../methods/transforms#m-tr-miltenyi-miltenyi)). They are transforms like the others
(content-addressed, stored by gates, ADR-0005), with their own parameter names (FlowJo's for biex). In
Gating-ML they are written as a `flowmeris:biex` or `flowmeris:miltenyi` element inside the
`transforms:transformation`, in the `https://flowmeris.org/ns/gating-ext/1` namespace already used for gate
extensions, and Flowmeris's reader parses them back. Logicle stays the default for fluorescence channels.

**Why.** Users moving from FlowJo expect its Biex and Miltenyi displays, and FlowJo's biex is not logicle:
gates copied by coordinates only line up on the same scale. Gating-ML has no element for either, and no
standard transform reproduces them, so an approximation (nearest logicle) would move gates in other tools
without saying so. An extension element keeps the file exact for Flowmeris and makes other tools refuse it
rather than evaluate different gates.

**Consequences.** A Gating-ML file with a gate on a biex or Miltenyi dimension is not valid Gating-ML 2.0;
FlowKit and other readers reject it. The user guide says so and points to logicle, arcsinh or hyperlog for
exchanging gates. Biex matches FlowKit's port of FlowJo exactly; the Miltenyi scale is Flowmeris's own
definition, since FlowJo publishes none.
