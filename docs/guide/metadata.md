# Sample variables and plate maps

Sample variables describe the experimental design: **numeric** variables (dose, time, concentration) and
**categorical** ones (replicate, condition, cell line). They are defined once per workspace and every
sample has its own value. The statistics table, its exports and the Charts tab use them to group, normalize
and plot. Open the **Metadata** tab to edit them.

## Adding variables

Click **+ Numeric** or **+ Categorical**, then the ✎ on the variable to rename it, give it a unit, change
its type or set the display order of its categories (used by tables, grouping and charts). Changing a
variable from categorical to numeric clears values that are not numbers; undo restores them.

## The table

One row per sample of the current group, with its **well** and one column per variable. Type a value and
press Enter (or ↓) to move down.

To work on many cells at once, **drag across them** (or click one and shift-click another) to select a
block, then:

- **paste** a single value to fill every selected cell, or a block copied from a spreadsheet — it is
  repeated across the selection when the selection is a whole multiple of it (paste two rows into eight
  to repeat them four times), and otherwise placed at the selection's top-left corner;
- **⌘C / Ctrl+C** to copy the block (tab-separated, ready for a spreadsheet);
- **Delete** to clear it.

Pasting a copied block into a single cell fills the cells down and to the right of it. Values that do not
fit a numeric (or Well) column are skipped and reported; every paste is one undo step.

## The plate map

For 96-well plate experiments, **Plate map** shows the group's samples in their wells. Wells come from the
cytometer's `$WELLID` (or `WELL ID`) keyword, otherwise from a single well-like token in the file name
(`Specimen_001_B07_019.fcs` → B07). Use **Detect wells** for samples loaded before this was available, or
type the well in the table.

- **Select wells:** click, drag a rectangle, shift/⌘-click to add, or click a row letter or column
  number (the corner selects all).
- **Set a value:** pick the variable in the variable bar, type a value (or click an existing category)
  and press **Set**. **Clear** removes the value.
- **Fill a series (numeric variables):** start value and a factor (× 0.5 for a 2-fold dilution) or step
  (+ 10), along columns or rows. Each selected column (or row) gets the next value; **Reverse** runs the
  series from the right (or bottom).

Wells are colored by the selected variable: categorical values use the categorical palette (see the
legend), numbers a viridis ramp, logarithmic when the values are positive and span 100-fold or more.

## Importing from CSV or Excel

**Import…** reads `.csv`, `.tsv`, `.xlsx`, `.xls` and `.ods` files in the browser (nothing is uploaded).
Two layouts are understood:

**One row per sample.** A header row, then one row per sample. Choose the column that identifies the
sample and what it holds — file name, file name without extension, the sample's display name, or the
well — Flowmeris suggests the column and kind that match the most samples and shows how many matched.
Every other column becomes a new variable (type guessed from its values) or fills an existing one.

| well | dose | condition | replicate |
|---|---|---|---|
| A1 | 0.1 | control | r1 |
| A2 | 1 | control | r1 |

**Plate layout.** One 8 × 12 block per variable, as plate readers and plate-map templates write them: a
header row 1…12, row labels A…H, and the variable's name in the corner cell (or the cell above it).
Values are assigned to samples by well.

Choose **Match samples in: all groups** to assign values across groups (for example when the sheet lists
the files of several folders).

**Export CSV** writes the samples with their wells and variables — a template to fill in and import back.
