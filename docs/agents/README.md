# Agents

This directory contains reusable agent inputs and conventions for founding new
repositories from Orisun.

## Methodology Core

- [../../keystone.md](../../keystone.md):
  canonical brief contract for agent-ingest bootstrap, anchored at the
  seedling's heart
- [generic-agent-brief-example.md](generic-agent-brief-example.md):
  example source brief using the same contract

## Operating Rule

Agent-ingest bootstrap should read the repo-root `keystone.md` brief and
produce the same initial methodology scaffold as the repository-template path,
starting with `docs/work-items/genesis.md`.

The generated scaffold should preserve GitLab-first planning vocabulary even
when the founded repository later publishes through another Git provider.
