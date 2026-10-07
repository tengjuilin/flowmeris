# Methods

Every computation in Flowmeris has a stable **method ID** (e.g. `M-TR-LOGICLE`). Method IDs appear in
source comments, tests and exports, so a number in a results table can be traced to the exact
definition used.

| Area | Page | Method IDs |
|---|---|---|
| Reading FCS files | [FCS parsing](./fcs) | M-FCS-HEADER, -TEXT, -OFFSETS, -DATA, -LIN, -WRITE |
| Spillover correction | [Compensation](./compensation) | M-COMP-MODEL, -PARSE, -INV, -COND |
| Axis scales | [Transforms](./transforms) | M-TR-FLIN, -FLOG, -LOGNP, -FASINH, -LOGICLE, -HYPERLOG, -TICKS |
| Gates and populations | [Gating](./gating) | M-GATE-SPACE, -RECT, -POLY, -ELLIPSE, -QUAD, -SPIDER, -TREE |
| Population statistics | [Statistics](./statistics) | M-STAT-* |
| Visualisation | [Plots](./plots) | M-PLOT-BIN, -SMOOTH, -PSEUDO, -DENSITY, -CONTOUR-EQP, -CONTOUR-LOG, M-EXPORT-PLOT |
| Output files | [Exports](./exports) | M-EXPORT-STATS, -GML, M-FCS-WRITE |
| Saved analyses | [Workspace format](./workspace) | M-MODEL-CANON |

The processing order for every event is fixed:

1. decode stored values (M-FCS-DATA);
2. linearise (M-FCS-LIN);
3. compensate (M-COMP-MODEL);
4. transform per gate or axis dimension (M-TR-*);
5. test gate membership within the parent population (M-GATE-*);
6. compute statistics on member events (M-STAT-*).
