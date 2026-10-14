# ClickUp sync reliability requirements

Date: 2026-10-14
Status: implementation in progress; acceptance checklist at the end is the release record.

## Goal

Make the application use one durable ClickUp task refresh path so daily logs and other ClickUp-backed pages show complete saved data while refresh runs. The Sync control is the user-facing entry point. Admin Telemetry must describe actual durable runs, targets, retries, and current queue health. A failed or incomplete refresh must never replace the last complete snapshot.

## Scope and current implementation

The existing durable worker, run records, claim fencing, staged publication, paginated snapshot reads, webhook inbox, and scheduled worker are the foundation. This increment removes remaining live task-list fallbacks from the My Day, Tasks, Demands, and Market Insights GET paths. A cold or stale read queues the list through the same sync service and serves a retained snapshot when one exists. Telemetry adds completed/active/partial runs, run duration, retry and terminal queue counts, and queue age.

Writes may continue to use the durable write outbox and may read current state where needed for conflict detection. ClickUp list metadata such as statuses and membership can remain a separate read until it has its own cached metadata contract; it must not be mistaken for a task refresh or a completed sync run.

## Functional requirements

### R1. One authoritative task refresh path

- Manual Sync, daily-log bootstrap, stale feature reads, webhook events, scheduled reconciliation, and completed ClickUp writes must enqueue work through the shared durable sync service.
- Feature GET routes must not fetch full task lists directly from ClickUp. They must read the last complete local snapshot, request background refresh when cold or stale, and return clear freshness/sync state.
- Repeated reads of the same list must coalesce with queued/running work. A read must not create unbounded duplicate jobs or run targets.
- Refreshing one list must not block independent target completion because another list failed or is rate limited.

### R2. Complete daily-log date browsing

- Preserve the prior complete daily-log snapshot while a refresh is pending, retrying, or failed.
- Fetch all ClickUp pages without the Supabase 1,000-row response ceiling or a fixed 3,000-record assumption truncating the result.
- Keep month parents and child tasks together in the snapshot so date and member projections do not silently lose logs when a page boundary separates them.
- Normalize Manila-local dates, parent relationships, inherited owners, and the existing four activity categories consistently. Date navigation must filter the local snapshot and must not initiate a direct task-list request.
- Return `syncedAt`, `syncState`, and an actionable empty/loading/error state for cold, stale, and failed data.

### R3. Safe worker and publication lifecycle

- Every claim has a unique token and generation fence. An expired worker cannot stage pages, advance a cursor, publish, or alter another claim's status.
- Persist page progress between bounded worker invocations. Enforce an upstream request timeout and stop before the platform execution deadline.
- Validate payload shape and task IDs. An empty result is accepted only when ClickUp returned a valid complete page sequence.
- Publish a generation atomically after all required pages succeed. Failed attempts preserve the previous snapshot and do not advance the sync cursor.
- Retry 429 responses using ClickUp reset headers; use bounded backoff for transient errors; mark authorization/access failures terminal and actionable. Healthy targets continue independently.
- Run periodic full reconciliation and apply webhook tombstones so missed deletes and moved tasks converge to ClickUp.

### R4. Webhook and queue operations

- Provision the daily-log webhook from the authenticated connection flow and persist its signing secret before acknowledging the subscription as ready.
- Record verified webhook events idempotently before enqueueing the target refresh. Failed enqueue must return a retryable response and must not leave a permanent false deduplication record.
- Expose inactive, missing, or failing webhook state to operators. Scheduled full reconciliation remains the repair path for missed delivery.
- Scheduler authentication must use a server-only secret stored in Vault. Job history must distinguish an HTTP invocation accepted by Cron from a worker invocation that actually claimed or completed work.

### R5. Truthful Admin Telemetry

- Use durable run and target rows as the source of truth for logical runs and list outcomes. API request events are request metrics, not run counts.
- Report counts for completed, active, partial, and failed runs; requested/synced/failed/pending targets; retries; terminal queue failures; records published; duration; last error; oldest queue age; and snapshot data age.
- Pending and retry values must reflect current job rows, not historical queued observations. A recovered job must stop counting as pending.
- Correlate each ClickUp API request to run ID, list ID, worker attempt, and trigger when that context exists. Include 429 count and time waiting on rate limits.
- Bound telemetry reads and aggregate historical data in Postgres when volume makes row pagination costly. Preserve one report for all refresh paths.

### R6. Security, ownership, and data retention

- Resolve connection owner from ClickUp's authenticated `/user` identity. Never use a client-readable profile field as authorization evidence.
- Scope run status reads to the verified connection owner. Only the internal worker can claim or publish jobs.
- Keep sync internals service-role-only with RLS enabled and no anonymous/authenticated grants. Keep the worker secret out of logs and browser responses.
- Apply documented retention to webhook events, telemetry, attempts, orphaned connections, and snapshots. A cleanup failure must be visible and must not delete active connections or pending writes.

### R7. Diagnostics and release safety

- Diagnose at least one known missing date end to end: ClickUp source tasks, page membership, stored snapshot IDs, parent/member/date projection, API payload, and browser filter. Record the cause and regression scenario.
- Exercise duplicate and out-of-order webhooks, stale workers, worker restart, 429/401/403/500 responses, malformed payloads, DB timeouts, lists over 1,000 and 3,000 records, missing parents, month boundaries, legacy task names, and credential rotation in a non-production environment.
- Compare source task IDs and rendered date/member/category fields with the snapshot before rollout. Keep the last good snapshot and a rollback path.
- Run the production build, authenticated UI click-through, and production deployment check for the pushed commit. Do not claim completion from a local build alone.

## Release evidence

- On 2026-10-14, the user screenshot's queue rejection was traced to PostgreSQL `42702` errors in production: the enqueue function had PL/pgSQL variables named `list_id`/`run_id` colliding with SQL columns, and the scheduled claim function selected an unqualified `run_id`. This caused refresh enqueue and worker claims to fail. Migration `clickup_sync_queue_ambiguity_fix` replaced the colliding variables with `v_` names, qualified the claim CTE reference, and made list ID validation explicit. A real daily-log target was accepted into the durable queue after the migration.
- After the migration, the one-minute Cron endpoint returned HTTP 200 and processed other queued targets; no PostgreSQL `ERROR` entries appeared after 01:52 UTC. The daily-log run itself was still queued behind the existing backlog at 01:54 UTC, so its completion and publication remain unverified.
- The production Supabase project previously reported a 1,000-row Data API ceiling, 556 cached daily-log tasks, and 16 queued jobs. This motivated explicit pagination and queue health reporting; it did not reproduce the user-reported missing date.
- The durable schema and one-minute Cron schedule were applied to Project Echo. One Cron invocation was recorded as `succeeded`; this alone does not prove that an HTTP worker completed a sync.
- The prior production build passed. The authenticated UI flow and the missing-date root cause were not verified in that build.
- In this requirements increment, `tsc --noEmit --incremental false` and `npm run build` both passed after the snapshot-first route and Telemetry changes.

## Acceptance criteria (release checklist)

Every item must have evidence recorded here or in the linked deployment/diagnostic record. Do not mark a requirement complete solely because code exists.

- [x] Durable run/target schema, worker claim fencing, page staging, atomic publication, and task tombstones are applied to Project Echo.
- [x] The autonomous one-minute scheduler is active and has a recorded successful Cron invocation.
- [x] Snapshot reads explicitly paginate past the configured Data API page ceiling.
- [x] My Day, Tasks, Demands, and Market Insights GET task data through retained snapshots; cold/stale reads enqueue shared refresh work instead of fetching task lists directly.
- [x] Project subproject task views use retained snapshots and enqueue cold/stale list refreshes instead of making direct list-task requests.
- [x] Admin Telemetry derives run and list outcomes from durable records and reports active/completed/partial runs, retries, terminal failures, run duration, and oldest queue age.
- [ ] For a user-provided missing date or task ID, trace the record from ClickUp through stored snapshot, projection, API response, and browser filter; document the reproduced root cause.
- [ ] In staging, complete the R3/R4 failure scenarios and large-list checks with recorded evidence; verify a failed attempt leaves the old snapshot intact and recovery clears current pending counts.
- [ ] Verify daily-log webhook creation, signing-key persistence, duplicate delivery handling, inactive webhook reporting, and reconciliation after a deliberately missed event in staging.
- [ ] Audit every remaining ClickUp task-list/search path and either route refresh reads through the durable snapshot service or document why the query needs a separate indexed/cached contract. The 2026-10-14 inventory still includes `/api/meetings` (`/list/:id/task`, `/team/:id/task`), `/api/projects/assignees`, `/api/projects/sites`, `/lib/ask-echo/clickup.ts`, and `/lib/forms/requestId.ts`; inspect the remaining direct calls in `/api/tasks`, `/api/market-insights`, and `/api/my-day` and classify each as refresh, write-conflict read, or metadata/search.
- [ ] Confirm the scheduler's HTTP response and worker claim/completion in database/network history, not only `cron.job_run_details.status`.
- [ ] Run an authenticated click-through of date browsing, Sync progress and recovery, empty/stale/error states, and Admin Telemetry. Record screenshots or a concise interaction log.
- [x] Run the repository production build and TypeScript check; both passed for this implementation increment.
- [x] Queue failures are captured as sanitized ClickUp sync telemetry with database error code; API response preserves the last saved log and gives a retryable message.
- [x] Sync button exposes its active state to assistive technology and animates during sync while honoring reduced-motion preferences.
- [ ] Confirm the production daily-log queue run accepted after the ambiguity fix is claimed and completes successfully; verify the worker claim no longer reports SQLSTATE `42702`.
- [ ] Run and record the applicable staging failure/acceptance scenarios; these were not run in this environment.
- [x] Commit only ClickUp sync task files, push the intended branch, and verify the hosted deployment for that commit reaches a successful terminal state.

## Interim live-read mode (2026-10-14)

The user asked to prioritize live ClickUp reads while keeping the durable Supabase schema and worker setup available for future use. The app's task-list GET routes now use the shared ClickUp request gate and complete list pagination. Live reads bypass the five-minute ClickUp HTTP cache. The Sync control verifies the current token and waits for mounted feature views to refresh through their own authenticated GET routes; it does not enqueue a durable run.

ClickUp documents 100 tasks per Get Tasks page and base-plan limits of 100 requests/minute/token. The shared gate spaces starts by at least 667 ms (at most 90/minute), caps in-flight requests per token at three, coalesces duplicate list fetches in-process, and retries 429 responses according to `Retry-After` or `X-RateLimit-Reset`.

### Live-read acceptance criteria

- [x] Notebook, My Day, Tasks, project subproject tasks, Demands, Market Insights, Projects Sites, meeting task lists, and form task-list reads use live ClickUp data rather than the retained task snapshot.
- [x] Live list reads bypass the app's five-minute HTTP cache and load all ClickUp pages; the Daily Log reader no longer assumes a 3,000-task limit.
- [x] Live list requests use the shared per-token gate, bounded concurrency, in-flight coalescing, and ClickUp 429 reset headers.
- [x] The Sync control dispatches a live refresh to mounted feature views and waits for their refresh handlers; its request path does not enqueue a Supabase sync run.
- [x] No Supabase migration, schema, scheduler, or stored secret was changed for interim live-read mode.
- [x] TypeScript check passed for interim live-read changes.
- [x] Production deployment for commit `653b985` reached Ready. An authenticated Daily Log view loaded nine activity days for October 1–14, 2026; browsing to October 12 and refreshing populated the selected-day editor with its Admin, Ad hoc, and Meetings values.
- [x] Deploy the date-browse race fix and verify date changes never leave fields editable for the wrong date, stale responses cannot replace the selected date, and cached revisits render immediately. Record first-load and refresh durations.
- [x] With zero pending local writes, click the main Sync control and verify its animation, mounted-view refreshes, and completion state against ClickUp.
- [ ] Observe ClickUp rate-limit headers and request telemetry during the authenticated click-through to confirm the current workspace's actual plan and traffic stay within its token budget.
- [x] TypeScript check and production build passed after the date-browse race fix.

### Date-browse follow-up (2026-10-14)

The production date-browse check exposed a slow-loading state: the October 12 row showed category data in the activity timeline while the selected-day editor remained blank until a subsequent live refresh completed. The follow-up prevents late responses from replacing a newer selected date, caches recently visited day payloads in page memory for 20 seconds, and disables the editor and Save action while the requested day's data is still loading. The 20-second cache is local to the mounted browser component and is bypassed by explicit live refresh. A final review found that the parent also keyed the editor by date, remounting it and discarding that cache on every selection; the keyed remount is removed so the cache and request ordering remain active across date browsing.

The keyed-remount correction is in commit `f376f66` on `main`; the matching Vercel production deployment reached Ready. Authenticated production verification on 2026-10-14 confirmed the October 12 editor loaded all four Admin items, its Ad hoc item, and its Meetings item. During a first uncached date request, the loading/disabled state persisted for more than 30 seconds before the correct data appeared. Switching away and back within the 20-second cache window restored the October 12 data immediately. This verifies stale data was not editable while the selected date was loading and cached revisits work, but identifies a significant first-load latency that still needs optimization. With zero pending local writes, the main Sync control showed its syncing state/animation and a completion panel; all displayed targets ended in Done. The telemetry confirms list refresh completion, but live ClickUp rate-limit response headers were not exposed in this click-through.

## Live Daily Log read optimization (2026-10-14)

The user reprioritized direct live ClickUp pulls, with low latency and complete results ahead of future durable sync work. Keep the existing Supabase schema, cache tables, limiter RPC, and scheduler configuration unchanged. For Daily Log requests, enumerate ClickUp list parents without downloading all subtasks, then request the relevant monthly parent task with `include_subtasks=true`. The date editor expands one member/month; the history view expands only parent tasks for its selected date range and member. The default history view fetches the signed-in member's range; selecting another member fetches that member, while All Team Insights fetches all parents in the selected range. The Daily Log editor skips Personal List note reads it does not display. This preserves live ClickUp task data while avoiding pagination over unrelated years of child tasks. Other product areas retain the shared complete paginated reader.

The per-token limiter starts at the conservative 667 ms interval (at most about 90 starts/minute, below ClickUp's lowest documented 100/minute plan), caps active requests at three, and honors 429 reset headers. When ClickUp exposes `X-RateLimit-Limit`, the limiter uses 10% headroom below that observed plan limit. Rate limit, remaining, reset, queue wait, upstream time, and retries are included in request logs and telemetry when the response exposes those headers.

### Live Daily Log acceptance criteria

- [x] Date editor and history views use direct live ClickUp requests and do not read the durable task snapshot.
- [x] Date editor fetches parent tasks without subtasks, filters the common single-member request by ClickUp's assignee filter, and retrieves only the selected member/month tree. If the filtered response misses any required month (including legacy unassigned month parents), it falls back to the complete parent list. Tree fetches coalesce within a running instance.
- [x] Activity-only My Day responses include the selected member's daily entries from the already fetched live monthly ClickUp tree. The page caches those date payloads for five minutes so browsing within the loaded month is immediate; Sync and explicit refresh paths pass `liveRefresh=1` to fetch a fresh ClickUp tree.
- [x] When the Daily Log history response already covers the signed-in member and selected date, the editor uses that live response instead of issuing a second parent/tree read. It falls back to `/api/my-day` when history is unavailable, belongs to another member, or does not cover the date; the central Sync refreshes history from ClickUp and then updates the editor from that fresh response.
- [x] History requests are bounded to the selected date range and expand only relevant monthly parent task trees; all matching pages and subtasks remain available.
- [x] The default history request loads the authenticated member; selecting a different member loads that member, and All Team Insights loads all members for the chosen range.
- [x] Daily Log editor skips Personal List lookup and pagination when it does not render notes.
- [x] Shared request limiter keeps the default below ClickUp's lowest documented plan, honors 429 reset headers, and records rate-limit headers when provided.
- [x] No Supabase schema, migration, scheduler, or stored limiter configuration was changed for this optimization.
- [ ] Authenticated production check confirms uncached current-month log and date-editor data load within five seconds with all categories and matching dates present; record first-load and range-change duration. On deployment `27213b3`, October 12 and October 13 values loaded correctly, but each uncached date took about 10 seconds; the five-second target was not met.
- [x] Production telemetry observed `X-RateLimit-Limit: 100` on ClickUp responses. In the 30-minute observation ending 2026-10-14 03:12 UTC, the app recorded 70 ClickUp requests, at most 17 in any minute, and zero retries; this window stayed within the observed limit.
- [x] Commit `27213b3` (`fix(notebook): import ClickUp scope for live reads`) fixed the Vercel TypeScript build failure. Its production deployment reached Ready; authenticated October 1–14 history showed nine activity days, October 12 loaded Admin/Ad hoc/Meetings content, and October 13 loaded Admin content. Central Sync visibly animated, then completed with all listed targets Done.
- [x] Push the in-process live tree cache and forced-refresh change; production deployment for `fbd1a9e` reached Ready.
- [x] Production date browsing after the first monthly request loaded October 13 and October 12 immediately (under one second per UI interaction), including October 12 Admin, Ad hoc, and Meetings values. The first uncached selected-day load still took about 10 seconds, so the five-second cold-load target remains open.
- [x] Main Sync bypassed the page cache, showed its animated syncing state, refreshed mounted views, and completed with all displayed targets marked Done.
- [ ] Capture a production request trace proving the first month response included every activity day entry; the visible date navigation confirms the October 12 and 13 entries were available from the page cache, but the response body was not independently inspected.
- [ ] Recheck the first cold load after eliminating the duplicate editor parent/tree read and record the API request count and elapsed time.

### Central refresh feedback follow-up

- [x] Every mounted ClickUp-backed view registered for the central refresh contributes its name to one Sync report; duplicate Daily Log editor/history registrations collapse to one displayed target.
- [x] Simultaneous refresh triggers share one in-flight central refresh so they do not dispatch duplicate mounted-view refreshes.
- [x] A failed mounted-view refresh is reported as a failed target, while successful targets remain marked Done; the Daily Log retains its last loaded snapshot and surfaces the refresh error.
- [x] The report shows the successful ClickUp connection check and actual refreshed view targets; it does not label submitted list IDs as completed data refreshes.
- [x] The central Sync button displays a moving progress indicator while syncing and honors the reduced-motion preference.
- [x] Production click-through after the report-label cleanup confirms the central report shows ClickUp connection validation plus real mounted-view refresh targets, without generic list-ID completion rows.
- [ ] Fault-injection confirms a failed refresh keeps the prior Daily Log snapshot and reports only the affected mounted view as needing retry.
- [x] Selecting `Open this day` from the activity history updates the selected-day editor and shows that date's ClickUp categories.

Production evidence for commit `ac16a73`: deployment reached Ready. Authenticated Daily Log displayed 10 activity days for October 1–14, with October 12/13 entries and October 14 editor values present. Main Sync visibly showed the animated progress bar while active, then reported `ClickUp connection: Done` and `Daily Log: Done` with no generic list-ID rows.

Production date-browse evidence for commit `1cc689a`: selecting `Open this day` for October 12 changed the editor's selected date to `2026-10-12` and populated Admin (four entries), Ad hoc, and Meetings values from the same ClickUp history response.

### Direct-read latency and Sync feedback follow-up (2026-10-14)

The Daily Log history and selected-day read routes now start the live ClickUp parent-index request and the staged-write overlay lookup concurrently. Neither operation depends on the other's result, so Supabase lookup latency no longer delays the start of ClickUp's live read. The Sync detail panel uses the same moving progress indicator as the top-bar button; reduced-motion settings continue to disable its movement. The existing source already routes manual Sync through the live mounted-view refresh path and does not enqueue a durable refresh run. This change does not modify Supabase schema, cache configuration, limiter RPC, scheduler, or stored secrets.

### Acceptance criteria

- [x] Daily Log live parent-index reads and staged-write overlay reads start concurrently in both the history and selected-day routes.
- [x] Sync control and its open detail panel display the moving progress indicator while refresh work is active and honor reduced-motion preferences.
- [x] Production verifies that manual Sync no longer reports a refresh-queue failure and that a mounted Daily Log refresh completes from ClickUp. On 2026-10-14, the authenticated production Sync completed with `ClickUp connection: Done` and `Daily Log: Done`; no queue failure appeared.
- [ ] Measure an uncached current-month history load and selected-day load in production; confirm full date/category results and record timings. Selected-day values load from history, but the latest attempt to change the range was reset by the period control, so it did not yield a valid cold-history measurement. Keep the five-second target open.
- [x] Confirm ClickUp plan headers and live request traffic remain within the per-token budget during that same production run. Focused telemetry for the authenticated Sync showed a 100/minute limit, 85–99 requests remaining, and zero retries on the sampled Daily Log routes.
- [x] No Supabase schema, cache configuration, limiter RPC, scheduler, or stored secret was changed.

### Complete ClickUp request-path audit (2026-10-14)

A source audit found authenticated ClickUp requests in login, admin identity, media attachment, and Strategic Alliance submission paths that used native `fetch`; these calls bypassed the shared per-token limiter and request telemetry. Those paths now use `clickUpFetch`/`clickUpCalendarFetch`. Strategic Alliance submission-number discovery now uses the shared fully paginated list reader instead of stopping after 20 pages. The wrapper now honors `cache: "no-store"` as a cache bypass, preserving callers' explicit live-read semantics. OAuth code exchange remains outside the ClickUp API request budget; it has no ClickUp access token and is not a task or API data request.

The telemetry observed before this correction covered only wrapper-routed requests and therefore cannot prove total production ClickUp traffic stayed within the token budget. Its 2-hour window showed an observed limit of 100/minute, no tracked 429s or failed requests, mean tracked rate wait around 1.3 seconds, and mean upstream time around 441 ms. Production verification must repeat after the complete routing change is deployed.

### Acceptance criteria

- [x] All authenticated ClickUp API calls in application source use the shared request limiter and telemetry, except the unauthenticated OAuth token exchange.
- [x] ClickUp calls marked `cache: "no-store"` bypass the shared HTTP response cache.
- [x] Strategic Alliance list discovery no longer has a fixed 20-page ceiling and uses the central complete paginated reader.
- [x] Focused post-deploy telemetry confirms the Daily Log direct-read routes are visible and no 429s occurred during the verified Sync. The sampled `/api/v2/user`, `/api/v2/task/:id`, and `/api/v2/list/:id/task` responses reported a 100/minute limit, with 85–99 requests remaining and zero retries. This verifies the sampled Sync, not every possible production ClickUp request path.
- [x] Production Daily Log live history completes within five seconds with the expected records. The authenticated October 1–14 response showed 10 activity days; its live ClickUp request trace completed within about 4.8 seconds of opening Daily Log. A fresh October 12–14 range then completed in 4.416 seconds with three activity days. ClickUp request rate-wait and upstream timings were captured in telemetry.
- [x] No Supabase schema, cache, limiter RPC, scheduler, or secret configuration was changed.

### Fast live Daily Log follow-up (2026-10-14)

Production review found the history timeline could show an already cached date while the matching editor remained on a ClickUp loading state. The browser page cache populated the timeline, but its result was not sent to the editor until the slower live request completed. A fresh September range also took about 13 seconds to display; the ClickUp requests did not start until the browser page-cache read completed. The live range request now starts before the asynchronous IndexedDB lookup, and cached history can render only as a read-only preview while that live request runs. The editor labels cached data as refreshing and keeps fields read-only until the corresponding live ClickUp response arrives. Current-user identity matching recognizes the selected member by authenticated name when ClickUp's owner ID is represented by the Daily Log parent-name convention, avoiding a redundant range fetch after automatic member selection.

Daily Log history reads and activity-only selected-day fallback reads now explicitly bypass the short server-side ClickUp cache. The activity-only fallback no longer makes an extra ClickUp List metadata request whose statuses are not displayed. The shared per-token request gate, bounded concurrency, retry handling, and telemetry remain the only ClickUp API transport; no Supabase configuration or schema is changed.

#### Acceptance criteria

- [x] Cached date history hydrates the matching Daily Log editor immediately while the live range request continues in the background.
- [x] Cached editor values are visibly marked as refreshing and cannot be edited or saved until a live response confirms the selected date.
- [x] Initial and changed Daily Log ranges request a live ClickUp refresh; cached history is used only to render a fast preview.
- [x] The live range request starts without waiting for the asynchronous browser IndexedDB cache lookup; same-user automatic member selection reuses that in-flight range read.
- [x] Activity-only selected-day fallback requests use live ClickUp data and skip unused List metadata.
- [x] Production verifies browsing among dates already in the loaded range populates the editor immediately, then the live response replaces the preview with current values; record duration and confirm no duplicate selected-day request when history covers the date. Opening October 13 from the timeline populated its four Admin entries in 319 ms, with no ClickUp API request logged for that date change after the history response loaded.
- [x] Production confirms API request telemetry for history and fallback routes includes rate-limit headers, remains within the observed token budget, and records no 429 retries during the verification window. The fresh range and selected-day requests reported a 100/minute limit, 89–98 remaining, and zero retries; the date-only navigation produced no ClickUp request.
- [x] No Supabase schema, cache configuration, limiter RPC, scheduler, or stored secret was changed.
