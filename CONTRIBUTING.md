# Contributing

This guide is for anyone making a change, whether you are describing a problem, editing documentation, or changing code. You do not need to understand the whole repository before starting.

## Find the right area

Start at the [repository map](README.md#repository-map). The [architecture overview](docs/ARCHITECTURE_OVERVIEW.md) explains how those parts connect. If a change crosses areas or its owner is unclear, ask the maintainer before moving files or changing shared behavior.

Use the setup instructions closest to the work:

- Main web app: [frontend/README.md](frontend/README.md)
- Windows launcher: [desktop/README.md](desktop/README.md)
- Project Atlas: [project-atlas/README.md](project-atlas/README.md) and [snapshot sync](docs/project-atlas-sync.md)
- Database schemas: review the relevant SQL in `supabase/` or `project-atlas/database/`; do not apply it to a live project as part of an ordinary code change.

## Make a focused change

1. Check the current branch and `git status` so you know which edits already exist. Preserve work that is not part of your task.
2. Keep the change within its owning area. Avoid unrelated cleanup, moving files, or changing generated snapshots by hand.
3. For Project Atlas, make source changes in `pyscriptcli/project-atlas`; this repository's `project-atlas/` directory is a generated snapshot. Follow [the sync guide](docs/project-atlas-sync.md).
4. Keep secrets, local environment files, and personal data out of Git. Review new files under `output/` and `outputs/` before including them.
5. Update the nearest existing guide when the change alters setup, behavior, or how contributors find the feature. Use [handoff.md](handoff.md) only for an explicitly requested rolling handoff; its instructions define the format and rotation.

## Run relevant checks

Use the commands documented for the project area you changed. For the main web app, the available lint, test, type-check, and build commands are listed in the [root README](README.md#main-web-app). Atlas and desktop setup/build instructions are in their linked READMEs above. Pull requests to `main` also run [repository checks](.github/workflows/repository-checks.yml); they do not replace feature-specific review.

Do not run a release, deploy, apply a database migration, or publish an artifact as part of routine contribution work. Those actions need separate authorization and the project's release instructions.

## Prepare a review

Before requesting review:

- Explain the user-visible change and why it is needed in a few sentences.
- List the main files or areas changed.
- State which checks you ran and include their results. Mark checks you did not run.
- Call out migration, configuration, compatibility, or release steps that a reviewer should know about.
- Review `git diff` and `git status` to ensure only intended changes are included; run `git diff --check` for whitespace errors.

Do not commit or push unless the maintainer explicitly asks for it.
