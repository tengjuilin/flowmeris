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
