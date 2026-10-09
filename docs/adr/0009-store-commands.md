# ADR-0009 Store commands and explicit side effects

**Status.** Proposed.

**Decision.** The workspace has one zustand store with patch-based undo. Every change to the workspace
goes through a named command in `apps/web/src/state/commands/`, which calls `mutate` or `mutateGroup`.
Components call commands; they do not write to `ws` inline. A command does what its name says and no
more. Effects that follow from a change, such as carrying a grid cell's style to its siblings or recording
navigation history, are called by name from the command that needs them; they do not run implicitly
inside `mutate` or in store subscriptions. UI preferences (open tabs, sections, panel sizes) are read and
written through `state/prefs.ts` only.

**Why.** Hidden effects make a small edit change behaviour elsewhere, which neither a reviewer nor an
agent can see from the diff. Named commands give one place to find, test and undo every operation on a
workspace.
