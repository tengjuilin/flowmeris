# Gating

| Tool | Draw | Edit |
|---|---|---|
| Rectangle (R) | drag a box | drag corners/edges; drag inside to move |
| Ellipse (E) | drag a bounding box | drag the *a* handle to resize and rotate, the *b* handle for the minor axis |
| Polygon (P) | click vertices; close by clicking the first vertex, double-clicking or pressing Enter; Backspace removes the last vertex | drag vertices; click an edge midpoint to insert a vertex |
| Quadrant (Q) | click the centre | drag the centre |
| Spider (S) | click the centre | drag the centre or any arm end; arms keep their order around the centre |
| Range (H, histograms) | drag horizontally | drag either edge |

- The inspector shows the selected gate's exact coordinates, in the gate's own units, and lets you type them.
- Labels show the percentage of the parent population for the current sample, updated live while dragging.
- **Double-click inside a gate** (or a quadrant/spider region) to open that population. Its plot starts
  with the parent's axes.
- Quadrant and spider gates create four populations, Q1 (top-left) to Q4 (bottom-left) clockwise, named
  by marker sign (e.g. `CD4+ CD8−`). Rename any population by double-clicking it in the population tree.
- Deleting a gate removes its populations and everything below them. Undo restores them.

Gates are defined in the scale of the axes they were drawn on. If you later change an axis scale, the
gate is drawn mapped onto the new scale, and its membership does not change
([why](../methods/gating#m-gate-space-coordinates-of-a-gate)).
