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

## Gating path

The **Gating path** tab shows, for one sample, how events move through the gating tree. Choose the
sample and a population in its toolbar (they follow the current sample and population of the Plot view).

- **Path** lays out one plot per step from *All events* to the chosen population. Each plot highlights the
  gate that leads to the next step (other gates on that plot are dimmed; for quadrant and spider gates the
  followed region's percentage is underlined), and the arrow between steps gives that population's event
  count and percentage of its parent. The last card shows the chosen population's own plot if it has
  one, otherwise its count and percentage of all events.
- **Tree** shows every plot in the gating tree, branching where a population has several child gates;
  populations without gates of their own appear as labelled chips. Gates on the way to the chosen
  population are highlighted.
- **Backgating** overlays the chosen population's events, in its colour, on every plot above it, with
  the plotted population greyed out. On histograms the overlay is drawn in the same units as the
  histogram (so its area is the fraction of the plotted population it represents).

If a step's gate was drawn on axes other than the population's saved plot, the step is drawn on the
gate's own channels using the group's default axes. Click a plot title to open that population in the
Plot view.
