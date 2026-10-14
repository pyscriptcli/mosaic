import { createHash } from "node:crypto";
import { after } from "next/server";
import { clickUpScope, clearClickUpReadCache, invalidateClickUpSync, readCachedClickUp, reserveClickUpRequest, writeCachedClickUp } from "@/lib/clickupReadStore";
import { recordTelemetry } from "@/lib/telemetry";
import { getClickUpSyncContext } from "@/lib/clickupSyncContext";

const RATE_INTERVAL_MS = Math.max(667, Number(process.env.CLICKUP_MIN_REQUEST_INTERVAL_MS) || 667);
const MAX_ACTIVE_PER_TOKEN = 3;
const localNextAt = new Map<string, number>();
const observedRateInterval = new Map<string, number>();
const localStartQueues = new Map<string, Promise<void>>();
const activeByToken = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();
const inFlightGets = new Map<string, Promise<Response>>();
const liveTaskListReads = new Map<string, Promise<unknown[]>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function safeEndpoint(input: string | URL) {
  const idFollowing = new Set(["task", "list", "folder", "space", "team", "webhook", "goal", "comment", "doc", "view"]);
  let previous = "";
  return new URL(String(input)).pathname.split("/").map((part) => {
    const safePart = /^\d+$/.test(part) || idFollowing.has(previous) ? ":id" : part;
    previous = safePart;
    return safePart;
  }).join("/");
}

function scheduleClickUpTelemetry(event: Parameters<typeof recordTelemetry>[0]) {
  const context = getClickUpSyncContext();
  const correlatedEvent = context ? {
    ...event,
    userId: event.userId || context.userId,
    metadata: { ...event.metadata, syncRunId: context.runId || undefined, syncListId: context.listId },
  } : event;
  try { after(() => recordTelemetry(correlatedEvent)); } catch { /* Some non-request callers have no Next after context. */ }
}

async function acquire(scope: string) {
  while ((activeByToken.get(scope) || 0) >= MAX_ACTIVE_PER_TOKEN) {
    await new Promise<void>((resolve) => {
      const queue = waiters.get(scope) || [];
      queue.push(resolve);
      waiters.set(scope, queue);
    });
  }
  activeByToken.set(scope, (activeByToken.get(scope) || 0) + 1);
}

function release(scope: string) {
  activeByToken.set(scope, Math.max(0, (activeByToken.get(scope) || 1) - 1));
  waiters.get(scope)?.shift()?.();
}

async function reserveStart(scope: string) {
  let waitMs = 0;
  const intervalMs = observedRateInterval.get(scope) || RATE_INTERVAL_MS;
  try { waitMs = await reserveClickUpRequest(scope, intervalMs); } catch { /* shared DB may be offline; keep a process-local limit */ }
  await sleep(waitMs);
  const previous = localStartQueues.get(scope) || Promise.resolve();
  const reservation = previous.catch(() => undefined).then(async () => {
    const interval = observedRateInterval.get(scope) || RATE_INTERVAL_MS;
    await sleep(Math.max(0, (localNextAt.get(scope) || 0) - Date.now()));
    localNextAt.set(scope, Date.now() + interval);
  });
  localStartQueues.set(scope, reservation.catch(() => undefined));
  await reservation;
}

function retryDelay(response: Response, attempt: number) {
  const retryAfterHeader = response.headers.get("Retry-After") || "";
  const retryAfterSeconds = Number(retryAfterHeader);
  const retryAfterDate = Date.parse(retryAfterHeader);
  const retryAfter = retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : Number.isFinite(retryAfterDate) ? Math.max(0, retryAfterDate - Date.now()) : 0;
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  const serverDelay = retryAfter > 0 ? retryAfter : reset > Date.now() / 1000 ? reset * 1000 - Date.now() : 0;
  return serverDelay > 0 ? serverDelay + 250 : Math.min(30_000, 500 * (2 ** attempt) + Math.random() * 250);
}

async function clickUpRequest(token: string, input: string | URL, init?: RequestInit, options: { maxRateLimitRetries?: number; timeoutMs?: number } = {}) {
  const scope = clickUpScope(token);
  const requestQueuedAt = Date.now();
  const endpoint = safeEndpoint(input);
  const queuedAt = Date.now();
  await acquire(scope);
  const queueWaitMs = Date.now() - queuedAt;
  const rateWaitStartedAt = Date.now();
  let response: Response;
  let retries = 0;
  try {
    await reserveStart(scope);
    const rateWaitMs = Date.now() - rateWaitStartedAt;
    const requestStartedAt = Date.now();
    let upstreamMs = 0;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", token);
    const send = () => fetch(input, {
      ...init,
      headers,
      cache: "no-store",
      signal: init?.signal || (options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined),
    });
    const upstreamStartedAt = Date.now();
    response = await send();
    upstreamMs += Date.now() - upstreamStartedAt;
    const observeRateLimit = (result: Response) => {
      const limit = Number(result.headers.get("X-RateLimit-Limit"));
      if (Number.isFinite(limit) && limit > 0) {
        // Keep 10% headroom for other clients using this ClickUp token.
        observedRateInterval.set(scope, Math.max(RATE_INTERVAL_MS, Math.ceil(60_000 * 1.1 / limit)));
      }
    };
    observeRateLimit(response);
    for (let attempt = 0; response.status === 429 && attempt < (options.maxRateLimitRetries ?? 3); attempt += 1) {
      retries += 1;
      await sleep(retryDelay(response, attempt));
      await reserveStart(scope);
      const retryStartedAt = Date.now();
      response = await send();
      observeRateLimit(response);
      upstreamMs += Date.now() - retryStartedAt;
    }
    if (process.env.CLICKUP_PERF_LOGS === "true") {
      console.info("[clickup-perf]", JSON.stringify({ path: endpoint, method: (init?.method || "GET").toUpperCase(), queueWaitMs, rateWaitMs, upstreamMs, retries, status: response.status, rateLimit: response.headers.get("X-RateLimit-Limit"), limitRemaining: response.headers.get("X-RateLimit-Remaining"), resetAt: response.headers.get("X-RateLimit-Reset") }));
    }
    scheduleClickUpTelemetry({
      source: "clickup",
      operation: "clickup_request",
      processingMs: Date.now() - requestStartedAt,
      queueMs: queueWaitMs,
      retryCount: retries,
      success: response.ok,
      errorCategory: response.ok ? undefined : `http_${response.status}`,
      metadata: { endpoint, method: (init?.method || "GET").toUpperCase(), rateWaitMs, upstreamMs, status: response.status, rateLimit: response.headers.get("X-RateLimit-Limit"), rateLimitRemaining: response.headers.get("X-RateLimit-Remaining"), rateLimitReset: response.headers.get("X-RateLimit-Reset") },
    });
  } catch (error) {
    scheduleClickUpTelemetry({
      source: "clickup",
      operation: "clickup_request",
      processingMs: Date.now() - requestQueuedAt,
      queueMs: queueWaitMs,
      success: false,
      errorCategory: "network_error",
      metadata: { endpoint, method: (init?.method || "GET").toUpperCase() },
    });
    throw error;
  } finally { release(scope); }
  return response;
}

export async function clickUpCalendarFetch(token: string, input: string | URL, init?: RequestInit, invalidatePaths?: string[], options: { skipCache?: boolean; maxRateLimitRetries?: number; timeoutMs?: number } = {}) {
  const url = String(input);
  const method = (init?.method || "GET").toUpperCase();
  const scope = clickUpScope(token);
  if (method !== "GET") {
    const response = await clickUpRequest(token, input, init, options);
    const listIds = Array.from(new Set((invalidatePaths || []).map((path) => path.match(/^\/list\/(\d+)\/task/)?.[1]).filter((id): id is string => Boolean(id))));
    if (listIds.length) await Promise.all(listIds.map((listId) => invalidateClickUpSync(scope, listId)));
    else await invalidateClickUpSync(scope);
    return response;
  }
  const key = `${scope}:${digest(url)}`;
  const pending = options.skipCache ? null : inFlightGets.get(key);
  if (pending) {
    scheduleClickUpTelemetry({ source: "clickup", operation: "clickup_cache_hit", processingMs: 0, success: true, metadata: { endpoint: safeEndpoint(url), cacheState: "inflight" } });
    return (await pending).clone();
  }
  const request = (async () => {
    const cached = options.skipCache ? null : await readCachedClickUp(scope, url).catch(() => null);
    if (cached) {
      scheduleClickUpTelemetry({ source: "clickup", operation: "clickup_cache_hit", processingMs: 0, success: true, metadata: { endpoint: safeEndpoint(url), cacheState: "stored" } });
      if (process.env.CLICKUP_PERF_LOGS === "true") console.info("[clickup-perf]", JSON.stringify({ path: new URL(url).pathname, method: "GET", cache: "hit" }));
      return cached;
    }
    const response = await clickUpRequest(token, input, init, options);
    if (!response.ok) return response;
    const body = await response.clone().text();
    await writeCachedClickUp(scope, url, response, body);
    return response;
  })();
  if (!options.skipCache) inFlightGets.set(key, request);
  try { return (await request).clone(); } finally { if (!options.skipCache) inFlightGets.delete(key); }
}

/** Route ClickUp traffic through one cache, rate budget, and concurrency limiter. */
export async function clickUpFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("https://api.clickup.com/")) return fetch(input, init);
  const headers = new Headers(init?.headers || (typeof input === "object" && "headers" in input ? input.headers : undefined));
  const token = headers.get("Authorization") || "";
  if (!token) return fetch(input, init);
  return clickUpCalendarFetch(token, url, init);
}

/** Read a complete live ClickUp list without serving the Supabase/HTTP response cache. */
export async function fetchAllClickUpListTasks<T = Record<string, unknown>>(
  token: string,
  listId: string,
  options: { assignees?: string[]; includeClosed?: boolean; includeMarkdownDescription?: boolean; includeSubtasks?: boolean; timeoutMs?: number } = {},
): Promise<T[]> {
  const scope = clickUpScope(token);
  const includeSubtasks = options.includeSubtasks !== false;
  const assigneeKey = [...new Set((options.assignees || []).filter(Boolean))].sort().join(",") || "all-assignees";
  const key = `${scope}:live-list:${listId}:${options.includeClosed === false ? "open" : "closed"}:${includeSubtasks ? "with-subtasks" : "parents-only"}:${options.includeMarkdownDescription ? "markdown" : "plain"}:${assigneeKey}`;
  const existing = liveTaskListReads.get(key);
  if (existing) return existing as Promise<T[]>;

  const read = (async () => {
    const fetchPage = async (page: number) => {
      const url = new URL(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task`);
      url.searchParams.set("include_closed", String(options.includeClosed !== false));
      url.searchParams.set("subtasks", String(includeSubtasks));
      url.searchParams.set("include_timl", "true");
      for (const assigneeId of options.assignees || []) url.searchParams.append("assignees[]", assigneeId);
      if (options.includeMarkdownDescription) url.searchParams.set("include_markdown_description", "true");
      url.searchParams.set("page", String(page));
      const response = await clickUpCalendarFetch(token, url, undefined, undefined, {
        skipCache: true,
        timeoutMs: options.timeoutMs ?? 12_000,
      });
      const body = await response.json().catch(() => null) as { tasks?: unknown; last_page?: unknown; err?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.err || body?.error || `ClickUp returned ${response.status} while loading list ${listId}.`);
      if (!body || !Array.isArray(body.tasks)) throw new Error(`ClickUp returned an invalid task page for list ${listId}.`);
      return { tasks: body.tasks as T[], lastPage: body.last_page === true };
    };

    const all: T[] = [];
    const first = await fetchPage(0);
    all.push(...first.tasks);
    if (first.lastPage || first.tasks.length < 100) return all;

    // Small parallel page windows keep total latency down while the shared
    // per-token request gate stays below ClickUp's lowest documented limit.
    let nextPage = 1;
    while (true) {
      const pages = await Promise.all([nextPage, nextPage + 1, nextPage + 2].map(fetchPage));
      let complete = false;
      for (const page of pages) {
        all.push(...page.tasks);
        if (page.lastPage || page.tasks.length < 100) { complete = true; break; }
      }
      if (complete) return all;
      nextPage += pages.length;
    }
  })();
  liveTaskListReads.set(key, read);
  try { return await read as T[]; }
  finally { liveTaskListReads.delete(key); }
}

export function clearClickUpCalendarCache(token: string, resourcePaths?: string[]) {
  void clearClickUpReadCache(clickUpScope(token), resourcePaths);
}
