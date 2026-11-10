# Mosaic

Mosaic is a multi-application repository. The main web app, Windows desktop launcher, and Project Atlas snapshot have separate package manifests and lockfiles; install dependencies in the project you are working on.

## Repository map

| Path | Purpose | Source of truth |
|---|---|---|
| `frontend/` | Main Next.js web app, API routes, and app-level tests | This repository |
| `desktop/` | Electron launcher for the hosted Mosaic app | This repository |
| `project-atlas/` | Checked-in snapshot of the Atlas workspaces | [`pyscriptcli/project-atlas`](https://github.com/pyscriptcli/project-atlas) |
| `supabase/` | SQL schema, policies, and database setup scripts | This repository; apply intentionally to the target project |
| `docs/` and `handoff.md` | Architecture, operating notes, and dated implementation history | This repository; check each document's date and status before treating it as current |
| `.agents/` | Repository-specific agent skills and assets | This repository |
| `output/`, `outputs/` | Retained, reviewed deliverables and data | Keep existing tracked files; review new files before committing |

Do not edit `project-atlas/` as the source copy. The Atlas repository is canonical; the snapshot sync workflow refreshes this copy and records the upstream commit in `project-atlas-sync.json`.

## Working in this repository

- Start with [Contributing](CONTRIBUTING.md) for a simple change workflow and review checklist.
- See the [architecture overview](docs/ARCHITECTURE_OVERVIEW.md) to understand how the repository areas fit together.
- Use [AGENTS.md](AGENTS.md) for shared agent instructions and [agents/INDEX.md](agents/INDEX.md) to locate the right area.
- The [handoff](handoff.md) is the rolling project handoff. Update it only when a handoff is explicitly requested, following its two-entry workflow.
- Durable repository decisions and the evidence behind them are recorded under [docs/decisions](docs/decisions/README.md).

## Requirements

- Node.js 22 (22.12 or newer) and npm.
- Git for source control.
- App-specific environment variables for integrations. Keep secrets in ignored local environment files or the deployment secret store; see [`frontend/README.md`](frontend/README.md) and [`desktop/README.md`](desktop/README.md). Never commit credential values.

## Main web app

```powershell
cd frontend
npm ci
npm run dev
```

The local app starts at `http://localhost:3000`. Useful checks and build commands:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

The build and development scripts prepare a dependency link for the Atlas snapshot. They expect the main frontend dependencies to be installed first.

## Project Atlas snapshot

```powershell
cd project-atlas
npm ci
npm run dev
```

`npm run build` builds both Atlas workspaces. `npm run build:atlas` and `npm run build:kopi-viewer` build them individually. Local development and sync details are in [`docs/project-atlas-sync.md`](docs/project-atlas-sync.md).

## Windows desktop launcher

```powershell
cd desktop
npm ci
npm start
```

The signed Windows release workflow requires the signing secrets described in [`desktop/README.md`](desktop/README.md). Do not run release or publishing scripts for routine web changes.

## Database changes

SQL files in `supabase/` define database setup and migrations. Review the target project, SQL effects, and recovery plan before applying them; repository sync and web builds do not apply SQL automatically.

## Repository checks

Pull requests targeting `main` run the repository checks in `.github/workflows/repository-checks.yml`. The workflow validates the frontend, builds the Atlas snapshot, and syntax-checks desktop scripts. The desktop release workflow remains a separate publishing process.

## Artifact handling

The current meeting export under `output/meeting-export-redesign/` and `outputs/updated-8-TAs.geojson` are intentionally retained as tracked files. Existing build outputs such as `frontend/.next/` and `desktop/dist/` are generated and should not be committed. Place disposable generated files under `output/generated/` or `outputs/generated/`; those paths are ignored. Review any new deliverable or dataset before deciding to version it.
