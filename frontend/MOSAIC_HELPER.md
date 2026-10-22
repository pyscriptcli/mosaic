# Mosaic Helper

Mosaic Helper runs the Property Decks file work on this Windows computer. Install it once; it then starts hidden when you sign in and stays available to the hosted Property Decks page.

## Start it

Double-click `scripts/Start-Mosaic-Helper.cmd` once. This registers a per-user Windows logon task and starts the helper in the background. It does not require administrator access.

To install from PowerShell instead, run `scripts/Install-Mosaic-Helper.ps1` from the `frontend` folder. To remove the startup task and stop the helper, run `scripts/Uninstall-Mosaic-Helper.ps1`.

For manual foreground operation, run:

```powershell
npm run mosaic-helper
```

The helper listens only on `127.0.0.1:43127`. It accepts browser requests from `https://mosaic-workspace.online` only. It uses installed Microsoft PowerPoint to copy the selected slides into a validated PPTX, make the PDF, and serve both files back to the browser.

Logs are stored in `%LOCALAPPDATA%\Mosaic\Helper`. The startup task checks for the helper every 15 seconds and restarts it if it exits.

The browser may ask whether Mosaic can access the local network. Allow it so the hosted page can reach the helper. If it was denied, change the site permission in the browser and reload Property Decks.

The helper requires Node.js and the dependencies installed for this repository. A standalone Windows installer can package the same helper after this first version is validated.

To verify PPTX and PDF export on a Windows computer with PowerPoint installed, run this from the `frontend` folder:

```powershell
$env:MOSAIC_TEST_POWERPOINT = "1"
npm run test:helper:powerpoint
```

## Development site

For a local Mosaic page, set `MOSAIC_HELPER_ALLOWED_ORIGIN` to that page's exact origin before starting the helper, for example:

```powershell
$env:MOSAIC_HELPER_ALLOWED_ORIGIN = "http://localhost:3000"
npm run mosaic-helper
```

The helper's allowed origin is exact. Do not set it to `*`.
