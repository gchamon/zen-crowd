# Epics

Epics group related work items when the scope is larger than a single
execution pass.

Use an epic when you need to coordinate:

- multiple work items against one outcome
- staged extraction from source material
- cross-cutting methodology changes

Epics should summarize intent and point to the active work items rather than
repeat their full detail.

Use a `## Work items` section to link the active child work items with
repository-root-relative Markdown paths such as
`/docs/work-items/example-work-item.md`.

## Standard Shape

Each epic should use:

- `Status`
- `Outcome`
- `Work items`
- `Decision Changes`
- `Main Quests`
- `Acceptance Criteria`
- `Metadata`

## Metadata

Epics may include a `## Metadata` section when they need to override planning
defaults.

- `id` is required and must remain stable across renames and moves
- `child_ids` is required and should list the stable IDs of tracked work items
- `priority` defaults to `normal`
- supported explicit values are `critical`, `high`, and `normal`
- each metadata key should be a `###` heading under `## Metadata`

GitLab sync treats `child_ids` as the source of truth for epic membership.
When native group epics are unavailable, personal-namespace sync falls back
to proxy epic issues and links each child work item to that proxy with a
managed `relates_to` issue link.

Example:

```md
## Work items

- [bootstrap-foundation-01-docs-baseline](/docs/work-items/bootstrap-foundation-01-docs-baseline.md)
- [bootstrap-foundation-02-bootstrap-follow-through](/docs/work-items/bootstrap-foundation-02-bootstrap-follow-through.md)

## Metadata

### id

bootstrap-foundation

### child_ids

- bootstrap-foundation-01
- bootstrap-foundation-02

### priority

critical
```

## Status Convention

Epics should use short prose values such as:

- `Planned`
- `Doing`
- `Done`

## Example

See [generic-epic-example.md](generic-epic-example.md) for the default epic
structure.

## Migration

Older repositories founded before stable IDs were introduced should add a
stable `id` to each epic and a `child_ids` list for the tracked work items
that epic owns. Keep those IDs stable even if files are renamed or moved.

## Critical Chain

Work items linked to epics with priority `critical` are on the project's
critical chain by default. Epics with priority `high` are important, but do
not automatically place every linked work item on the critical chain.
