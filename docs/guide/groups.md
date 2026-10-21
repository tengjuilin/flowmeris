# Groups and per-sample overrides

A **group** is a set of samples that share one analysis: compensation setting, gating tree, plots and
statistics. Adding a folder creates one group per folder. Samples whose channel lists (`$PnN`) differ are
put in a separate group ("channel set 2"), because a shared gating tree requires the same channels.

Every gate you draw belongs to the group **template** and applies to all of its samples. When one sample
needs a different gate position (instrument drift, a shifted population):

1. select the sample in the sidebar;
2. switch the plot toolbar from **Edit template** to **This sample only**;
3. move or reshape the gate.

The edit is stored as an **override** for that sample only. Overrides are visible everywhere:

- sample list and statistics table: *override* badge;
- population tree: *ov* badge;
- plots and tiles: dashed orange gate;
- exports: `gate_overridden_on_path` and `overridden_gate_ids` columns; per-sample Gating-ML files.

In the inspector, **Revert to template** removes the override and **Make this the template** promotes it.
Adding or deleting gates always changes the whole group's tree; overrides change geometry only.

## Sample names and selection

The sidebar, tiles, ridge plot and statistics table show **short sample names**: the file name with its
extension, any repeat of the folder name, and any prefix or suffix shared by every file in the group
removed (trimmed at `_`, `-`, `.` or space boundaries only, so `exp1_2024_A01_stained.fcs` in folder `exp1` shows as `A01`).
If trimming would make two names identical, the full names are kept. Hover a name for its full path; CSV
and Gating-ML exports always use the full file name.

The checkbox next to each sample (with *all* / *none* above the list) chooses which samples appear in the
**Tiles**, **Ridge** and **Statistics** views. Statistics CSV exports contain the checked samples only.
The selection is part of the view, not the analysis: it is not saved in the workspace and does not change
gates or overrides.

In **Tiles**, the plot type and X / Y channels can be changed directly; they are the same settings as in
the Gate view for the current population.

**Tiles by channel.** *Samples* | *Channels* in the Tiles toolbar switches between the plot for every
checked sample and one sample's plot over its channels. In *Channels* mode:

- the sample is picked in the toolbar (◀ ▶ step through the group), or with a sample tile's **Channels**
  button;
- *X fixed* / *Y fixed* chooses the axis every tile keeps; the other axis goes through the channels. A
  histogram keeps no axis: there is one histogram per channel;
- the **Channels** menu checks which channels get a tile (the fixed axis's channel never does). The
  choice lasts until the page is reloaded;
- each tile's varied axis has the group's default scale for its channel (the Tiles plot's own scale and
  range on the channel it is set to). Clicking the fixed axis's title changes its channel for every tile;
- click a tile to select it, then draw and edit gates on it as in the Gate view: a gate drawn there is
  on that tile's two channels;
- **Gate** opens the tile in the Gate view (the population's saved plot on those channels, if there is
  one), **Plot** adds it to the Plot view, and **Samples** puts its channel on the Tiles plot and goes back
  to tiling the samples.
