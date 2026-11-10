# Repository file-placement guide

Use [the architecture overview](../docs/ARCHITECTURE_OVERVIEW.md) to identify which product area owns a change, and [Contributing](../CONTRIBUTING.md) for the change and review workflow.

## Common locations

| Work area | Location |
| --- | --- |
| Main web app | `frontend/src/` |
| Windows desktop launcher | `desktop/` |
| Project Atlas source | `pyscriptcli/project-atlas`; Mosaic copy is `project-atlas/` |
| Mosaic database schema | `supabase/` |
| Atlas database schema | `project-atlas/database/` |
| Shared plans and operating notes | `docs/` |
| Repository workflows | `.github/` |

For the web app, follow the existing Next.js structure: routes and API handlers are under `frontend/src/app/`; feature UI belongs under `frontend/src/components/<feature>/`; shared integrations and business logic belong under `frontend/src/lib/`. Keep feature-specific files close to their feature, and follow nearby conventions before adding a new folder.

When navigation or setup changes, update the nearest existing README and the root [repository map](../README.md#repository-map). Do not create a second handoff or status log; use [handoff.md](../handoff.md) under its existing workflow.
