# Mosaic Helper

Mosaic Helper runs the Property Decks file work on this Windows computer. Keep it running while using the hosted Property Decks page.

## Start it

From the repository's `frontend` folder, run:

```powershell
npm run mosaic-helper
```

Or double-click `scripts/Start-Mosaic-Helper.cmd`.

The helper listens only on `127.0.0.1:43127`. It accepts browser requests from `https://mosaic-workspace.online` only. It indexes the selected local folder, copies the selected slides into a PPTX, uses installed Microsoft PowerPoint to make the PDF, and serves the generated files back to the browser.

The browser may ask whether Mosaic can access the local network. Allow it so the hosted page can reach the helper. If it was denied, change the site permission in the browser and reload Property Decks.

The helper requires Node.js and the dependencies installed for this repository. A standalone Windows installer can package the same helper after this first version is validated.

## Development site

For a local Mosaic page, set `MOSAIC_HELPER_ALLOWED_ORIGIN` to that page's exact origin before starting the helper, for example:

```powershell
$env:MOSAIC_HELPER_ALLOWED_ORIGIN = "http://localhost:3000"
npm run mosaic-helper
```

The helper's allowed origin is exact. Do not set it to `*`.
