# Mosaic desktop launcher implementation plan

Date: 2026-10-12
Status: Desktop launcher source and Windows packaging implemented. `desktop/dist/Mosaic-Setup-0.2.0-x64.exe` opens the live Mosaic origin and includes tray lifecycle support plus a native always-on-top reminder window. The web Tasks page uses its owner-scoped IndexedDB cache first and queues task updates/deletes for background sync through the signed-in session. The installer is unsigned; clean-machine OAuth, tray behavior, and capture still need validation.

## 1. Intended outcome

Deliver a shareable **Mosaic Windows installer** that opens the existing hosted Mosaic web app in a dedicated desktop window and can remain running in the background.

The hosted web app remains the product: its pages, permissions, authentication, APIs, and data stay in the current deployment. The desktop package adds operating-system integration around that app. It does not bundle a second Next.js server, copy the business logic, or create a separate database.

Planned release artifact: `Mosaic-Setup-<version>-x64.exe`.

The installer should work on another supported Windows computer without Node.js, Git, a source checkout, or developer setup. Users install it, open Mosaic, and sign in with their own account.

## 2. Working assumptions

- First release targets Windows 11 x64. Confirm the actual company device inventory before fixing the supported OS matrix. ARM64 and macOS require separate builds and validation.
- “Launcher” means a desktop window containing the live web app, with native background support. Opening an ordinary browser tab alone would not provide the requested desktop lifecycle.
- Internet access is required for normal workspace operations. The Tasks page can reopen cached work and queue edits/deletes while offline, but this is not a fully offline app.
- Background operation includes tray residency and user-configured task reminders. Unattended business automation and native meeting capture are separate capabilities.
- The production HTTPS origin, publisher identity, signing method, and release hosting destination must be confirmed before distribution. A URL appearing as an example in repository documentation is not sufficient release configuration.

The installer uses `https://mosaic-workspace.online`, which is attached and verified on the Mosaic Vercel project. Override it at build time with `MOSAIC_APP_URL` if the production domain changes.

## 3. Repository foundation

The application lives in `frontend/`. The current authentication routes establish per-user HTTP-only cookies through the hosted OAuth callback. Server-side permission checks and per-user connections remain authoritative.

Relevant existing owners:

| Concern | Existing source |
| --- | --- |
| Product, auth, access, and deployment boundaries | `handoff.md` |
| Sign-in and callback | `frontend/src/app/api/auth/login/route.ts`, `frontend/src/app/api/auth/callback/route.ts` |
| Signed-in identity | `frontend/src/app/api/auth/me/route.ts` |
| Browser cache ownership and cleanup | `frontend/src/lib/browserPageCache.ts` |
| Studio workspace and capture lifecycle | `frontend/src/components/StudioPanel.tsx`, `frontend/src/hooks/useStudioRecorder.ts` |
| Recorder companion proposal | `docs/ECHO_RECORDER_IMPLEMENTATION_PLAN.md` |

The recorder plan describes future companion behavior; it is not proof that a native recorder is already implemented. This desktop plan must not silently turn that proposal into a launch requirement.

## 4. Recommended architecture

Use **Electron with a small CommonJS main/preload**, packaged with **electron-builder and an NSIS installer**. It supports a dedicated web window, a tray process, native integration, and Windows packaging in the repository's JavaScript/TypeScript ecosystem. Accept the additional runtime size and memory overhead; measure them during the first pilot.

Tauri remains an alternative if installer size becomes a decisive constraint. Avoid building both frameworks. A browser-installed PWA alone does not provide the same control over desktop process lifecycle.

```text
Mosaic installer
    |
    v
Desktop main process
    |-- window / single-instance / tray / startup preferences
    |-- update checks / lifecycle / safe external-link handling
    |-- small, validated native command interface
    |
    v
Sandboxed web view ---> Mosaic production HTTPS origin
                           |-- existing sign-in and session
                           |-- existing pages and APIs
                           |-- existing server permission checks
```

Use a sandboxed `BrowserWindow` for remote content. Keep the host minimal and expose only validated reminder scheduling through preload IPC. Preserve the web app's layout and Mosaic branding.

Place desktop source in a separate `desktop/` package so it cannot accidentally become a runtime dependency of the deployed Next.js app. Proposed files:

```text
desktop/
  package.json
  electron-builder.yml
  src/main.ts
  src/window.ts
  src/tray.ts
  src/session.ts
  src/navigation.ts
  src/preload.ts
  src/ipc.ts
  src/updates.ts
  src/settings.ts
  assets/
  tests/
```

Exact file boundaries can stay small until implementation needs justify extraction. Run web npm commands from `frontend/`; desktop commands from `desktop/`.

## 5. First-release behavior

| Action | Planned behavior |
| --- | --- |
| Install | Per-user install, branded shortcut, Add/Remove Programs entry, uninstaller |
| Open | Load the configured production site; show a local retry screen if unavailable |
| Sign in | Use the existing per-user hosted OAuth flow in the desktop session |
| Minimize | Minimize to the taskbar normally |
| Close window | Hide to tray; explain this on first use with a concise notice |
| Tray → Open Mosaic | Restore and focus the same window |
| Tray → Settings | Open the small desktop settings surface |
| Tray → Quit Mosaic | Exit the process, subject to an explicit active-work safeguard |
| Open a second instance | Focus the existing process instead of duplicating it |
| Start with Windows | Optional user preference, off by default |
| Startup launch | Start in tray when enabled, without stealing focus |
| Network loss | Explain connection state and offer Retry; preserve recoverable work |
| My Day reminder | Let the user choose HH/MM/SS; show a topmost alert that stays until snoozed or dismissed |
| Web deployment | Load updated hosted functionality without rebuilding the installer |
| Native shell update | Install a separately versioned desktop release through the chosen release channel |

The process runs in the signed-in Windows user's session. It is not an always-on Windows service. It cannot work while the computer is powered off, and sleep, sign-out, shutdown, and explicit Quit interrupt operation.

## 6. Background work contract

The main process owns durable desktop lifecycle decisions. Do not rely on hidden-page timers as the sole mechanism for important work, and do not globally disable renderer throttling merely to keep Mosaic “alive.”

The desktop reminder timer is managed by the main process after the signed-in web app supplies the user's interval and current task titles. Task titles stay in memory and are not written to desktop settings. Tasks page updates and deletes use a per-user local outbox and sync through existing authenticated API routes; no shared token or privileged ClickUp connection is introduced.

Notifications triggered by external workspace events still require an authorized event source and deduplication. Do not poll every page or call privileged APIs through a shared token. A notification click must recheck access before opening its target, and lock-screen text should avoid sensitive content by default.

Measure background CPU, memory, network traffic, and wakeups in a signed-in idle session. Stop unnecessary work when signed out or disconnected; use bounded backoff rather than constant retries. Establish numeric resource budgets from the prototype before pilot acceptance.

Sleep/resume handling must detect interrupted work, revalidate the session, and reconnect deliberately. Never claim uninterrupted capture across sleep. A future capture feature may request temporary sleep prevention during an explicit recording, with clear status and release of the request when recording stops.

## 7. Authentication and remote-content boundary

First prove the existing hosted OAuth flow works inside a constrained desktop sign-in window sharing the app's persistent session partition. Allow only the exact required provider navigation and the configured hosted callback. Provider pages receive no Mosaic native bridge.

Persist the desktop session in an app-specific Electron profile, subject to existing server cookie expiry. A browser login does not automatically sign in the desktop app, and vice versa. Protect the local profile with normal OS user access controls; verify storage protections rather than claiming cookies are inherently encrypted everywhere.

If the provider disallows embedded sign-in, use the system browser only after designing a server-issued, short-lived, one-time desktop handoff bound to the initiating app attempt. Do not copy browser cookies or put OAuth access tokens in URLs. That alternative changes authentication architecture and requires its own threat review and `handoff.md` update before implementation.

Required controls:

- Keep `nodeIntegration` disabled, `contextIsolation` enabled, renderer sandboxing enabled, and web security enabled.
- Load only the approved HTTPS app origin in the workspace view. Match parsed origins exactly, not substrings or hostname suffix guesses.
- Deny permissions by default; grant supported permissions only to the expected origin after the relevant user action. Handle permission checks as well as permission requests.
- Validate IPC sender, top-level frame, current origin, payload schema, and action. Expose named operations only; never expose raw IPC, shell execution, arbitrary paths, or unrestricted file APIs.
- Handle popups and external URLs explicitly. Permit safe schemes and destinations; block arbitrary local-file and custom-protocol execution. An OAuth allowlist must not become a general native-capability allowlist.
- Keep OAuth secrets, service keys, and model credentials on the hosted server. No `.env.local`, personal API token, or developer session enters the installer.
- Preserve page permissions, per-user data access, and the assistant's read-only boundary. Desktop presence grants no extra business permissions.
- Reuse hosted logout and account-change behavior. Stop account-scoped desktop activity and clear desktop-owned user state; verify the existing browser cache cleanup also works inside Electron.
- Use explicit save dialogs for downloads and exports; validate print, PDF, Word, Excel, external links, and file picker behavior in the desktop view.

These controls follow the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## 8. Meeting capture: a separate phase

The first installer is a launcher with background lifecycle support. Electron asks before microphone/camera access, offers a source choice for each screen/window capture request, and asks separately before capturing system audio. Verify these paths in a signed-in meeting before advertising background recording. Quit warns before closing work that may still be open.

Later, if native capture is selected, use `docs/ECHO_RECORDER_IMPLEMENTATION_PLAN.md` as the recording source of truth. That plan requires browser live transcription stability before companion transport work starts.

The desktop process can eventually host the companion adapter rather than shipping another tray app. Preserve Studio controls, local recovery chunks, user ownership, ordered transcription, retry semantics, and the existing Notetaker handoff. Capture must continue independently of remote-page reloads before it is advertised as reliable background capture.

Do not install a localhost control server or register a custom protocol in the first release without a demonstrated requirement. Companion pairing, durable native queues, and local recording retention require a separate implementation slice and permission tests.

## 9. Installer and release delivery

Use a full NSIS installer containing the desktop runtime; an internet connection is still needed to load Mosaic. Prefer a per-user installation with no administrator requirement where the target environment permits it. Establish a stable application ID, publisher name, and profile location before the first pilot so upgrades preserve installs and sessions.

Expected delivery bundle:

- `Mosaic-Setup-<version>-x64.exe` — the file users share and install.
- `SHA256SUMS.txt` — integrity checksum for the installer.
- Release notes with version, supported systems, install/uninstall steps, and known limitations.
- Update metadata and any required companion artifacts when automatic updates are enabled.

Build on a Windows runner with pinned runtime/package versions and a lockfile. Keep signing credentials in the release secret store. Sign the application and installer for broad distribution, and verify signatures on a clean machine. Signing identifies the publisher; it does not guarantee that Windows reputation prompts disappear immediately.

Choose an HTTPS update feed accessible to installed users. Do not embed a repository access token in the client to download private releases. Keep update signature verification enabled and configure manifest signing according to the pinned builder version. NSIS packaging and update requirements are documented by [electron-builder](https://www.electron.build/docs/win/) and its [auto-update guide](https://www.electron.build/docs/features/auto-update/).

Check for updates on a bounded schedule, download safely, and offer restart when idle. Never restart during recording, an export, or other reported critical work. Coordinate the updater with an explicit active-work signal; do not infer safety merely because the window is hidden. If that signal is unavailable, require a user-initiated restart.

Web releases and desktop releases have separate versions. Introduce a small capability/version handshake only when the web app uses native APIs; unsupported capabilities must degrade safely for browsers and older installers. Recovery should support a verified replacement installer without erasing user recovery data.

## 10. Implementation sequence

### Phase 1 — Prove the launcher and sign-in

1. Confirm production origin, target Windows versions, publisher, and branding assets.
2. Create the isolated desktop package and minimal secure window.
3. Prove real per-user OAuth, persistent login, logout, and account switching.
4. Validate primary pages, permissions, navigation, downloads, and exports.
5. Measure startup time, installer size, and idle resources.

Exit: a local prototype opens the live site safely and an authorized pilot user can complete normal work. Embedded OAuth failure is a blocker to the current auth design, not a reason to introduce a shared-token fallback.

### Phase 2 — Add desktop lifecycle

1. Add single-instance behavior, tray menu, restore, close-to-tray, and Quit.
2. Add opt-in Windows startup and start-in-tray behavior.
3. Add connection failure/retry and sleep/resume recovery.
4. Define active-work reporting and hide/quit safeguards.

Exit: the app stays resident after window close, restores the same session, exits fully on Quit, and respects startup preferences.

### Phase 3 — Package and pilot

1. Configure the stable app identity, per-user NSIS target, icons, and uninstaller.
2. Add reproducible Windows builds, signing, checksums, and release notes.
3. Install on clean supported computers and verify upgrades and uninstall.
4. Deliver the pilot installer through the agreed sharing destination.

Exit: another user can install and use Mosaic without development tools; no credentials or local development URLs are bundled.

### Phase 4 — Maintain the release

1. Configure and test the selected update feed and signature checks.
2. Validate update deferral during active work and failure recovery.
3. Finalize resource budgets, support logs, and compatibility policy.
4. Update `handoff.md` with shipped desktop behavior and release requirements.

Exit: release and update behavior are repeatable and documented. A pilot can use manual installer updates until automatic updates pass these checks; the distribution notes must state which mode is supported.

Notifications triggered by external workspace events and native capture remain later slices with their own acceptance conditions.

## 11. Verification and acceptance

| Area | Required evidence |
| --- | --- |
| Installability | Clean supported Windows VM installs, launches, upgrades, and uninstalls without developer tools |
| Identity | Correct Mosaic app name, supplied icon, publisher metadata, shortcuts, and installer branding |
| Authentication | Two separate accounts, expired session, denied sign-in, logout, restart persistence, and account switching |
| Authorization | Restricted pages remain blocked; cache and native features cannot bypass server checks |
| Tray lifecycle | Close/restore, second launch, explicit Quit, startup opt-in/out, and restart behavior |
| Background limits | Measured idle CPU/memory/network; no unbounded polling; sleep/resume and network loss handled |
| Remote security | Unapproved navigation, popups, permissions, malformed IPC, subframe IPC, and unsafe URLs rejected |
| Workspace compatibility | Main pages, file uploads, downloads, printing, exports, and external links work |
| Recording compatibility | Current Studio behavior tested; continuity claims restricted to measured results |
| Updates | Valid update succeeds; invalid signature fails; unavailable feed is recoverable; active work defers restart |
| Packaging hygiene | Installer contains no secrets, personal data, developer profiles, or localhost defaults |

Use targeted desktop unit/integration tests for lifecycle, origin validation, IPC, and update state. Use real Windows installation and authenticated end-to-end checks for behaviors that mocks cannot prove. Run appropriate frontend checks only when frontend integration changes are made.

The initial delivery is complete when a shareable installer opens the hosted Mosaic app, authenticates each user separately, remains available in the tray, handles explicit Quit and optional startup correctly, and passes clean-machine verification. Background capture is not part of that completion claim unless its separate phase is implemented and proven.

## 12. Inputs needed before broad release

Before broad release: confirm the production URL and supported device matrix; provide publisher signing access and installer/update hosting; identify pilot accounts/devices and the support owner. The first output is an unsigned Windows x64 pilot, not a broad-distribution release.

The implementation adds a dedicated `desktop/` package and updates the web Tasks cache/sync behavior and My Day reminder controls. It does not change authentication routes, data ownership, or server permission checks. The package builds an unsigned pilot installer; broad distribution still needs publisher signing and release hosting.
