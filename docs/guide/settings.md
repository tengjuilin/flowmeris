# App settings

The gear at the right of the header opens **Settings**: the default appearance of new figures, and the
hotkeys. Beside it, the GitHub mark opens the project's source code, and **?** these docs.

Settings are kept in this browser (its local storage) and used by every workspace; workspace files do
not carry them. To use them in another browser or on another computer, export them to a file and import
it there.

## Default appearance

The **Plots**, **Ridges** and **Charts** tabs list the default settings of the figures of the Gate, Plot
grid, Tiles and Gating path views, of the Ridge view, and of the Charts view: fonts and text sizes, colors,
line widths, point and marker sizes, histogram bins, smoothing, the legend and more. Plots have two sets of
text sizes: the Gate view's, and smaller ones for the Plot grid and Tiles.

- A change applies at once. New figures start from it, and the **Reset** buttons of the settings panels
  go back to it.
- In the open workspace, each figure that still has the old default takes the new one. A figure on which
  you set that setting to something else keeps its own. This restyling is one step in the undo history.
  Workspaces opened later keep the settings they were saved with.
- ↺ next to a setting puts it back on its factory default; **Reset … to factory defaults** does so for the
  whole tab. A color shown as *Theme color* follows the light or dark theme.

## Hotkeys

The **Hotkeys** tab lists every keyboard shortcut, by where it acts: general (undo, redo, Back, Forward),
the gate drawing tools, the Plot grid, a selected gate, and a polygon being drawn. Click **Change**, then
press the new key or combination; **Reset** restores the default keys and **Clear** removes them.

- A key used by another action that can act at the same time moves to the one you changed, and a note
  says so. The Plot grid, a selected gate and a polygon being drawn may share keys (Delete, Backspace,
  Escape by default), because only one of them takes a key at a time.
- Shift with a nudge key moves the selected gate 10 px instead of 1 px.
- Ctrl on Windows and Linux is ⌘ on a Mac: hotkeys, and settings files, work on both.
- Tab always moves the focus, and cannot be set. Hotkeys do not act while you type in a field.

## Import and export

**Export settings…** downloads `flowmeris-settings.json`, with the settings you changed from the factory
ones. **Import settings…** replaces every setting with those of a file; settings it does not know (from a
newer version, say) are left out, and the message says how many. **Reset all settings** returns every
default and hotkey to its factory value.
