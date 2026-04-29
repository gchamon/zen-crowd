# Nested Folder Colorization

## Status

Planned

## Outcome

Zen Browser's sidebar conveys folder nesting depth at a glance through
distinct background colors on subfolders, so users can visually separate
nested folder hierarchies without reading labels.

## Work items

- [nested-folder-colorization-01-feasibility-spike](/docs/work-items/nested-folder-colorization-01-feasibility-spike.md)
- [nested-folder-colorization-02-implementation](/docs/work-items/nested-folder-colorization-02-implementation.md)
- [nested-folder-colorization-03-packaging](/docs/work-items/nested-folder-colorization-03-packaging.md)

## Decision Changes

Work item `-01` confirmed a stylesheet-only approach using descendant
selectors on `zen-folder` (background tint, `light-dark()` palette).
Hover-expand auto-behavior was scoped into work item `-02` based on
decisions recorded during the spike.

## Main Quests

- Determine the sidebar DOM surface and styling hooks exposed by Zen
  Browser / zen-sidebery-mod for folder rows
- Define a depth-to-color scheme that remains legible in light and dark
  themes
- Implement background colorization driven by folder depth
- Validate visual separation against representative folder trees

## Acceptance Criteria

- Subfolders render with a background color that differs from their
  parent folder
- Color treatment respects the active Zen Browser theme (light/dark)
- Colorization applies recursively to arbitrary nesting depth without
  visual regressions on flat (non-nested) folders
- No measurable interaction lag introduced on the sidebar

## Metadata

### id

nested-folder-colorization

### child_ids

- nested-folder-colorization-01
- nested-folder-colorization-02
- nested-folder-colorization-03

### priority

normal
