# Docs Workspace

This workspace contains the reusable methodology scaffold for Orisun and the
reference material needed to found new repositories.

## Core Areas

- [work-items](work-items/README.md):
  executable units of work and seed artifacts
- [epics](epics/README.md):
  larger planning streams spanning multiple work items
- [architecture decisions](architecture/decisions/README.md):
  durable methodology and repository decisions
- [agents](agents/README.md):
  agent inputs, operating rules, and supporting brief documentation

The repo-root [../keystone.md](../keystone.md) is the seedling's heart-level
brief contract and sits above the supporting material in `docs/agents/`.

## Optional Material

Tutorials and examples support adoption, but they are not methodology core
unless a work item explicitly promotes them.

## Vocabulary

Orisun keeps GitLab-first planning terminology in the methodology core:

- `epics` group related work items
- `work items` are the executable planning units
- quest language remains valid inside work items when it helps structure
  execution

Provider-specific publication or hosting steps can still vary by target
repository without changing this planning vocabulary.
