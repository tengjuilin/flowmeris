# Gating

| Tool | Draw | Edit |
|---|---|---|
| Rectangle (R) | drag a box | drag corners/edges; drag inside to move |
| Ellipse (E) | drag a bounding box | drag the *a* handle to resize and rotate, the *b* handle for the minor axis |
| Polygon (P) | click vertices; close by clicking the first vertex, double-clicking or pressing Enter; Backspace removes the last vertex | drag vertices; click an edge midpoint to insert a vertex |
| Quadrant (Q) | click the centre | drag the centre |
| Spider (S) | click the centre | drag the centre or any arm end; arms keep their order around the centre |
| Range (H, histograms) | drag horizontally | drag either edge |
| Bisector (B, histograms) | click where to split; the percentages on each side are shown before you click | drag the vertical line |

- The inspector shows the selected gate's exact coordinates, in the gate's own units, and lets you type them.
- Labels show the percentage of the parent population for the current sample, updated live while dragging.
- **Double-click inside a gate** (or a quadrant/spider region) to open that population. Its plot starts
  with the parent's axes.
- **Click an axis title** to pick another channel for that axis; it takes the channel's default scale. This
  works on every plot with axis titles: the Gate view, Plot grid, Tiles, reference plots and the Ridge
  view. Arrow keys and Enter pick from the list; long lists can be filtered by typing.
- Quadrant and spider gates create four populations, Q1 (top-left) to Q4 (bottom-left) clockwise, named
  by marker sign (e.g. `CD4+ CD8−`). Rename any population by double-clicking it in the population tree.
- A bisector (FlowJo's binary histogram gate) splits the histogram's events into two populations that
  never overlap and together hold every event: `CD4−` left of the line and `CD4+` at or right of it. Their
  percentages, labelled in the plot's top corners, add up to 100% of the parent
  ([M-GATE-SPLIT](../methods/gating#m-gate-split-bisector)).
- **Click a histogram's y-axis title** to choose what it shows: **Count** (events per bin), **% of max**
  (FlowJo's "normalised to mode") or **Fraction** (unit area, bins sum to 1).
- Deleting a gate removes its populations and everything below them. Undo restores them.

Gates are defined in the scale of the axes they were drawn on. If you later change an axis scale, the
gate is drawn mapped onto the new scale, and its membership does not change
([why](../methods/gating#m-gate-space-coordinates-of-a-gate)).

## Reference plots

Under the population tree, **Reference plots** keep other views of the data in sight while you gate,
e.g. a fluorescence pair while gating on scatter. Add one with **+**; each opens in its own tab, and
**✕** closes it. Reference plots are saved with the group in the workspace.

- Each has its own plot type and X/Y channels. Its axis scales are the group's defaults for those channels.
- **Population** and **Sample** follow the Gate view by default. Pick one to pin it, e.g. the parent
  population or an unstained control. A pinned population that is deleted goes back to following.
- Gates drawn on matching axes are shown read-only. Edit gates in the main plot.
- **Backgate** overlays the population being gated, in its colour, when the reference plot shows a
  different population.

## Plot grid

The **Plot** tab lays plots out in a fixed grid, e.g. scatter, singlets and every marker of a panel side by
side. **Plot size** steps through the sizes that fill a row (3 columns by default); when the window is
resized, the number of columns changes to keep the plots near that size. The grid always ends with a row
of empty cells, and is saved with the group in the workspace.

- Add a plot by choosing its type in an empty cell. It starts on the population selected in the Gate view.
- Click a plot to select it (blue border). The gating tools and **Edit template** / **This sample only**
  act on the selected plot, exactly as in the Gate view; gates belong to the same group template.
- The settings panel (the button right of **Plot size**) edits the selected plot. Its **Figure › Plot** card
  sets the plot type, title, **Population** and **Sample** (◀ ▶ step through the group's samples; *Follow
  selected* tracks the sample selected in the sidebar); the **Axis** tab sets the X/Y channels and scales.
- The **Sample overlay** card below it draws other samples on the same plot, each in its own colour with a
  legend: dots on 2D plots, outlines on histograms. Gates and their percentages are those of the plotted
  sample.
- The **Populations** card at the top right shows the selected plot's population tree and counts; click a
  population to show it in the selected plot.
- **Double-click inside a gate** to show its population in the next empty cell, with the same axes.
- **Click the population or sample in a plot's title** to show another population or sample in that cell
  (or set the sample back to *Follow selected*).
- **Export**, next to **Edit template** / **This sample only**, saves the selected plot as PDF, PNG, JPG or SVG.
- **Gate** and **Tiles** in a plot's title open it in that view.
- **Delete** (or Backspace) removes the selected plot, unless a gate is selected (that removes the gate).
- Deleting a gate moves plots of its populations back to the gate's parent population.

## Gating path

The **Gating path** tab shows, for one sample, how events move through the gating tree. Choose the
sample and a population in its toolbar (they follow the current sample and population of the Gate view).

- **Path** lays out one plot per step from *All events* to the chosen population. Each plot highlights the
  gate that leads to the next step (other gates on that plot are dimmed; for quadrant and spider gates the
  followed region's percentage is underlined), and the arrow between steps gives that population's event
  count and percentage of its parent. The last card shows the chosen population's own plot if it has
  one, otherwise its count and percentage of all events.
- **Tree** shows every plot in the gating tree, branching where a population has several child gates;
  populations without gates of their own appear as labelled chips. Gates on the way to the chosen
  population are highlighted.
- **Plot size** sets the size of the plots in each layout (kept separately); the path wraps as many
  steps per row as fit.
- **Backgating** overlays the chosen population's events, in its colour, on every plot above it, with
  the plotted population greyed out. On histograms the overlay is drawn in the same units as the
  histogram (so its area is the fraction of the plotted population it represents).

If a step's gate was drawn on axes other than the population's saved plot, the step is drawn on the
gate's own channels using the group's default axes. Click a plot title to open that population in the
Gate view.
