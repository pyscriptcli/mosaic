# Performance audit and local-first plan

**Audit baseline:** latest available GitHub `main` source at `9851292` (the isolated checkout was current with its then-configured `origin/main`). This is a source-level audit; timings need production telemetry and browser profiling to quantify.

## Phase 1 — page-by-page bottleneck audit

| Page / route | Data path and observed performance risk | Priority |
| --- | --- | --- |
| `/` and `/dashboard` | The client shell in `app/page.tsx` owns navigation and shared state. It statically loaded many large page panels, increasing first-load JavaScript. Dashboard meetings can reach ClickUp discovery on a cold cache. | High |
| `/tasks` | Browser IndexedDB and a mutation outbox already make repeat use responsive. Cold reads can still fall through to ClickUp; task creation and initial list resolution are especially sensitive to upstream latency. | High |
| `/notebook` | Client query caching exists, but the API read enumerated the full daily log from ClickUp on common loads. | High |
| My Day | Client caching exists, but KPI context and personal notes could paginate ClickUp lists during reads. Some write paths still need fresh upstream lookups. | High |
| `/meetings` | A cold load can search tags and scan teams, legacy spaces/lists, and personal lists. This is the broadest synchronous discovery path and can fan out into many network requests. | Critical |
| `/projects` and nested project routes | Client cache and IndexedDB are present; full task data is deferred for calendar use. Cache misses and explicit refreshes still depend on task/ClickUp APIs. | Medium |
| `/market-insights` | The browser query cache exists, but the API fetched the ClickUp list on each uncached read. | High |
| `/demands`, `/demands/retail`, `/demands/industrial` | Server ClickUp snapshots and staged writes are already in place. Cold-start fallback can still wait on ClickUp. | Medium |
| `/contracts` and nested routes | Mostly local folder/IndexedDB state; AI explanation is on demand. Low routine ClickUp dependence. | Low |
| `/it-projects` | Business analysis data and related meetings/tasks can trigger ClickUp reads on cache misses. | Medium |
| `/forms` | Form configuration and tracking read ClickUp; file operations happen during user actions. The user-facing list may wait on remote reads. | Medium |
| `/meetings/notetaker` and `/notetaker` | Recording recovery is local IndexedDB. Audio transcription and minute generation are intentionally remote operations. | Low for navigation; expected for processing |
| `/admin` | Separate administration/auth and Supabase paths; not on the ordinary ClickUp page path. | Low |
| `/strategic-alliance-partnership` | Public form backed by Supabase and uploads. No routine ClickUp dependency. | Low |
| `/reports` | Placeholder page; no material data-loading path observed. | Low |
| `/ba`, `/business-analysis`, `/delta` | Redirect aliases. | Low |

### Existing strengths

- `browserPageCache.ts` keeps selected page query data in memory and IndexedDB and supports cached first paint.
- `clickupReadStore.ts` provides server snapshots, shared request caching/rate limiting, and sync-job state.
- `mosaicWriteStore.ts` is a durable Supabase-first write outbox; task mutations also have a browser-side retry queue.
- Cron processing and ClickUp webhooks provide foundations for eventual background synchronization.

### Phase 1 implementation in this branch

- Added a topbar sync control with manual sync, periodic status refresh, and green/yellow/red states for synced, active, and error/offline/configuration conditions.
- Added a sync endpoint that force-queues known/requested ClickUp snapshot lists and the durable write outbox, then processes them after returning the accepted response.
- Switched Notebook, My Day, and Market Insights reads to prefer server snapshots and queue refreshes asynchronously; cold cache fallbacks remain for compatibility.
- Split major page panels into dynamic imports so navigation does not eagerly download all large panels with the root shell.
- Refreshes mounted task, My Day, and Notebook views after the sync-complete event.

### Known coverage limits

The sync control reflects configured snapshot jobs and the durable write outbox, not every legacy ClickUp-backed feature. Meetings discovery, Forms, IT Projects, and some first-time/cold-cache fallback paths can still make foreground ClickUp calls. The implementation deliberately preserves those compatibility paths; eliminating them requires domain-specific snapshots and migration/backfill coverage before removing fallback reads. Status also depends on Supabase sync tables and deployment environment configuration.

## Phase 2 — current best practices

1. **Render from a local/read model, refresh stale data in the background.** Serve a cached snapshot immediately, show its freshness, and revalidate asynchronously. Keep user interactions independent from the upstream provider. IndexedDB is suitable for structured browser data; synchronous Web Storage is best limited to small preferences/queues. [web.dev: IndexedDB app state](https://web.dev/articles/indexeddb-best-practices-app-state), [web.dev: Offline data](https://web.dev/learn/pwa/offline-data)
2. **Use durable, idempotent queues for sync.** Persist work before acknowledging it, retry transient failures with backoff, and make consumers safe for at-least-once delivery. Expose pending, failed, and last-success state separately. [Supabase Queues](https://supabase.com/docs/guides/queues), [Supabase PGMQ](https://supabase.com/docs/guides/queues/pgmq)
3. **Reduce initial client JavaScript and fetch in parallel.** Keep interactive code in Client Components, render noninteractive portions on the server where feasible, dynamically load secondary panels, and stream independent data rather than serially waiting. [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Next.js data fetching](https://nextjs.org/docs/app/getting-started/fetching-data)
4. **Bound remote work.** Replace broad discovery scans with known IDs, incremental cursors/webhooks, pagination limits, request concurrency caps, and explicit refresh. Measure request count and tail latency per page before tuning.
5. **Make freshness visible and recovery explicit.** A sync indicator should distinguish queued/running, successful through a stated time, and failed; manual retry should enqueue work without holding the UI open. Never mark green solely because the browser queue is empty while the server outbox has failures.

## Phase 3 — implementation plan

### Delivered now

1. Add global sync status and manual trigger using the existing sync-job/outbox stores.
2. Make the root shell defer large secondary panels.
3. Apply snapshot-first/background-refresh reads to Notebook, My Day, and Market Insights.
4. Refresh affected mounted pages when background synchronization completes.

### Next, ordered by user impact

1. **Meetings read model:** persist meeting/task discovery results in a per-user snapshot; incremental webhook/cursor updates; serve cached results immediately. Remove team/space/list scans from page requests only after snapshot coverage is proven.
2. **Cold-start UX:** establish a bootstrap sync after authentication and show a useful local shell with progressive empty/loading states. Avoid blocking navigation on ClickUp list discovery.
3. **Remaining ClickUp pages:** bring Forms and IT Projects onto the same per-domain snapshot/outbox contract. Inventory every direct fetch and classify reads as snapshot, deliberate action, or migration fallback.
4. **Consistency and status:** standardize idempotency keys, retry/backoff and dead-letter handling; scope status by user and data domain; show last successful sync and failed item counts.
5. **Measure and optimize:** collect route-level Web Vitals, API duration, ClickUp request count, cache hit rate, and sync lag. Set budgets for LCP/INP and cold/warm page loads, then profile the actual bottleneck before further code splitting.
6. **Reduce client rendering footprint:** progressively move static page structure and data access to Server Components where it does not compromise the offline/local-first interaction model.

### Acceptance criteria for the next sync phase

- Warm navigation renders from local/server snapshots without awaiting ClickUp.
- A forced sync returns an accepted response promptly and continues durably after response completion.
- A user can see pending/running/error/success plus last successful time; failures remain visible until recovered.
- Mutations are idempotent and survive reload/offline conditions.
- Meetings and remaining ClickUp pages have snapshot coverage before their foreground fallback is removed.
- Route-level performance measurements show improvement against a recorded baseline.
