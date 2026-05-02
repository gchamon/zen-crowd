# Subtab Grouping — Implementation

## Status

doing

## Outcome

A self-contained mod source file under `src/` that, when loaded in
chrome scope, makes Zen Browser tint opener-related tabs by opener
depth while keeping Zen's default tab placement. The mod replaces a
prior injection cleanly when re-run, with no leaked listeners,
duplicated DOM, stale wrappers, or stale `zen-crowd-depth`
attributes.

This work item is blocked by `-01`: the spike's confirmed event
choice, opener-resolution mechanism, placement primitive, persistence
key, and lifecycle rules are inputs here. Do not begin until `-01`
is `done`.

## Decision Changes

Carried forward from `-01`:

- **Tab-open event**: `TabOpen` on `gBrowser.tabContainer`, opener
  resolved via `tab.openerTab` first and a captured
  `addTab`/`addTrustedTab` owner hint second, routing deferred one
  tick.
- **Placement feature dropped**: no custom placement rule. Firefox
  / Zen's default placement is acceptable.
- **Depth tagging**: `zen-crowd-depth` attribute on `<tab>`.
- **Persistence**: `SessionStore.setCustomTabValue` under keys
  `zenCrowdTabUuid` and `zenCrowdParentTabUuid`. The older
  `zenCrowdParentTabId` runtime-id value is migrated only when the
  old parent tab still exists in the current session.
- **Restore fallback**: after session restore is ready, rebuild from
  tab custom values first; if they are absent, restore tab UUIDs and
  parent UUIDs from `zen.crowd.subtab.restoreSnapshot` when the
  saved tab order still matches the restored window.
- **Parent-close lifecycle**: promote children to roots, retag
  subtrees.
- **Context menu actions**: add explicit right-click actions for
  native Zen folder copying and tree closing. "Convert tab to folder"
  creates URL copies for the clicked tab plus all saved descendants,
  then groups the copies. "Create folder for subtabs" copies only
  saved descendants. "Convert folder to tabs" copies a native folder's
  contents back out as regular tabs. Originals stay in place.
- **Left-line accent**: cycles palette at every depth (no depth-7
  cap).

New decisions for the implementation:

- **Pref namespace**: `zen.crowd.subtab.*`. Master switch
  `enabled` (bool, default true). Top-level tabs are never tinted;
  opener children start at depth 1. Visual prefs (`colorSource`,
  `customBaseColor`, `customColors`, `colorTreatment`,
  `tintOpacityLight`, `tintOpacityDark`, `borderRadius`) are strings
  whose default is `""` meaning "inherit from
  `zen.crowd.folder.<sameKey>`". Non-empty values override.
- **`colorTreatment` gains `"both"`** (background + left-line),
  added symmetrically to the folder mod so inheritance is a no-op
  for users who only configured the folder mod.
- **Shared library**: helpers extracted to
  `src/lib/zen-crowd-shared.sys.mjs`, deployed to
  `chrome/utils/zen-crowd-shared.sys.mjs`, imported via
  `ChromeUtils.importESModule("chrome://userchromejs/content/zen-crowd-shared.sys.mjs")`.
  The colorization mod is refactored in this work item to consume
  the shared module — same behavior, code moved out of the file.

## Main Quests

- Land the mod as one source file under `src/`, alongside the
  colorization mod. The file should be loadable two ways: pasted
  into the Browser Console for development, and picked up by
  fx-autoconfig once packaged.
- Reuse the established generic patterns from
  `src/nested-folder-colorization.js`:
  - `(() => { ... })()` IIFE with stable `GLOBAL_KEY` and
    `STYLE_ID`, idempotent across re-runs (prior `destroy()` runs
    before re-init)
  - window enumeration plus an `nsIWindowMediatorListener` for
    windows opened later
  - `<style>` injection via `doc.documentElement.appendChild` with a
    stable id, replaced cleanly on re-paste
  - per-window state in a `WeakMap` so multi-window usage doesn't
    cross-talk
- Subscribe to `TabOpen` on `gBrowser.tabContainer`. On each event,
  resolve the opener (per `-01`'s decision), record the parent→child
  link in the in-memory map, persist via
  `SessionStore.setCustomTabValue`, and apply the depth attribute.
- Delay the first hierarchy rebuild until `SessionStore`/Zen restore
  promises settle. Before that point, attach styles and listeners but
  do not assign replacement UUIDs to restored tabs.
- Wrap `gBrowser.addTab` and `gBrowser.addTrustedTab` per window to
  capture explicit `ownerTab` and `relatedToCurrent` opener hints
  before `TabOpen` fires. Do not guess with bare `selectedTab` when
  no opener or owner hint exists.
- Subscribe to `TabClose`. On parent close, promote children to
  roots: drop their parent link, clear their persisted parent UUID,
  and retag their subtrees at the new shallower depths.
- On script load (and on each window attach), rebuild the in-memory
  parent map from `SessionStore.getCustomTabValue` over
  `gBrowser.tabs`, assign missing/duplicate tab UUIDs, drop invalid
  links whose parent tab no longer exists or would create a cycle,
  and apply depth attributes once.
- Maintain a compact restore snapshot pref after opener-link changes,
  parent promotion, root tab opens, tab closes, tab moves, and
  successful rebuilds. The snapshot records tab UUID, parent UUID,
  URL, pinned state, and workspace id by tab order.
- On user drag reorder, make moved root tabs inherit the hierarchy
  level of the first valid non-moved tab immediately below the moved
  block after drop. If that reference tab is top-level, or no valid
  reference exists, promote the moved root to top-level. Preserve any
  descendants under the moved root and retag its subtree.
- Inject idempotent context-menu items for: "Convert tab to folder",
  "Create folder for subtabs", "Convert folder to tabs", and "Close
  tab and subtabs". Folder actions create URL-copy tabs before calling
  Zen's native `gZenFolders.createFolder`. Root folders are created
  without `insertAfter`, so Zen places them in its native folder area;
  nested subtab folders use `insertAfter` only against copied tabs that
  already live inside a native folder. Original tabs and native folders
  are not moved or removed.
- Inject the depth-tinting CSS: full background tint and/or left-line
  accent per depth (cycling palette, `light-dark()`, translucent).
  Same palette as `src/nested-folder-colorization.js` so the two mods
  compose.
- Coexist with the colorization mod:
  - a subtab that sits inside a `zen-folder` should still receive
    its opener-depth tint legibly on top of the folder tint
  - if combined opacity makes either signal illegible, lower one of
    the tint percentages (record the resolution in Decision Changes)
- Surface a small set of prefs under `zen.crowd.subtab.*` if the
  spike concluded any of the visual or behavioral choices needed
  user control (e.g. enable/disable left-line accent, tint opacity).
  Mirror the pref-observer pattern from the colorization mod.
- If drag-and-drop reordering, keyboard navigation, or multi-window
  tab tearing surface their own UX threads during implementation,
  split them into a follow-up work item rather than blocking this
  one.

## Acceptance Criteria

- Opening a tab from another tab (middle-click, `target=_blank`,
  context-menu "Open Link in New Tab", `window.open`) records the
  opener relationship and applies depth tinting in every existing and
  newly opened browser window.
- Each opener child carries a depth attribute reflecting its position
  in the opener tree, starting at depth 1. Top-level tabs carry no
  depth attribute and are not tinted.
- Re-running the script in the same session does not produce
  duplicate listeners, duplicate `<style>` elements, or stale depth
  attributes.
- Session restore reconstructs the parent map and depth tinting
  with no manual action.
- Closing a parent tab leaves children intact; their depth tinting
  updates to reflect the new tree shape.
- Subtabs render correctly under the colorization mod with no
  visual conflicts; both signals remain legible.
- The file imports nothing Sidebery-specific and does not reach
  into any extension's internals.
- Existing tabs are never moved into the pinned region or into a
  `zen-folder` by this mod. Native folder context-menu actions operate
  on URL-copy tabs.

## Packaging

Packaging reuses the fx-autoconfig pipeline established by
[nested-folder-colorization-03-packaging](/docs/work-items/nested-folder-colorization-03-packaging.md).
The source file produced here drops into that build alongside
`nested-folder-colorization`. No dedicated packaging work item is
needed for this epic; if the build needs a pure-additive change to
include this file, do it as part of this work item.

## Metadata

### id

subtab-grouping-02

### type

Issue
