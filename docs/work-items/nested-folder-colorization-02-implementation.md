# Nested Folder Colorization — Implementation

## Status

doing

## Outcome

A self-contained mod source file in this repository that, when loaded in
chrome scope, injects the depth-based stylesheet from work item `-01`
into every Zen Browser window — including windows opened later in the
session — and replaces a prior injection cleanly when re-run, with no
stacked or leaked `<style>` nodes. The mod also provides hover-expand
behavior: hovering a collapsed folder expands it; leaving collapses it
unless the folder contains the active tab or was manually expanded by
the user.

This work item is blocked by `-01`: the spike's selector strategy and
palette are inputs here.

## Decision Changes

Work item `-01` settled the following — no further investigation needed:

- **Selector strategy**: pure CSS descendant selectors anchored to
  `#tabbrowser-tabs`, up to six depth levels cycling at depth 7+. No JS
  depth-tagging required.
- **Colorization target**: `background-color` on `zen-folder` itself
  (the background-tint variant), *not* the three icon custom properties
  (`--zen-folder-behind-bgcolor`, `--zen-folder-front-bgcolor`,
  `--zen-folder-stroke`). The background covers the entire folder region
  including child tabs and nested folders.
- **Translucency**: tint via `color-mix(in srgb, <color> 18–22%, transparent)`
  so Zen's hover and selected states remain visible through the overlay.
- **Theming**: each palette step is a `light-dark(<lightHex>, <darkHex>)`
  value; a single override rule handles both themes. No parallel
  stylesheet needed.
- **Hover-expand semantics**: auto-expand on `mouseenter` of a
  collapsed folder. Auto-expanded folders are tagged with the
  `zen-crowd-hover-expanded` class and rendered at reduced opacity to
  signal their tentative state. Collapse is driven by a single
  `mouseleave` on `#tabbrowser-tabs`: when the pointer leaves the
  sidebar, every folder still bearing the marker class is collapsed.
  A folder is pinned open if it contains the active tab (no marker
  added on hover) or if the user clicks anywhere inside it while it
  is auto-expanded (the click clears the marker). Mechanism is
  JS-driven (toggling Zen's `collapsed` attribute); CSS-only `:hover`
  is insufficient as it does not change Zen's internal state. Per-
  folder mouseleave timers are deliberately avoided: collapsing one
  folder reflows the sidebar and can yank a still-hovered sibling out
  from under the cursor, cascading into spurious collapses.

## Main Quests

- Write the mod as one source file under a new top-level `src/`
  directory. The file should be loadable two ways: pasted into the
  Browser Console for development, and picked up by fx-autoconfig in
  work item `-03`.
- Reuse only the generic patterns from `zen-sidebery-mod`:
  - window enumeration plus a window-open listener, modeled on
    `zen-sidebery-mod/zen-sidebery-integration.mjs:473-495`
  - the `<style>` injection helper from
    `zen-sidebery-mod/zen-sidebery-integration.mjs:114-122`
  Do not copy any Sidebery-specific code (extension policy lookup, CSP
  modification, XUL `<browser>` creation).
- Tag the injected `<style>` element with a stable id (for example
  `zen-crowd-folder-colorization`) and remove any prior element with
  that id before injecting, so re-running the script in a single
  session is idempotent. This addresses the missing-teardown gap in
  `zen-sidebery-mod`.
- Apply the stylesheet to every existing browser window on load and to
  every newly opened browser window via the window-open listener.
- Honor light/dark themes through `light-dark()`, matching what the
  spike validated.
- Implement hover-expand behavior:
  - On `mouseenter` of a collapsed `zen-folder`, expand it and tag it
    with the `zen-crowd-hover-expanded` class (skip the tag when the
    folder contains the active tab — that folder is implicitly pinned).
  - Auto-expanded folders are rendered at reduced opacity so the user
    can tell at a glance they will collapse on sidebar-leave.
  - Attach a single `mouseleave` to `#tabbrowser-tabs`. When the
    pointer truly leaves the sidebar (relatedTarget not inside the
    container), collapse every folder still tagged with the marker
    class and clear the tag.
  - On click anywhere inside an auto-expanded folder, drop the marker
    class — the click promotes the folder to user-pinned and it will
    survive subsequent sidebar-leaves.
  - Use a `MutationObserver` on `#tabbrowser-tabs` to attach handlers
    to folders created after script load, so the behavior works on
    newly opened windows and dynamically added folders.
  - If hover-expand grows its own UX surface (drag-and-drop edge cases,
    keyboard nav) during implementation, split it into a new work item
    `-04` rather than blocking colorization.

## Acceptance Criteria

- A single source file under `src/` colorizes nested folders by depth
  when loaded in chrome scope, on a Zen profile with at least four
  levels of nesting.
- Pasting the script twice in the same session does not produce
  duplicate `<style>` elements; the second run replaces the first.
- Opening a new browser window after the script has run shows the
  colorization without manual re-paste.
- No measurable interaction lag on folder collapse, expand, drag, or
  selection compared to the unmodded baseline.
- The file imports nothing Sidebery-specific and does not reach into
  any extension's internals.
- Hovering a collapsed folder expands it and renders it at reduced
  opacity to signal its tentative state.
- Auto-expanded folders stay open as long as the pointer is anywhere
  inside `#tabbrowser-tabs`; they collapse only when the pointer
  leaves the sidebar.
- A folder containing the active tab is never auto-collapsed and is
  never rendered at reduced opacity, even when first opened by hover.
- Clicking anywhere inside an auto-expanded folder removes its faded
  look and pins it open across subsequent sidebar-leaves.
- Moving the mouse between sibling sub-folders does not cause any
  folder to collapse.
- Folders created after script load receive the hover-expand behavior.

## Metadata

### id

nested-folder-colorization-02

### type

Issue
