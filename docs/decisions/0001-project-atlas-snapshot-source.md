# 0001 — Project Atlas snapshot source

- **Status:** Accepted
- **Date:** Not recorded

## Context and evidence

Mosaic contains a copy of Project Atlas under `project-atlas/`. The [sync guide](../project-atlas-sync.md) identifies `pyscriptcli/project-atlas` as the maintained source repository. The [sync workflow](../../.github/workflows/project-atlas-sync.yml) checks out that repository, replaces the local snapshot, and records the upstream commit in `project-atlas-sync.json`.

## Decision

Make Project Atlas source changes in `pyscriptcli/project-atlas`. Treat Mosaic's `project-atlas/` directory as a synchronized snapshot, not the canonical source tree.

## Rationale

The repository documents the source-of-truth boundary and implements synchronization from that upstream repository. Why the project was originally split this way is **not documented**.

## Consequences

Changes made only inside Mosaic's snapshot may be replaced by the next sync. Follow the [snapshot sync guide](../project-atlas-sync.md) to update the copy after upstream work.
