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
- [ ] Run and record the applicable staging failure/acceptance scenarios; these were not run in this environment.
- [ ] Commit only ClickUp sync task files, push the intended branch, and verify the hosted deployment for that commit reaches a successful terminal state.
