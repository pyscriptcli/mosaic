import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TTL_MS = 5 * 60_000;
const HOT_MAX = 300;
type Entry = { body: string; status: number; statusText: string; headers: Array<[string, string]>; resourcePath: string; expiresAt: number };
const hot = new Map<string, Entry>();
let cacheUnavailableUntil = 0;
let hasLoggedCacheError = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedClient: ReturnType<typeof createClient<any>> | null = null;

function markCacheUnavailable(code?: string) {
  cacheUnavailableUntil = Date.now() + 30_000;
  if (!hasLoggedCacheError) {
    console.warn("[clickup-perf] shared cache is unavailable", code || "unknown");
    hasLoggedCacheError = true;
  }
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!sharedClient) sharedClient = createClient<any>(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(1_200) }) },
  });
  return sharedClient;
}

export function clickUpScope(token: string) { return createHash("sha256").update(token).digest("hex"); }
function cacheId(scope: string, url: string) { return `${scope}:${createHash("sha256").update(url).digest("hex")}`; }
function encryptionKey() {
  const value = process.env.CLICKUP_SYNC_ENCRYPTION_KEY || "";
  if (!value) return null;
  try { const decoded = Buffer.from(value, "base64"); if (decoded.length === 32) return decoded; } catch { /* use hex below */ }
  if (/^[a-f\d]{64}$/i.test(value)) return Buffer.from(value, "hex");
  throw new Error("CLICKUP_SYNC_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key.");
}

export function encryptClickUpToken(token: string) {
  const key = encryptionKey();
  if (!key) throw new Error("ClickUp sync encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptClickUpToken(value: string) {
  const key = encryptionKey();
  if (!key) throw new Error("ClickUp sync encryption is not configured.");
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext) throw new Error("Encrypted ClickUp connection is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function asResponse(entry: Entry) {
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers });
}

export async function readCachedClickUp(scope: string, url: string) {
  const key = cacheId(scope, url);
  const local = hot.get(key);
  if (local && local.expiresAt > Date.now()) return asResponse(local);
  if (local) hot.delete(key);
  // The HTTP cache is optional. Its circuit breaker must not take down durable
  // connection persistence or queued writes that use the same Supabase client.
  if (Date.now() < cacheUnavailableUntil) return null;
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from("echo_clickup_http_cache").select("status,status_text,headers,body,resource_path,expires_at").eq("scope_key", scope).eq("cache_key", key.slice(scope.length + 1)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) { markCacheUnavailable(error.code); return null; }
  if (!data) return null;
  const entry: Entry = { status: data.status, statusText: data.status_text || "", headers: data.headers || [], body: typeof data.body === "string" ? data.body : JSON.stringify(data.body), resourcePath: data.resource_path || "", expiresAt: new Date(data.expires_at).getTime() };
  putHot(key, entry);
  return asResponse(entry);
}

export async function reserveClickUpRequest(scope: string, intervalMs = 667) {
  const client = db();
  if (client) {
    const { data, error } = await client.rpc("echo_reserve_clickup_request", { p_scope_key: scope, p_interval_ms: intervalMs });
    if (!error && typeof data === "number") return data;
    if (error) console.warn("[clickup-perf] shared request limiter is unavailable", error.code || "unknown");
  }
  return 0;
}

function putHot(key: string, entry: Entry) {
  if (hot.size >= HOT_MAX) hot.delete(hot.keys().next().value || "");
  hot.set(key, entry);
}

export async function writeCachedClickUp(scope: string, url: string, response: Response, body: string) {
  const key = cacheId(scope, url);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const headers = Array.from(response.headers.entries()).filter(([name]) => !["set-cookie", "authorization"].includes(name.toLowerCase()));
  const resourcePath = new URL(url).pathname.replace(/^\/api\/v2(?=\/)/, "");
  const entry: Entry = { status: response.status, statusText: response.statusText, headers, body, resourcePath, expiresAt: Date.parse(expiresAt) };
  putHot(key, entry);
  const client = db();
  if (client) {
    const cacheKey = key.slice(scope.length + 1);
    void client.from("echo_clickup_http_cache").upsert({ scope_key: scope, cache_key: cacheKey, url_hash: cacheKey, resource_path: resourcePath, status: response.status, status_text: response.statusText, headers, body: JSON.parse(body), expires_at: expiresAt }, { onConflict: "scope_key,cache_key" }).then(({ error }) => { if (error) markCacheUnavailable(error.code); });
  }
}

export async function clearClickUpReadCache(scope: string, resourcePaths?: string[]) {
  const paths = resourcePaths?.filter((path) => /^\/(?:list|task|folder)\/\d+(?:\/[a-z-]+)?$/.test(path)) || [];
  for (const [key, value] of hot) if (key.startsWith(`${scope}:`) && (!paths.length || paths.some((path) => value.resourcePath.startsWith(path)))) hot.delete(key);
  const client = db();
  if (!client) return;
  const query = client.from("echo_clickup_http_cache").delete().eq("scope_key", scope);
  if (paths.length) query.or(paths.flatMap((path) => [`resource_path.like.${path}%`, `resource_path.like./api/v2${path}%`]).join(","));
  const { error } = await query;
  if (error) console.warn("[clickup-perf] shared cache invalidation failed", error.code || "unknown");
}

export async function persistClickUpConnection(token: string, userId: string) {
  const client = db();
  if (!client || !process.env.CLICKUP_SYNC_ENCRYPTION_KEY) return false;
  const encryptedToken = encryptClickUpToken(token);
  const { error } = await client.from("echo_clickup_connections").upsert({ scope_key: clickUpScope(token), user_id: userId, encrypted_token: encryptedToken, updated_at: new Date().toISOString() }, { onConflict: "scope_key" });
  if (error) { console.warn("[clickup-sync] connection persistence unavailable", error.code); return false; }
  return true;
}

export async function isClickUpSyncStorageReady() {
  const client = db();
  if (!client || !process.env.CLICKUP_SYNC_ENCRYPTION_KEY) return false;
  try {
    encryptionKey();
    const [connections, webhooks] = await Promise.all([
      client.from("echo_clickup_connections").select("scope_key").limit(1),
      client.from("echo_clickup_webhooks").select("webhook_id").limit(1),
    ]);
    return !connections.error && !webhooks.error;
  } catch { return false; }
}

export async function queueClickUpSync(token: string, userId: string, listId: string, force = false) {
  const client = db();
  if (!client || !process.env.CLICKUP_SYNC_ENCRYPTION_KEY || !listId) return false;
  // Treat the browser profile as display data only. Use ClickUp's authenticated
  // identity before assigning ownership to a durable job.
  const { clickUpCalendarFetch } = await import("@/lib/clickupCalendarApi");
  const identityResponse = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/user", undefined, undefined, { timeoutMs: 8_000 });
  if (!identityResponse.ok) return false;
  const identityPayload = await identityResponse.json().catch(() => null) as { user?: { id?: string | number } } | null;
  const verifiedUserId = String(identityPayload?.user?.id || "");
  if (!/^\d{1,24}$/.test(verifiedUserId) || !await persistClickUpConnection(token, verifiedUserId)) return false;
  const scope = clickUpScope(token);
  const { data: current } = await client.from("echo_clickup_sync_jobs").select("state,last_synced_at,next_attempt_at").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  if (current?.state === "running" || current?.state === "queued") return true;
  if (!force && current?.state === "failed") return false;
  if (!force && current?.state === "ready" && current.last_synced_at && Date.now() - Date.parse(current.last_synced_at) < 5 * 60_000) return true;
  if (!force && current?.state === "retry" && current.next_attempt_at && Date.parse(current.next_attempt_at) > Date.now()) return true;
  return Boolean(await enqueueClickUpSyncRun(scope, verifiedUserId, "scheduled", [{ id: listId, label: listId }]));
}

export async function enqueueClickUpSyncRun(scope: string, userId: string, trigger: "manual" | "webhook" | "scheduled" | "write", targets: Array<{ id: string; label: string; deletedTaskIds?: string[]; changedTaskIds?: string[] }>) {
  const client = db();
  if (!client || !targets.length) return null;
  const { data, error } = await client.rpc("echo_enqueue_clickup_sync_run", {
    p_scope_key: scope,
    p_user_id: userId,
    p_trigger: trigger,
    p_targets: targets.map(({ id, label, deletedTaskIds, changedTaskIds }) => ({
      id, label: label.slice(0, 120),
      ...(deletedTaskIds?.length ? { deletedTaskIds } : {}),
      ...(changedTaskIds?.length ? { changedTaskIds } : {}),
    })),
  });
  if (error || typeof data !== "string") {
    if (error) console.warn("[clickup-sync] run enqueue unavailable", error.code);
    return null;
  }
  return data;
}

export async function readClickUpSyncRun(scope: string, userId: string, runId: string) {
  const client = db();
  if (!client || !/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const { data, error } = await client.from("echo_clickup_sync_runs")
    .select("id,trigger,state,requested_targets,completed_targets,failed_targets,created_at,finished_at,echo_clickup_sync_run_targets(list_id,list_label,generation,state,records,last_error,updated_at)")
    .eq("id", runId).eq("scope_key", scope).eq("user_id", userId).maybeSingle();
  return error ? null : data;
}

export async function readClickUpSyncStatus(scope: string, userId: string) {
  const client = db();
  let configured = Boolean(client && process.env.CLICKUP_SYNC_ENCRYPTION_KEY);
  try { if (configured) encryptionKey(); else configured = false; } catch { configured = false; }
  if (!client || !configured) return { state: "error" as const, pendingCount: 0, failedCount: 0, lastSyncedAt: null, configured: false };

  const retryCutoff = new Date().toISOString();
  const [jobsResult, pendingResult, dueRetryResult, scheduledRetryResult, failedResult] = await Promise.all([
    client.from("echo_clickup_sync_jobs").select("state,last_synced_at,next_attempt_at,last_error").eq("scope_key", scope).eq("user_id", userId),
    client.from("mosaic_sync_outbox").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).in("state", ["queued", "running"]),
    client.from("mosaic_sync_outbox").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).eq("state", "retry").lte("next_attempt_at", retryCutoff),
    client.from("mosaic_sync_outbox").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).eq("state", "retry").gt("next_attempt_at", retryCutoff),
    client.from("mosaic_sync_outbox").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).eq("state", "failed"),
  ]);
  if (jobsResult.error || pendingResult.error || dueRetryResult.error || scheduledRetryResult.error || failedResult.error) {
    return { state: "error" as const, pendingCount: 0, failedCount: 0, lastSyncedAt: null, configured: false };
  }
  const jobs = jobsResult.data || [];
  const now = Date.now();
  const retryJobs = jobs.filter((job) => job.state === "retry");
  const dueRetryJobs = retryJobs.filter((job) => !job.next_attempt_at || Date.parse(job.next_attempt_at) <= now).length;
  const pendingJobs = jobs.filter((job) => ["queued", "running"].includes(job.state)).length + dueRetryJobs;
  const failedJobs = jobs.filter((job) => job.state === "failed").length;
  const outboxRetryDue = dueRetryResult.count || 0;
  const outboxRetryScheduled = scheduledRetryResult.count || 0;
  const failedCount = failedJobs + (failedResult.count || 0);
  const pendingCount = pendingJobs + (pendingResult.count || 0) + outboxRetryDue + outboxRetryScheduled + retryJobs.length - dueRetryJobs;
  const lastSyncedAt = jobs.map((job) => job.last_synced_at).filter(Boolean).sort().at(-1) || null;
  return {
    state: pendingCount ? "syncing" as const : failedCount ? "error" as const : "synced" as const,
    pendingCount,
    failedCount,
    retryCount: retryJobs.length + outboxRetryDue + outboxRetryScheduled,
    lastError: jobs.find((job) => job.last_error)?.last_error || null,
    lastSyncedAt,
    configured: true,
  };
}

export async function claimClickUpSyncJobs(limit = 2) {
  const client = db();
  if (!client) return [];
  const { data, error } = await client.rpc("echo_claim_clickup_sync_jobs_v2", { p_limit: Math.min(5, Math.max(1, limit)) });
  if (error) throw new Error("ClickUp sync jobs are unavailable.");
  return (data || []) as Array<{ id: number; scope_key: string; user_id: string; list_id: string; encrypted_token: string; claim_token: string; generation: number; progress_page: number; last_synced_at: string | null; last_full_sync_at: string | null; run_id: string | null }>;
}

export async function stageClickUpSyncPage(input: { jobId: number; claimToken: string; generation: number; tasks: unknown[]; nextPage: number; done: boolean; full: boolean; syncedAt: string }) {
  const client = db();
  if (!client) throw new Error("ClickUp sync storage is unavailable.");
  const { data, error } = await client.rpc("echo_stage_clickup_sync_page_v2", {
    p_job_id: input.jobId, p_claim_token: input.claimToken, p_generation: input.generation,
    p_tasks: input.tasks, p_next_page: input.nextPage, p_done: input.done,
    p_synced_at: input.syncedAt, p_full: input.full,
  });
  if (error || data !== true) throw new Error("ClickUp sync claim expired before the page could be committed.");
}

export async function releaseClickUpSyncClaim(jobId: number, claimToken: string, message?: string, retryAt?: string, terminal = false) {
  const client = db();
  if (!client) throw new Error("ClickUp sync storage is unavailable.");
  const { data, error } = await client.rpc("echo_release_clickup_sync_claim_v2", {
    p_job_id: jobId, p_claim_token: claimToken, p_error: message?.slice(0, 300) || null, p_retry_at: retryAt || null, p_terminal: terminal,
  });
  if (error || data !== true) throw new Error("ClickUp sync claim is no longer active.");
}

export async function isClickUpWorkerRequest(secret: string) {
  if (!secret) return false;
  const client = db();
  if (!client) return false;
  const { data, error } = await client.rpc("echo_verify_clickup_worker_secret", { p_secret: secret });
  return !error && data === true;
}

export async function revokeClickUpSyncConnection(scope: string) {
  const client = db();
  if (!client) return;
  await Promise.all([
    client.from("echo_clickup_task_records").delete().eq("scope_key", scope),
    client.from("echo_clickup_http_cache").delete().eq("scope_key", scope),
  ]);
  await client.from("echo_clickup_connections").delete().eq("scope_key", scope);
}

export async function purgeExpiredClickUpData() {
  const client = db();
  if (!client) return;
  await client.from("echo_clickup_http_cache").delete().lt("expires_at", new Date().toISOString());
  await client.from("echo_clickup_webhook_events").delete().lt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString();
  const { data } = await client.from("echo_clickup_connections").select("scope_key").lt("updated_at", cutoff).limit(500);
  const scopes = (data || []).map((row) => row.scope_key);
  if (scopes.length) {
    await client.from("echo_clickup_task_records").delete().in("scope_key", scopes);
    await client.from("echo_clickup_http_cache").delete().in("scope_key", scopes);
    await client.from("echo_clickup_connections").delete().in("scope_key", scopes);
  }
}

export async function registerClickUpWebhook(input: { webhookId: string; scope: string; listId: string; secret: string }) {
  const client = db();
  if (!client) throw new Error("ClickUp sync storage is not configured.");
  const { error } = await client.from("echo_clickup_webhooks").upsert({ webhook_id: input.webhookId, scope_key: input.scope, list_id: input.listId, encrypted_secret: encryptClickUpToken(input.secret), active: true }, { onConflict: "webhook_id" });
  if (error) throw new Error("Webhook registration could not be stored.");
}

export async function queueClickUpWebhookJob(scope: string, listId: string, taskId?: string, deleted = false) {
  const client = db();
  if (!client) return;
  const { data: connection } = await client.from("echo_clickup_connections").select("user_id").eq("scope_key", scope).maybeSingle();
  if (!connection?.user_id) return;
  await clearClickUpReadCache(scope, [`/list/${listId}/task`]);
  await client.from("echo_clickup_connections").update({ updated_at: new Date().toISOString() }).eq("scope_key", scope);
  const runId = await enqueueClickUpSyncRun(scope, connection.user_id, "webhook", [{
    id: listId, label: listId,
    ...(taskId ? deleted ? { deletedTaskIds: [taskId] } : { changedTaskIds: [taskId] } : {}),
  }]);
  if (!runId) throw new Error("ClickUp webhook refresh could not be queued.");
}

const USABLE_SNAPSHOT_STATES = new Set(["ready", "queued", "running", "retry", "failed"]);

export async function readClickUpTaskSnapshot(scope: string, listId: string, maxAgeMs = 24 * 60 * 60_000) {
  const client = db();
  if (!client) return null;
  const cutoff = Date.now() - maxAgeMs;
  const { data: job } = await client.from("echo_clickup_sync_jobs").select("last_synced_at,state").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  if (!job?.last_synced_at || !USABLE_SNAPSHOT_STATES.has(job.state) || Date.parse(job.last_synced_at) < cutoff) return null;
  const records: Array<{ payload: Record<string, unknown> }> = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("echo_clickup_task_records").select("payload").eq("scope_key", scope).eq("list_id", listId).order("record_id").range(from, from + pageSize - 1);
    if (error || !data) return null;
    records.push(...data as Array<{ payload: Record<string, unknown> }>);
    if (data.length < pageSize) break;
  }
  return { tasks: records.map((record) => record.payload), syncedAt: job.last_synced_at, syncState: job.state };
}

export async function loadClickUpTaskSnapshot(input: { token: string; userId?: string; listId: string; freshForMs?: number; retainForMs?: number }) {
  const freshForMs = input.freshForMs ?? 5 * 60_000;
  const scope = clickUpScope(input.token);
  const snapshot = await readClickUpTaskSnapshot(scope, input.listId, input.retainForMs ?? 30 * 24 * 60 * 60_000);
  const isFresh = Boolean(snapshot && snapshot.syncState === "ready" && Date.now() - Date.parse(snapshot.syncedAt) < freshForMs);
  if (!isFresh) await queueClickUpSync(input.token, input.userId || "", input.listId);
  const client = snapshot ? null : db();
  const { data: job } = client
    ? await client.from("echo_clickup_sync_jobs").select("state").eq("scope_key", scope).eq("list_id", input.listId).maybeSingle()
    : { data: null };
  const syncState = snapshot?.syncState || (job?.state === "ready" ? "stale" : job?.state || "queued");
  return { snapshot, isFresh, syncState };
}

export async function hasUsableClickUpTaskSnapshot(scope: string, listId: string, maxAgeMs = 24 * 60 * 60_000) {
  const client = db();
  if (!client) return false;
  const cutoff = Date.now() - maxAgeMs;
  const { data, error } = await client.from("echo_clickup_sync_jobs").select("state,last_synced_at").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  if (error || !data?.last_synced_at) return false;
  return Date.parse(data.last_synced_at) >= cutoff && USABLE_SNAPSHOT_STATES.has(data.state);
}

export async function readClickUpTaskSyncCursor(scope: string, listId: string) {
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from("echo_clickup_sync_jobs").select("last_synced_at").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  return error ? null : data?.last_synced_at || null;
}

export async function removeClickUpTaskSnapshotRecord(scope: string, listId: string, taskId: string) {
  const client = db();
  if (!client) return false;
  const { error } = await client.from("echo_clickup_task_records").delete().eq("scope_key", scope).eq("list_id", listId).eq("record_id", taskId);
  return !error;
}

export async function invalidateClickUpSync(scope: string, listId?: string) {
  const client = db();
  if (!client) return;
  await clearClickUpReadCache(scope, listId ? [`/list/${listId}/task`] : undefined);
  const [{ data: connection, error: connectionError }, jobsResult] = await Promise.all([
    client.from("echo_clickup_connections").select("user_id").eq("scope_key", scope).maybeSingle(),
    listId ? Promise.resolve({ data: [{ list_id: listId }], error: null }) : client.from("echo_clickup_sync_jobs").select("list_id").eq("scope_key", scope),
  ]);
  if (connectionError || jobsResult.error || !connection?.user_id) throw new Error("ClickUp changes could not be queued for refresh.");
  const targets = (jobsResult.data || []).map((job) => ({ id: String(job.list_id), label: String(job.list_id) }));
  if (targets.length) {
    const runId = await enqueueClickUpSyncRun(scope, connection.user_id, "write", targets);
    if (!runId) throw new Error("ClickUp changes could not be queued for refresh.");
  }
}

export async function loadClickUpWebhook(webhookId: string) {
  const client = db();
  if (!client) return null;
  const { data } = await client.from("echo_clickup_webhooks").select("scope_key,list_id,encrypted_secret").eq("webhook_id", webhookId).eq("active", true).maybeSingle();
  return data as { scope_key: string; list_id: string; encrypted_secret: string } | null;
}

export async function recordClickUpWebhookEvent(webhookId: string, eventKey: string) {
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from("echo_clickup_webhook_events").upsert({ webhook_id: webhookId, event_key: eventKey }, { onConflict: "webhook_id,event_key", ignoreDuplicates: true }).select("webhook_id").maybeSingle();
  if (error) return null;
  return Boolean(data);
}

export async function forgetClickUpWebhookEvent(webhookId: string, eventKey: string) {
  const client = db();
  if (!client) return;
  await client.from("echo_clickup_webhook_events").delete().eq("webhook_id", webhookId).eq("event_key", eventKey);
}
