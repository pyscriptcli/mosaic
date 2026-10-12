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

The installer and checksum are written to `desktop/dist/`. Local builds are unsigned unless a publisher certificate is configured. Do not put signing passwords or tokens in source control.

Vercel currently reports the `mosaic-workspace.online` A record as needing a change and recommends `76.76.21.21`; the domain uses Spaceship nameservers. Confirm the public DNS record resolves to the Vercel target before distributing this installer. The old `project-echo-next.vercel.app` alias no longer resolves to a deployment.

For local development, install dependencies and set `MOSAIC_APP_URL` to a controlled HTTPS test deployment before `npm start`.

## Desktop behavior

- Closing the window hides Mosaic in the system tray. Use **Open Mosaic** to restore it.
- **Start with Windows** is off by default and can be enabled from the tray menu. Startup begins hidden.
- **Quit Mosaic** asks before closing the desktop process because open changes or active recording may be interrupted.
- Sign-in stays in an app-specific persistent session. Each person signs in with their own hosted account.
- Mosaic asks before granting microphone or camera access. Reset that permission from the tray menu. Screen and window capture use a per-request native selection; system audio needs separate approval each time.
- Web app changes appear through the hosted site. Packaged desktop builds check GitHub Releases at launch and every six hours, download signed Windows updates in the background, then ask before restarting to install. The tray menu also has **Check for desktop updates** and shows update status.
- Every push to `main` that changes `desktop/` triggers the Windows release workflow. It publishes a signed release after the signing secrets are configured. Web-only pushes do not create installer releases because the desktop window loads the live hosted site.
- The release workflow needs `MOSAIC_WINDOWS_SIGNING_CERTIFICATE` (a base64 encoded or file-backed Windows signing certificate) and `MOSAIC_WINDOWS_SIGNING_PASSWORD` in GitHub Actions secrets. It verifies the downloaded installer publisher before installing an update. The public GitHub repository hosts the signed installer and electron-builder update metadata; `SHA256SUMS.txt` is attached to each release.
- My Day accepts typed HH/MM/SS values. The desktop timer runs in the tray and opens a centered, always-on-top alert on the monitor where the pointer is when it fires, even when another app is in front. The alert stays open until dismissed or snoozed; task titles are kept in memory and are not written to desktop settings.
- Tray residency does not run a Windows service or promise background meeting capture.

Task edits, status changes, priority changes, and deletions in the Tasks page appear from the local per-user cache first. A per-user outbox sends those writes through the signed-in web session and retries after connectivity returns. The hosted app remains the source of truth; new task creation still waits for its request to finish.

## Release checks

1. Build from a clean Windows x64 checkout with the production origin supplied by the deployment owner.
2. Inspect the generated installer for the app origin and confirm it contains no keys, local profiles, or credentials.
3. Install on a clean Windows computer; sign in, restart, log out, switch accounts, restore from tray, and quit.
4. Verify an unrelated HTTPS navigation opens in the system browser and the desktop session cannot navigate to arbitrary local files or custom protocols.
5. Verify restricted Mosaic pages remain restricted and browser Studio recording behavior before making any background capture claim.
6. Verify that releases from `main` contain the NSIS installer, update metadata, blockmap, and `SHA256SUMS.txt`, and that an installed copy downloads and applies a signed update only after the user chooses to restart.

The first shared build requires the confirmed production HTTPS origin and a Windows packaging environment. Automatic releases require the publisher's Windows signing certificate and password as GitHub Actions secrets. The existing unsigned pilot must be replaced with an installer built with the updater before automatic updates can work.
