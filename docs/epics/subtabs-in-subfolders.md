# Subtabs in Subfolders

## Status

cancelled — superseded by [subtab-grouping](/docs/epics/subtab-grouping.md).

The folder-tab approach this epic pursued required forming a
`zen-folder` per parent. Source review and a draft PoC showed
`gZenFolders.createFolder` pins all involved tabs into the pinned
region, which broke the desired UX. The replacement epic preserves
the underlying intent (visual grouping of opener-related tabs that
survives navigation and session restore) without using
`zen-folder` at all.

## Outcome

Tabs opened from an existing tab are grouped under that originating tab
as a subfolder in the Zen Browser sidebar, with the parent rendered as
a hybrid **folder-tab** element: a single sidebar row that behaves as a
tab when activated (clicking it focuses the originating page) and as a
folder when it comes to containing children (expand/collapse, drop
target, persistence). This preserves parent/child browsing context
across a session without forcing the user to choose between "the tab I
opened from" and "the folder grouping its children."

## Work items

- ~~[subtabs-in-subfolders-01-feasibility-spike](/docs/work-items/subtabs-in-subfolders-01-feasibility-spike.md)~~ (cancelled)
- ~~subtabs-in-subfolders-02-implementation~~ (deleted)
- ~~subtabs-in-subfolders-03-packaging~~ (deleted)

## Decision Changes

None yet.

## Main Quests

- Validate whether Zen Browser's sidebar can host a single element that
  carries both `zen-tab` and `zen-folder` semantics — i.e. a click on
  the header both activates an associated tab and toggles the
  expand/collapse of its children — without fighting Zen's internal
  state machine
- Capture parent/child relationships when a new tab is opened from an
  existing tab (middle-click, `target=_blank`, context-menu "open in
  new tab", `window.open`)
- Render the parent tab as a folder-tab containing its child tabs in
  the sidebar
- Wire the folder-tab header so clicking activates the parent tab and
  the disclosure affordance (or a defined gesture) toggles
  expand/collapse independently
- Handle lifecycle edge cases: parent close, child promotion to
  top-level, session restore, drag/drop reordering, and coexistence
  with manually-created folders
- Ship the mod through the same fx-autoconfig channel established by
  the colorization epic

## Acceptance Criteria

- Opening a tab from another tab places the new tab inside a
  folder-tab associated with the originating tab
- Clicking the folder-tab header focuses the original parent tab; the
  expand/collapse affordance is reachable via a clearly defined and
  consistent interaction that does not conflict with tab activation
- Parent/child grouping survives session restore and new-window
  creation within the same session
- Closing the parent tab has a defined, non-destructive behavior for
  child tabs (e.g. promoted to siblings of the former folder-tab, or
  re-parented to the next surviving ancestor) — exact rule decided in
  the spike
- Behavior coexists with nested folder colorization without visual or
  functional conflicts, and folder-tabs participate in the depth-based
  colorization on equal footing with native folders
- No measurable interaction lag introduced on tab activation, folder
  expand/collapse, or sidebar scroll

## Metadata

### id

subtabs-in-subfolders

### child_ids

- subtabs-in-subfolders-01
- subtabs-in-subfolders-02
- subtabs-in-subfolders-03

### priority

normal
