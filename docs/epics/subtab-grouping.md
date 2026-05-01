# Subtab Grouping

## Status

Planned

## Outcome

Tabs opened from a parent tab are visually grouped under that parent
in the Zen Browser sidebar — without using `zen-folder`. The mod does
two things:

1. **Opener relationship tracking.** When a tab is opened from a parent
   (middle-click, `target=_blank`, context-menu "Open Link in New
   Tab", `window.open`), the parent-child link is recorded while Zen
   keeps its default tab placement. Opener detection uses
   `tab.openerTab` plus explicit `addTab`/`addTrustedTab` ownership
   hints.
2. **Depth tinting.** Each tab carries a depth attribute reflecting
   its position in the opener tree. CSS paints a per-depth background
   tint and/or left-line accent cycling through a six-color palette.
   Treatment mirrors the nested-folder colorization mod so the two
   compose visually.

The relationship survives session restore via per-tab
`SessionStore.setCustomTabValue` values: each tab gets
`zenCrowdTabUuid`, and children store `zenCrowdParentTabUuid`.
When restored tab custom values are unavailable at startup, the mod
falls back to `zen.crowd.subtab.restoreSnapshot`, a conservative
tab-order snapshot.

## Background

The original `subtabs-in-subfolders` epic pursued a "folder-tab" — a
single sidebar element that was both a `zen-tab` and a `zen-folder`.
Source review (`zen-browser-desktop/src/zen/folders/ZenFolder.mjs`,
`ZenFolders.mjs`) showed that `gZenFolders.createFolder` pins all
tabs it groups into the pinned region (`ZenFolders.mjs:627`), which
broke the desired UX: forming a folder-tab would yank the parent and
its children out of the regular tabs region. Reusing folders had
been attractive primarily because the depth-coloring story was
already solved for them. Since the depth coloring is cheap to
re-derive against `<tab>` directly, the folder-tab framing was
dropped. See `docs/epics/subtabs-in-subfolders.md` (cancelled) for
the historical context.

## Work items

- [subtab-grouping-01-feasibility-spike](/docs/work-items/subtab-grouping-01-feasibility-spike.md)
- [subtab-grouping-02-implementation](/docs/work-items/subtab-grouping-02-implementation.md)

Packaging reuses the fx-autoconfig pipeline established by
`nested-folder-colorization-03`. No dedicated `-03` work item is
required for this epic; the implementation file produced by `-02`
drops into the existing build alongside `nested-folder-colorization`.

## Decision Changes

None yet — the spike will record them.

## Main Quests

- Capture parent/child relationships for all four open mechanisms
  (middle-click, `target=_blank`, context-menu "Open Link in New
  Tab", `window.open`)
- Keep Zen's default tab placement; this mod only tracks opener
  relationships and visual depth
- Tag opener children with a depth attribute and apply a per-depth
  tint via CSS, full background and/or left-line accent
- Persist the parent→child relationship across session restore so
  tinting reconstructs without manual action
- Define a non-destructive lifecycle when the parent tab closes:
  children become roots, their subtrees retag at the new shallower
  depths
- Coexist visually with the nested-folder colorization mod so a tab
  inside a colored folder still receives its opener-depth tint
  legibly

## Acceptance Criteria

- Opening a tab from another tab records the opener relationship,
  regardless of which tab is currently active
- Subtab depth is visible at a glance via background tint and
  (where applicable) left-line accent
- Parent/child grouping survives session restore
- Closing a parent tab leaves children intact; their depth tinting
  updates to reflect the new tree shape
- No measurable interaction lag on tab open, close, or activate
- No use of `zen-folder` for grouping; tabs remain in the regular
  tabs region

## Metadata

### id

subtab-grouping

### child_ids

- subtab-grouping-01
- subtab-grouping-02

### priority

normal
