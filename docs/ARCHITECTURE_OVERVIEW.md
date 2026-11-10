# Architecture overview

Mosaic is maintained in one repository with separate web, desktop, map-workspace, database, and documentation areas. Each area has its own runtime and setup instructions; the root [README](../README.md) is the contributor entry point.

## Main web app

`frontend/` contains the Next.js app, its API routes, shared client/server libraries, and app-level tests. The browser UI and API routes are deployed together as the hosted Mosaic workspace. API routes call the configured integrations and storage services; they are not a separate backend project. See [frontend setup and integration notes](../frontend/README.md) and the maintained [handoff](../handoff.md) for current product boundaries and implementation details.

## Desktop launcher

`desktop/` is an Electron Windows launcher around the hosted Mosaic website. It adds desktop window, tray, reminder, and update behavior; the hosted web app remains the source of workspace pages, permissions, authentication, APIs, and data. The [desktop README](../desktop/README.md) describes packaging and release checks. Its GitHub Actions release workflow is separate from routine repository checks.

## Project Atlas

`project-atlas/` contains the checked-in copy of two web workspaces (Atlas and Kopi Saigon), Python spatial services, and database migrations. The canonical source is [`pyscriptcli/project-atlas`](https://github.com/pyscriptcli/project-atlas). The [snapshot sync workflow](../.github/workflows/project-atlas-sync.yml) copies that repository into this tree and writes the source commit to `project-atlas-sync.json`; make source changes upstream and sync them here. See the [Atlas README](../project-atlas/README.md) and [sync guide](project-atlas-sync.md).

## Database and external services

`supabase/` holds SQL used by the Mosaic web app. `project-atlas/database/` holds SQL for the Atlas snapshot. These files describe database structures and policies; editing or syncing them does not apply them to a live database. The target project, deployment configuration, and migration state must be checked separately before application.

The web app also connects to external services such as ClickUp and AI/transcription providers. Per-user access, server-side credentials, and feature-specific setup are documented in [frontend/README.md](../frontend/README.md) and [handoff.md](../handoff.md). Treat environment configuration and live service state as deployment-specific.

## Repository guidance and workflow

- [CONTRIBUTING.md](../CONTRIBUTING.md) describes how to locate an area, make a focused change, run checks, and prepare review.
- [AGENTS.md](../AGENTS.md) points AI coding agents to shared guidance; tool-specific files should stay short and link back to it.
- [agents/INDEX.md](../agents/INDEX.md) is the repository file-placement guide.
- [handoff.md](../handoff.md) is the existing rolling handoff. It carries product context and next steps; this overview does not replace it.
- [Repository checks](../.github/workflows/repository-checks.yml) run frontend lint/tests/type-check/build, build the Atlas snapshot, and syntax-check selected desktop scripts on pull requests to `main` and pushes to `main`.
- [docs/](.) contains plans, requirements, and operational notes. Check each document's date and status before treating it as current; prefer current code, setup guides, and explicit handoff notes for shipped behavior.
- [docs/decisions/README.md](decisions/README.md) explains when and how to record durable decisions.
