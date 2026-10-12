# Project Echo — AI agent handoff

This file is the working handoff for the next engineer or AI agent. Read it before changing the Echo chatbot, authentication, ClickUp data access, or the admin AI settings.

## Product identity

Mosaic is the connected team workspace. Use the supplied Mosaic lockup, app icon, and **MOSAIC / WORK, CONNECTED** identity for visible product branding. The user-facing assistant is called **Mosaic assistant** or **Ask Mosaic**. ClickUp is a data connection, not the product identity. Keep answers conversational, grounded in the signed-in user's permitted work, and show sources when factual claims are made.

The visual system uses deep blue `#003366`, warm white `#FFFCFB`, gold `#C9A84C`, Cormorant Garamond, and Montserrat.

## Current repository state

- Repository: `https://github.com/pyscriptcli/project-echo-next.git`
- Active branch: `main`
- Release base: `a1f2a70` (`style(demands): align page with projects workspace`); this release adds shared ClickUp caching and synchronization.
- The Next.js app lives in `frontend/`; the repository root does not contain a `package.json`.
- Use `frontend/` as the working directory for npm commands.

## Handoff workflow

`handoff.md` is a working file, not a one-time report. Keep the permanent guide above this section current. Keep exactly two dated entries under `Recent handoffs`, newest first.

When the user explicitly requests a handoff:

1. Add one compressed entry at the top of `Recent handoffs`.
2. Keep the previous entry.
3. Delete the oldest entry only when a third entry would exist.
4. Update the entry with current focus, decisions, files, verification, commit/branch state, risks, blockers, and next actions.
5. Use Caveman style for the dated entry. Use `ponytail` only if installed; current repository has no `ponytail` skill, so write `ponytail unavailable` in `Suggested skills` and continue with Caveman.

This preserves today's handoff through tomorrow. It is replaced only after two newer handoffs exist.

## Recent handoffs

### 2026-09-13 — Studio capture and MeetStream setup

- Focus: unified Studio workspace; safer browser capture; Echo.ai meeting-bot launch.
- State: Studio Ask Echo shares session conversation and response UI with main drawer; citations clickable; sources collapsed. Minimize control removed. Browser capture opens native picker directly, blocks silent mic-only fallback when shared audio is missing, and offers retry or explicit microphone-only capture. MeetStream create route now uses authenticated Echo users, `Echo.ai` bot name, idempotency key, Vercel callback origin, and Deepgram live transcription config.
- Files: `frontend/src/components/StudioPanel.tsx`; `frontend/src/components/UniversalEchoDrawer.tsx`; `frontend/src/hooks/useStudioRecorder.ts`; `frontend/src/app/api/meetstream/bots/route.ts`; `frontend/src/app/api/meetstream/bots/route.test.ts`; `frontend/README.md`.
- Verification: 19 tests passed across 8 files; focused lint passed; production build passed; `git diff --check` passed. Studio visual QA blocked by local ClickUp sign-in.
- Commit: `d211b49` on `main`; pushed to `origin/main`. This `handoff.md` update is uncommitted. User reports `MEETSTREAM_API_KEY` configured in Vercel; deployment completion not independently verified.
- Risk: browser owns screen/audio selection; Echo cannot auto-select monitor or audio toggle. MeetStream webhook currently acknowledges and logs events only; no durable transcript/media persistence or final Notetaker handoff. No real meeting join test completed.
- Next: verify Vercel deployment; join one controlled Google Meet; admit Echo.ai; confirm live webhook events; then persist transcript turns and complete post-call Notetaker handoff.
- Suggested skills: `caveman`; `tdd` for webhook lifecycle; `ponytail unavailable`.

### 2026-09-12 — Rolling handoff workflow

- Focus: make `handoff.md` reusable, rolling, and agent-readable.
- State: permanent guide retained; exactly two recent entries required; newest first.
- Files: `handoff.md`; `.agents/skills/handoff/SKILL.md`.
- Verification: pending after documentation update.
- Commit: pending.
- Risk: `ponytail` skill unavailable; Caveman remains available.
- Next: preserve two-entry rotation on every explicit handoff; update changelog when behavior changes.
- Suggested skills: `caveman`; `ponytail unavailable`.

## What is implemented

### IT Projects workspace

- `/business-analysis` and `/ba` open the personal IT Projects workspace in the shared Mosaic shell. Dave and system admins have access by default; explicit page permissions can grant it to others.
- Project records remain scoped per signed-in user in `mosaic_ba_workspaces`; the existing page-access checks and owner-scoped read/write routes are unchanged. New backlog, architecture, process, and deployment arrays normalize safely for older saved projects.
- Project tabs are Dashboard (timeline), Product Backlog, Sprint Backlog, RTM, System Design and Architecture, End to End Process, Deployment, and Reports. Every tab supports List and Cards, with each tab retaining its view choice while the project is open. Full-width stacked cards and compact editable tables follow the RTM design deployed from 423c4b6.
- Product Backlog and RTM edit the same requirement records. RTM retains rich-text story, test, criteria and impact editing, generation and classification actions, local tasks, verification, details, deletion confirmation, and saved table widths. Dashboard dates and deliverables and Reports drafts remain editable in both views.
- Reports retains project workbook export, browser print, and editable Word document drafts. Apply `supabase/business_analysis.sql` when setting up workspace storage.

### Mosaic desktop launcher

- `desktop/` contains an Electron 44 Windows x64 launcher for the hosted Mosaic app; it does not run a second web server or add business-data access.
- The app uses a persistent per-user Electron session for the existing hosted OAuth flow. The remote workspace has no Node integration, uses context isolation and sandboxing, limits navigation to its configured HTTPS origin and ClickUp sign-in pages, prompts before microphone/camera access, and rejects other permission requests. Screen/window capture requires explicit selection per request; system audio requires separate approval.
- Closing the window hides Mosaic in the system tray. Startup is opt-in and starts hidden. Quit asks for confirmation because unsaved changes or recording can be interrupted. Tray residency alone does not guarantee background meeting capture.
- Tasks-page edits, status and priority changes, and deletions update the owner-scoped browser cache immediately and sync through a durable per-user browser outbox. Creation still waits for the hosted write response.
- My Day supports typed HH/MM/SS reminder intervals. The desktop tray timer opens a centered, always-on-top reminder over other apps on the pointer's monitor; the alert stays until snoozed or dismissed. Task titles remain in memory only.
- The installer defaults to `https://mosaic-workspace.online`, the verified custom domain attached to the `echo-next` Vercel project. Vercel marks its current A record as needing a change and recommends `76.76.21.21`; the domain uses Spaceship nameservers, and local DNS resolution failed. The former `project-echo-next.vercel.app` alias returned `DEPLOYMENT_NOT_FOUND`; override with `MOSAIC_APP_URL` if the production domain changes.
- In `desktop/`, run `npm ci` then `npm run dist:win` on Windows x64. This creates `dist/Mosaic-Setup-<version>-x64.exe` and `dist/SHA256SUMS.txt`. Packaged builds use `electron-updater` with the public Mosaic GitHub Releases feed, Authenticode verification, background downloads, and a user-confirmed install/restart. Pushes to `main` that change `desktop/` trigger `.github/workflows/mosaic-desktop-release.yml`; it publishes a versioned signed release once GitHub Actions has the Windows signing certificate and password secrets. Web-only fixes arrive through the live hosted app.
- Current local artifact: `desktop/dist/Mosaic-Setup-0.2.0-x64.exe`. It is unsigned and must be replaced by a signed release build before authenticated automatic updates can be validated. OAuth/tray/capture still need clean-machine validation.
- Key files: `desktop/src/main.cjs`; `desktop/electron-builder.yml`; `desktop/scripts/prepare-build.cjs`; `desktop/README.md`.

### Authentication and user connections

- Echo signs users in through ClickUp OAuth.
- Each user gets their own OAuth access token in the `echo_clickup_token` HTTP-only cookie and a cached profile in `echo_user_profile`.
- The OAuth callback fetches the ClickUp user profile and workspace name, checks the configured allowed email domains, then establishes the session.
- Production and preview sign-in use each user's ClickUp OAuth token; do not add a shared-token fallback there. Local development may use `CLICKUP_PERSONAL_API_TOKEN` from the ignored `frontend/.env.local` only when `NODE_ENV=development`. The dev server binds to `127.0.0.1`; local sign-in resolves the ClickUp profile and applies the existing allowed-email-domain check before setting the HTTP-only session cookie.
- `/api/auth/me` returns the signed-in profile and refreshes the cached profile when needed.
- Ask Echo requires an authenticated profile with an email address.

Required deployment variables:

```text
CLICKUP_CLIENT_ID
CLICKUP_CLIENT_SECRET
CLICKUP_REDIRECT_URI   # optional; otherwise /api/auth/callback on the current origin
DEEPSEEK_API_KEY       # server-side model credential used by Ask Echo
MEETSTREAM_API_KEY     # server-side Echo.ai meeting-bot credential
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY (or the configured Supabase service key)
```

ClickUp OAuth redirect settings must point to the deployed `/api/auth/callback` URL. OAuth consent is per user; the personal ClickUp MCP connection installed in Codex is unrelated to deployed Echo users.

### Ask Echo request flow

1. `frontend/src/app/api/ask-echo/route.ts` authenticates the request from cookies and passes the user's id, name, email, OAuth token, and selected task list to the service.
2. `frontend/src/lib/ask-echo/service.ts` validates the request, loads the AI policy, checks usage/rate/concurrency limits, resolves allowed Echo pages, and loads only permitted evidence.
3. `frontend/src/lib/ask-echo/access.ts` resolves page permissions. Owner/admin users can receive broader access when configured; ordinary users receive their configured/default pages. Restricted pages are not sent to retrieval or the model.
4. `frontend/src/lib/ask-echo/clickup.ts` reads mapped ClickUp lists using the current user's OAuth token.
5. `frontend/src/lib/ask-echo/retrieval.ts` ranks meeting and task evidence. When the question contains “me”, “my”, “mine”, or “I”, records matching the user's id, name, or email receive a strong ranking boost.
6. `frontend/src/lib/ask-echo/provider.ts` sends the bounded question, conversation, user identity, and selected evidence to the configured model. Evidence is explicitly treated as untrusted data, never instructions.
7. The service resolves returned source ids against real evidence, filters invalid citations, records usage, and returns the typed response.

Ask Echo is currently read-only. It does not create tasks, edit records, edit minutes, or perform autonomous actions.

### Ask Echo response shape

Defined in `frontend/src/lib/ask-echo/schema.ts`:

```ts
interface AskEchoResponse {
  answer: string;
  sources: EvidenceSource[];
  citations?: Array<{ marker: string; sourceId: string }>;
  confidence: "supported" | "partial" | "insufficient";
  followUps: string[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
```

The model is asked to put inline markers such as `[1]` and return a citation mapping. The service only returns citations that resolve to retrieved sources. The client also falls back to the source order for a marker when a model omits an explicit mapping, so visible `[1]` markers remain clickable when possible.

### Current chatbot UI

`frontend/src/components/UniversalEchoDrawer.tsx` is the main UI.

- Right-side drawer with PRIME Blue `#003366`, Warm White `#FFFCFB`, and Gold `#C9A84C` accents.
- Expand button opens the same conversation at full width.
- No conversation-history sidebar. Current messages are kept in `sessionStorage` for the current browser session.
- New conversation, stop response, close, and follow-up buttons are present.
- Greeting uses the signed-in profile name from `/api/auth/me`.
- Suggested prompts include personal work, attention, changes, and daily brief questions.
- User-facing copy is Echo-first and should not expose ClickUp as the assistant identity.
- Sources are collapsed by default behind `Sources · N`.
- Inline `[n]` footnotes are buttons that open the matching source through `onOpenSource`.
- Expanded sources show numbered source cards, page/date/topic, excerpt, and external/open behavior.
- Answer rendering gives blank lines, bullet styling, and highlighted section headings without introducing a full markdown dependency.
- The current UI intentionally avoids a large evidence/match summary strip; keep answers visually focused on the answer itself and compact source access.

The parent page wires source navigation in `frontend/src/app/page.tsx`: meeting/task pages are opened in Echo's existing views and external URLs may open in a new tab.

### Studio and meeting capture

`frontend/src/components/StudioPanel.tsx` presents one capture workspace with two paths: paste a supported meeting link for Echo.ai, or record on the current device.

- Fullscreen layout keeps recording and timestamped notes on the left and Ask Echo on the right.
- Studio Ask Echo uses the same session conversation, message styling, clickable inline citations, collapsed sources, and follow-up actions as the main drawer.
- Active recording state reaches the top bar through `echo-recording-state`; Studio no longer exposes a minimize-to-topbar control.
- Closing during an active recording requires an explicit stop-and-close confirmation.
- Browser capture opens the native share picker immediately. Echo requests system/tab audio and checks the returned stream before recording starts.
- Missing shared audio stops startup and offers `Choose again` or explicit `Use microphone only`. Browsers retain control of monitor/tab selection and audio toggles.
- Local audio is flushed to IndexedDB every 10 seconds. `useLiveTranscription` processes completed audio batches during recording; finalization uses prepared chunks when complete and the full-file path as fallback.

### Echo.ai meeting bot

`frontend/src/app/api/meetstream/bots/route.ts` creates a MeetStream bot for Zoom, Google Meet, or Teams links.

- Requires an authenticated Echo session and server-only `MEETSTREAM_API_KEY`.
- Sends bot name `Echo.ai`, audio/video recording, an idempotency key, callback URL, and Deepgram streaming transcription settings.
- Resolves callback origin from `MEETSTREAM_WEBHOOK_BASE_URL`, `NEXT_PUBLIC_APP_URL`, Vercel deployment variables, or the current request origin.
- `frontend/src/app/api/meetstream/webhook/route.ts` currently acknowledges and logs events. Durable event storage, final transcript retrieval, media retrieval, and automatic Notetaker handoff remain pending.

## Admin AI configuration

`frontend/src/components/forms/FormsPortal.tsx` includes the `AI` tab. It exposes the approved model catalog, fallback model, output/source limits, RPM, concurrency, daily user tokens, and monthly organization tokens. The server validates policy through `frontend/src/lib/ask-echo/limits.ts` and `frontend/src/app/api/forms/config/route.ts`.

`frontend/src/app/api/admin/ai/route.ts` exposes protected usage/policy status. Usage records are written through `frontend/src/lib/ask-echo/store.ts` to `echo_ai_usage`.

Run `supabase/forms_rbac.sql` against the project Supabase database before relying on persistent AI usage/rate limits. The SQL creates the config and usage tables and enables RLS. Do not mention Supabase in ordinary frontend copy; technical details belong in logs/admin documentation.

## Important source/list mappings

The current fixed mappings are in `frontend/src/lib/ask-echo/clickup.ts`:

- Notebook: `901418075633`
- Demands: `901420989525`
- Market Insights: `901420987429`
- Tasks: the selected `echo_clickup_list_id` cookie
- Forms: list ids configured in the admin mappings
- Meetings: the configured archive/repository path, gated by page access

The Demands page reads and writes structured `echoDemand` records in its mapped list using the signed-in user's OAuth token. Status and Action Taken are free-text fields. Do not add workspace-token fallbacks. Candidate-property scouting, geolocation photos, and scouting reports remain future scope.

The standalone Contracts page compares Word documents in the browser and does not create workspaces or persist review history. Existing local files and saved review data are left untouched. Project contract reviews retain their existing history behavior.

ClickUp reads route through `frontend/src/lib/clickupCalendarApi.ts` for per-token cache, bounded concurrency, rate-limit handling, and performance logs. Apply `supabase/clickup_read_model.sql` and set the ClickUp sync variables documented in `frontend/README.md` before relying on multi-instance cache sharing, periodic reconciliation, encrypted connections, or task snapshots. Only recent snapshots with a fresh per-user list access check may be served. ClickUp list webhooks are registered after authorized Tasks, Demands, and project subproject reads. Tasks list discovery is on demand and caches its result per signed-in browser user.

### Browser page cache

`frontend/src/lib/browserPageCache.ts` stores signed-in user's page data in IndexedDB without a time-based expiry, keyed by user id and query. Views hydrate that snapshot first, then revalidate in the background; unchanged records retain object identity to avoid needless UI work. Sidebar hover/focus preloads data for allowed destinations. Logout, account change, and 401/403 responses clear that user's browser cache. Never cache OAuth credentials, and keep API permission checks in place: cached data is a display speed-up, not authorization. Data endpoints currently revalidate with their existing response shape; the client avoids replacing unchanged records, but this does not imply row-level delta transfer over the network.

This is not yet a general workspace-wide ClickUp Docs/comments/MCP search. The deferred boundary is documented below.

## Key files

- `frontend/src/components/UniversalEchoDrawer.tsx` — drawer, expanded view, messages, citations, sources, composer.
- `frontend/src/components/UniversalEchoDrawer.test.tsx` — UI send/source behavior.
- `frontend/src/components/StudioPanel.tsx` — capture selection, recorder controls, live notes, and embedded Ask Echo.
- `frontend/src/hooks/useStudioRecorder.ts` — browser audio capture, audio validation, mixing, and crash recovery.
- `frontend/src/hooks/useLiveTranscription.ts` — background audio-batch transcription and finalization.
- `frontend/src/app/api/meetstream/bots/route.ts` — authenticated MeetStream bot creation.
- `frontend/src/app/api/meetstream/webhook/route.ts` — MeetStream callback receiver; persistence pending.
- `frontend/src/app/api/meetstream/bots/route.test.ts` — bot payload and missing-configuration coverage.
- `frontend/src/lib/api.ts` — client request helper (`askEcho`).
- `frontend/src/app/api/ask-echo/route.ts` — transport/auth/error handling.
- `frontend/src/lib/ask-echo/schema.ts` — request/response types and validation.
- `frontend/src/lib/ask-echo/service.ts` — orchestration, permissions, retrieval, model, usage.
- `frontend/src/lib/ask-echo/access.ts` — page access resolution.
- `frontend/src/lib/ask-echo/clickup.ts` — per-user ClickUp list retrieval and source normalization.
- `frontend/src/lib/ask-echo/retrieval.ts` — deterministic matching/ranking and evidence limits.
- `frontend/src/lib/ask-echo/provider.ts` — model prompt and server-side provider call.
- `frontend/src/lib/ask-echo/store.ts` — config, meetings, usage, and Supabase access.
- `frontend/src/lib/ask-echo/limits.ts` — approved models and AI policy limits.
- `frontend/src/components/DemandsView.tsx` and `frontend/src/app/api/demands/route.ts` — demand monitoring UI and per-user connected-list access.
- `frontend/src/app/api/auth/login/route.ts` — starts per-user OAuth; do not add shared-token fallback.
- `frontend/src/app/api/auth/callback/route.ts` — exchanges OAuth code and sets session cookies.
- `frontend/src/lib/auth.ts` — cookie names, profile types, allowed-domain check, session helpers.
- `frontend/src/components/forms/FormsPortal.tsx` — admin settings and AI tab.
- `supabase/forms_rbac.sql` — config, usage ledger, and RLS schema.
- `docs/ASK_ECHO_IMPLEMENTATION_PLAN.md` — original implementation plan and product boundaries.

## Changelog

### Local 2026-10-10 — reduce selected Tasks list loading

- Removed workspace-wide list discovery from Tasks page entry; persist discovered lists per user and scan only when the selector needs data or the user requests a rescan.
- Routed selected-list reads through shared per-token caching/rate handling, served fresh snapshots after a current-user list access check, and scheduled first sync/webhook registration in the background.
- Manual task refresh bypasses read cache; ClickUp webhooks clear that list's cached task responses before sync. Added route timing/source metadata.
- Verification: `npx tsc --noEmit` and `git diff --check` passed; targeted ESLint reports pre-existing `no-explicit-any` errors in the touched files. Tests not run.
- Commit: `c2529ac` on `main`; pushed to `origin/main`.
- Risk: snapshots remain limited to 3,000 records and five minutes; deployment still needs the existing sync migration/configuration.
- Next: inspect `CLICKUP_PERF_LOGS` route/request timings after deployment and tune the slowest remaining list path.

### Local 2026-10-10 — persistent page data cache

- Added per-user IndexedDB cache with no TTL, cache-first hydration and background revalidation for meetings, projects, tasks, notebook, demands, and archive views; added allowed-page hover/focus preloading.
- Preserved unchanged record references and invalidate cached data on authorization failures; no auth tokens are persisted.
- Verification: `npx tsc --noEmit` and `git diff --check` passed; cache helper ESLint passed. Broader focused lint reports pre-existing component errors; tests not run.
- Commit: uncommitted on `main`.
- Risk: backend endpoints still return their current full response; unchanged records are not retransmitted selectively. Cache is browser-local and cannot synchronize edits across devices until refresh.
- Next: user has not requested a push in this turn.

### Local 2026-10-10 — shared ClickUp loading and durable snapshots

- Routed ClickUp requests through shared per-user caching, request pacing, bounded concurrency, and retry handling; deferred nonessential page loads and removed eager task counts.
- Added encrypted connection storage, synchronized task snapshots, signed list webhooks, and scheduled reconciliation. Migration: `supabase/clickup_read_model.sql`.
- Deployment requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `CLICKUP_SYNC_ENCRYPTION_KEY`; configure the app origin for webhook registration.
- Verification before release: TypeScript, focused ESLint, and `git diff --check` passed; tests were not run.
- Commit: included in this `main` release.

### Local 2026-10-09 — clean Demands monitor (uncommitted)

- Replaced placeholder demand rows and fixed-date presets with connected-list loading and calendar-aware ranges.
- Aligned demand creation and updates with the record route; surfaced load/save errors; kept Status and Action Taken as text.
- Removed unsupported value estimates, static chart claims, and the generated trend report. Site scouting remains deferred.
- Verification: targeted ESLint, `npx tsc --noEmit`, and `git diff --check` passed; tests were not run.

### `d211b49` — secure MeetStream creation and configure transcription callbacks

- Added authenticated bot creation, server-only API key handling, idempotency, deployment-aware callback URLs, and Deepgram live transcription configuration.
- Added route tests and Vercel environment documentation.

### `e7c40e7` — open audio sharing directly

- Removed Echo's extra pre-share wrapper so the record control opens the required browser picker immediately.
- Retained post-picker shared-audio validation and explicit microphone-only fallback.

### `3dbc987` — align Studio chat and audio sharing

- Aligned Studio Ask Echo with the main conversation UI and shared session state.
- Added clickable citations, collapsed sources, follow-ups, and conversation-aware prompts.
- Removed recording minimization, protected active close, and stopped silent fallback when shared audio is missing.

### `8f710fb` — reshape full-screen meeting workspace

- Placed recording and live notes on the left and Ask Echo on the right in fullscreen Studio.
- Added dynamic recording state and audio visualizer behavior.

### `fb39895` — refine Echo answer presentation

- Made answer bodies visually clearer with spacing, bullet markers, and highlighted section headings.
- Made inline source markers reliably resolve by explicit citation mapping or source order.
- Removed invalid nested paragraph markup that caused hydration warnings.

### `0a3a059` — add inline Echo citations and visual evidence

- Added optional citation mappings to the Ask Echo response contract.
- Updated the model prompt to emit `[n]` citations tied to evidence ids.
- Server filters citations to real retrieved sources.
- Sources collapsed by default and expandable as numbered source cards.
- Added compact evidence/match cards at the time; these were removed in `fb39895` after UI feedback.

### `ff7845d` — make Echo personal and conversational

- Added identity context (id/name/email) to retrieval and model prompts.
- Added user matching for “me/my/mine” queries using assignee ids, names, and emails.
- Added personalized greeting and Echo-first conversational copy.
- Added suggested prompts for attention, open tasks, weekly changes, and daily brief.
- Updated source normalization with owner ids.

### `2c0aec6` — require per-user ClickUp OAuth

- Removed the shared `CLICKUP_API_TOKEN` sign-in fallback.
- Login now requires configured ClickUp OAuth rather than silently signing users in as a workspace account.
- Updated auth status and login copy to explain individual connections.

### `50629e2` — gate Ask Echo context by page access

- Added page access resolution and page-to-source mapping.
- Retrieval fetches only enabled pages/lists.
- Restricted pages are excluded before the model sees evidence.

### `0436df2` — rebuild Ask Echo with grounded conversations

- Replaced meeting-only client behavior with a typed, authenticated Ask Echo service.
- Added bounded conversation turns, source ids, confidence, follow-ups, request cancellation, session storage, and server usage/rate controls.
- Added ClickUp context retrieval and AI admin configuration/usage ledger.
- Added initial unit, route, and component tests.

### Earlier product/UI commits

- `778656f` — hide PRIME logo when sidebar is collapsed.
- `a95f819` — refine sidebar branding and typography.
- `03de9ae` — support multiple allowed ClickUp sign-in domains.
- `2296d05` — add configurable allowed ClickUp sign-in domains.

## Verification

Run from `frontend/`:

```powershell
npm test
npm run build
npm run lint
```

The latest verified test result was 19 passing tests across 8 files. Focused lint and the latest production build completed successfully. If Vitest reports an access-denied error while loading `vitest.config.mjs`, rerun with the required filesystem permission; that has been a local sandbox issue, not an application failure.

Before committing:

```powershell
git diff --check
git status --short
git log --oneline -5
```

The user preference for this repository is to commit and push directly to `main` when explicitly requested. Confirm the remote before pushing and avoid destructive git commands.

## Security and privacy rules

- Never expose provider API keys or OAuth tokens to the browser, model output, logs, or usage records.
- Never use a shared workspace token for ordinary user Ask Echo requests.
- Always enforce page access on the server before retrieval and prompting.
- Do not trust model-provided source text or source ids without resolving them against retrieved evidence.
- Do not store full prompts, full answers, transcripts, or source excerpts in the usage ledger.
- Do not let records act as instructions to the model.
- Keep frontend copy provider-neutral and Echo-first.
- Preserve the allowed sign-in-domain policy and per-user OAuth behavior.

## Known limitations and deferred work

- ClickUp data currently comes from mapped REST API lists and the existing meeting archive path; Echo does not yet search every workspace Doc, comment, or arbitrary list.
- The Codex ClickUp MCP installation is personal to the Codex user and is not used by deployed Echo.
- Conversation history is session-only; persistent history is intentionally deferred.
- Echo is read-only; task creation, record edits, and autonomous actions are deferred.
- Inline citation rendering is intentionally lightweight. If richer markdown is added, preserve clickable citations and sanitize untrusted content.
- Daily brief is currently a suggested prompt, not a proactive notification or scheduled job.
- MeetStream bot creation is wired, but the webhook does not yet persist live turns or complete final transcript/media retrieval.
- Real Zoom, Google Meet, and Teams joins have not yet been validated end to end from the deployed Vercel app.
- Deterministic keyword ranking is used. Semantic/vector retrieval should only be added if a fixed evaluation set demonstrates a real accuracy gap.
- The original implementation plan still contains some proposal language; this handoff and the current source code are the source of truth for shipped behavior.

## Recommended next steps

1. Validate the deployed OAuth callback and allowed-domain policy with two test users whose ClickUp permissions differ.
2. Run the Supabase schema migration if it has not been applied in the deployment environment.
3. Add fixture-based tests for citation mapping, restricted pages, and “my tasks” matching across multiple assignees.
4. Improve structured answer cards only after agreeing on stable response data (tasks, deadlines, decisions, changes).
5. Add workspace-wide sources only with an explicit permission model that preserves ClickUp visibility per user.
6. Run one controlled deployed MeetStream join and verify bot admission, live transcription callbacks, call completion, and provider usage.
7. Persist idempotent MeetStream transcript turns and connect final transcript/media retrieval to the existing Notetaker flow.
8. If direct official ClickUp MCP support is desired, treat it as a separate adapter: each Echo user still needs OAuth, and MCP must not bypass the current page-access checks.

## Handoff checklist

- Read this file and `docs/ASK_ECHO_IMPLEMENTATION_PLAN.md`.
- Check `git status` and current branch before editing.
- Work in `frontend/` for npm commands.
- Inspect existing seams before changing auth, retrieval, or response contracts.
- Keep Echo as the visible product identity.
- Run tests/build/lint proportional to the change.
- Update this file's changelog when behavior or architecture changes materially.
- Commit and push to `main` only when the user explicitly asks for it.
