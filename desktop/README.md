# Mosaic desktop launcher

This Windows app opens the deployed Mosaic site in a signed-in desktop window. It uses the existing hosted pages, APIs, permissions, and per-user OAuth flow. The app needs an internet connection for workspace features.

## Build a Windows installer

Use Node.js 22.12 or newer and npm on Windows x64. The package defaults to Mosaic's verified Vercel project domain, `https://mosaic-workspace.online`. Set `MOSAIC_APP_URL` explicitly when packaging for a different environment. The packaging step rejects HTTP URLs, paths, credentials, queries, and fragments. Do not use a preview URL or local development server for a shared release.

```powershell
cd desktop
npm ci
npm run dist:win
```

If the production domain changes, set `$env:MOSAIC_APP_URL` to the new HTTPS origin before packaging.

The installer and checksum are written to `desktop/dist/`. The installer is an unsigned pilot build unless a publisher certificate is configured in the release environment. Do not put signing passwords or tokens in source control. Code-sign the app and installer before broad distribution.

Vercel currently reports the `mosaic-workspace.online` A record as needing a change and recommends `76.76.21.21`; the domain uses Spaceship nameservers. Confirm the public DNS record resolves to the Vercel target before distributing this installer. The old `project-echo-next.vercel.app` alias no longer resolves to a deployment.

For local development, install dependencies and set `MOSAIC_APP_URL` to a controlled HTTPS test deployment before `npm start`.

## Desktop behavior

- Closing the window hides Mosaic in the system tray. Use **Open Mosaic** to restore it.
- **Start with Windows** is off by default and can be enabled from the tray menu. Startup begins hidden.
- **Quit Mosaic** asks before closing the desktop process because open changes or active recording may be interrupted.
- Sign-in stays in an app-specific persistent session. Each person signs in with their own hosted account.
- Mosaic asks before granting microphone or camera access. Reset that permission from the tray menu. Screen and window capture use a per-request native selection; system audio needs separate approval each time.
- Updates to the web app arrive from the hosted site. Desktop shell updates use a new installer; automatic desktop updates are not configured for this pilot.
- My Day reminders use a separate always-on-top desktop window. The alert stays open until dismissed or snoozed; task titles are kept in memory and are not written to desktop settings.
- Tray residency does not run a Windows service or promise background meeting capture.

Task edits, status changes, priority changes, and deletions in the Tasks page appear from the local per-user cache first. A per-user outbox sends those writes through the signed-in web session and retries after connectivity returns. The hosted app remains the source of truth; new task creation still waits for its request to finish.

## Release checks

1. Build from a clean Windows x64 checkout with the production origin supplied by the deployment owner.
2. Inspect the generated installer for the app origin and confirm it contains no keys, local profiles, or credentials.
3. Install on a clean Windows computer; sign in, restart, log out, switch accounts, restore from tray, and quit.
4. Verify an unrelated HTTPS navigation opens in the system browser and the desktop session cannot navigate to arbitrary local files or custom protocols.
5. Verify restricted Mosaic pages remain restricted and browser Studio recording behavior before making any background capture claim.
6. Create `SHA256SUMS.txt` after the final installer build and distribute it with the installer.

The first shared build requires the confirmed production HTTPS origin and a Windows packaging environment. Broad distribution also requires the publisher's signing certificate and agreed hosting for the installer.
