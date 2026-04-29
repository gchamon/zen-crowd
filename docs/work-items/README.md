# Work Items

Work items define executable changes and preserve the reasoning needed to make
those changes durable.

## Required Seed Artifact

Every target repository founded from Orisun must begin with a local
`docs/work-items/genesis.md`. That file must identify Orisun as the
methodology origin and record which bootstrap path produced the repository.
`genesis.md` is foundational and is not part of the tracked work-item set used
for stable GitLab synchronization.

## Standard Shape

Each work item should use:

- `Status`
- `Outcome`
- `Decision Changes`
- `Main Quests`
- `Acceptance Criteria`

## Naming

Work item filenames should follow:

`{epic-name}-{work-item-number}-{work-item-name}.md`

Use lowercase kebab-case for the epic and work item names. Use a zero-padded
sequence such as `01` for the work item number.

Example:

- `bootstrap-foundation-01-docs-baseline.md`

## Metadata

Work items may include a `## Metadata` section when they need to override
defaults or preserve important planning attributes.

- `id` is required for tracked work items and must remain stable across renames
  and moves
- `type` defaults to `Issue` when omitted
- supported explicit values are `Issue`, `OKR`, and `Test case`
- each metadata key should be a `###` heading under `## Metadata`

Example:

```md
## Metadata

### id

bootstrap-foundation-01

### type

OKR
```

## Style

The work-item should tell a story. Each section should introduce the user to
the concepts required and use technical prose to instruct the user. The only
exception is in tasks, which will be either in the format of simple lists, or
subsections if these tasks information need to have more structure.

## GitLab Mapping

Orisun keeps GitLab-first planning vocabulary as the default methodology
glossary mapping:

- work items correspond to GitLab work items
- main quests and side-quests correspond to GitLab tasks
- `OKR` corresponds to GitLab OKRs
- `Test case` corresponds to GitLab test cases

Epic membership is declared from the epic side through `child_ids`; work items
do not carry a separate parent-epic metadata field.

Target repositories may adapt provider workflows later without renaming the
planning model.

## Status Convention

If a work item includes `## Status`, use short prose values such as:

- `backlog`
- `planned`
- `doing`
- `done`
- `cancelled`: the work item no longer makes sense because priority or focus
  changed
- `abandoned`: the work item still makes sense, but the repository will not
  spend resources on it

`killed` is reserved for GitLab graveyard history when a managed work item is
removed from the repository. Do not write `killed` in repo work-item markdown.

If status is omitted, treat the work item as `backlog`.

## Migration

Older repositories founded before stable IDs were introduced should add a
stable `id` to each tracked work item. Keep the ID stable even if the file is
renamed or moved. The foundational `genesis.md` file remains exempt.

## Example

See [generic-work-item-example.md](generic-work-item-example.md)
for a reusable pattern with the standard section shape.
