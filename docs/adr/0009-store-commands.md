# ADR-0009 Store commands and explicit side effects

**Status.** Accepted.

**Decision.** The workspace has one zustand store with patch-based undo. Every change to the workspace
goes through a named command in `apps/web/src/state/commands/`, which calls `mutate` or `mutateGroup`.
Components call commands; they do not write to `ws` inline. A command does what its name says and no
more. Effects that follow from a change are explicit: rules that must hold after any edit (carrying a grid
plot's settings to the other grid plots) are listed in `AFTER_EDIT` next to `mutate`, and the store
action that switches the view records the Back/Forward history. Nothing runs from store subscriptions.
UI preferences (open tabs, sections, panel sizes) are read and written through `state/prefs.ts` only.

Settings panels still edit some plot and ridge settings with inline `mutate` calls; these move to
commands as the components are split into feature folders.

**Why.** Hidden effects make a small edit change behaviour elsewhere, which neither a reviewer nor an
agent can see from the diff. Named commands give one place to find, test and undo every operation on a
workspace.
