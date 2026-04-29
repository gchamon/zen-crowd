# Subtabs in Subfolders

## Status

Planned

## Outcome

Tabs opened from an existing tab are grouped under that originating tab
as a subfolder in the Zen Browser sidebar, and clicking the subfolder
header activates the original (parent) tab — preserving parent/child
browsing context across a session.

## Work items

_None yet — to be added as the epic is broken down._

## Decision Changes

None yet.

## Main Quests

- Capture parent/child relationships when a new tab is opened from an
  existing tab (e.g. middle-click, target=_blank, context-menu open)
- Represent the parent tab as a subfolder containing its child tabs in
  the sidebar
- Wire the subfolder header click to activate the originating parent tab
- Handle lifecycle edge cases: parent close, child promotion, session
  restore, drag/drop reordering

## Acceptance Criteria

- Opening a tab from another tab places the new tab inside a subfolder
  associated with the originating tab
- Clicking the subfolder header focuses the original parent tab rather
  than toggling collapse alone (or the interaction is clearly defined
  and consistent)
- Parent/child grouping survives session restore
- Closing the parent tab has a defined, non-destructive behavior for
  child tabs
- Behavior coexists with nested folder colorization without visual or
  functional conflicts

## Metadata

### id

subtabs-in-subfolders

### child_ids

-

### priority

normal
