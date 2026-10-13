# Project Atlas snapshot sync

Project Atlas is maintained in `pyscriptcli/project-atlas`. Mosaic stores the latest copied repository tree in the root `project-atlas/` directory and records its source commit in `project-atlas-sync.json`.

The Mosaic sidebar's **Tools → Maps** page opens the Project Atlas workspace in an embedded view. Use **Fill screen** to give the map the full display area, or **Open in new tab** to use Atlas outside the Mosaic shell. Project-specific **Map** tabs continue to use Atlas's embedded editing protocol with the project's saved GeoJSON.

Set `NEXT_PUBLIC_ATLAS_APP_URL` to override the Atlas workspace URL. Local development defaults to `http://localhost:3200`; production defaults to `https://project-atlas-next.vercel.app`.

## Sync flow

1. An authenticated Mosaic admin starts a sync from Forms & System Administration → Project Atlas.
2. The server verifies the ClickUp account against the Mosaic owner/admin list and dispatches `.github/workflows/project-atlas-sync.yml` on Mosaic `main`.
3. GitHub Actions checks out both repositories, replaces only the `project-atlas/` snapshot, updates the source commit marker, and commits the changes to Mosaic `main` when the snapshot changed.
4. The admin screen polls the workflow run and links to its GitHub Actions log.

The sync runs in GitHub Actions because Vercel functions have a read-only deployment filesystem. The Atlas copy in Mosaic is a checked-in snapshot; Project Atlas on GitHub remains the source of truth.

## Required deployment secret

Add `PROJECT_ATLAS_SYNC_TOKEN` to the Mosaic Vercel Production (and Preview, if needed) environment. Use a fine-grained token restricted to `pyscriptcli/mosaic` with **Actions: write** permission. Store it as a server-only variable; do not use a `NEXT_PUBLIC_` name. The token is used by the admin API to dispatch the workflow and read its run status. GitHub Actions uses its repository-scoped `GITHUB_TOKEN` with `contents: write` to commit the snapshot.

The admin action reports a configuration message until the token is present in the active deployment.

## References

- [Vercel Function runtimes](https://vercel.com/docs/functions/runtimes) documents the read-only deployed filesystem and writable temporary storage.
- [GitHub REST API: workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) documents the required `workflow_dispatch` trigger and Actions: write token permission.
- [GitHub Actions security hardening](https://docs.github.com/en/actions/reference/security/secure-use) recommends pinning actions to full-length commit SHAs; the sync workflow pins `actions/checkout` accordingly.
- [Project Atlas source repository](https://github.com/pyscriptcli/project-atlas) is the canonical source for the snapshot.
