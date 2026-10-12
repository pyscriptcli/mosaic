import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TTL_MS = 5 * 60_000;
const HOT_MAX = 300;
type Entry = { body: string; status: number; statusText: string; headers: Array<[string, string]>; resourcePath: string; expiresAt: number };
const hot = new Map<string, Entry>();
let databaseUnavailableUntil = 0;
let hasLoggedDatabaseError = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedClient: ReturnType<typeof createClient<any>> | null = null;

function markDatabaseUnavailable(code?: string) {
  databaseUnavailableUntil = Date.now() + 30_000;
  if (!hasLoggedDatabaseError) {
    console.warn("[clickup-perf] shared cache is unavailable", code || "unknown");
    hasLoggedDatabaseError = true;
  }
}

function db() {
  if (Date.now() < databaseUnavailableUntil) return null;
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
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from("echo_clickup_http_cache").select("status,status_text,headers,body,resource_path,expires_at").eq("scope_key", scope).eq("cache_key", key.slice(scope.length + 1)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) { markDatabaseUnavailable(error.code); return null; }
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
    if (error) markDatabaseUnavailable(error.code);
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
  const resourcePath = new URL(url).pathname;
  const entry: Entry = { status: response.status, statusText: response.statusText, headers, body, resourcePath, expiresAt: Date.parse(expiresAt) };
  putHot(key, entry);
  const client = db();
  if (client) {
    const cacheKey = key.slice(scope.length + 1);
    void client.from("echo_clickup_http_cache").upsert({ scope_key: scope, cache_key: cacheKey, url_hash: cacheKey, resource_path: resourcePath, status: response.status, status_text: response.statusText, headers, body: JSON.parse(body), expires_at: expiresAt }, { onConflict: "scope_key,cache_key" }).then(({ error }) => { if (error) markDatabaseUnavailable(error.code); });
  }
}

export async function clearClickUpReadCache(scope: string, resourcePaths?: string[]) {
  const paths = resourcePaths?.filter((path) => /^\/(?:list|task|folder)\/\d+(?:\/[a-z-]+)?$/.test(path)) || [];
  for (const [key, value] of hot) if (key.startsWith(`${scope}:`) && (!paths.length || paths.some((path) => value.resourcePath.startsWith(path)))) hot.delete(key);
  const client = db();
  if (!client) return;
  const query = client.from("echo_clickup_http_cache").delete().eq("scope_key", scope);
  if (paths.length) query.or(paths.map((path) => `resource_path.like.${path}%`).join(","));
  await query;
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

export async function queueClickUpSync(token: string, userId: string, listId: string) {
  const client = db();
  if (!client || !process.env.CLICKUP_SYNC_ENCRYPTION_KEY || !listId) return;
  if (!await persistClickUpConnection(token, userId)) return;
  const scope = clickUpScope(token);
  const { data: current } = await client.from("echo_clickup_sync_jobs").select("state,last_synced_at,next_attempt_at").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  if (current?.state === "running" || current?.state === "queued") return;
  if (current?.state === "ready" && current.last_synced_at && Date.now() - Date.parse(current.last_synced_at) < 5 * 60_000) return;
  if (current?.state === "retry" && current.next_attempt_at && Date.parse(current.next_attempt_at) > Date.now()) return;
  const { error } = await client.from("echo_clickup_sync_jobs").upsert({ scope_key: scope, user_id: userId, list_id: listId, state: "queued", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "scope_key,list_id" });
  if (error) console.warn("[clickup-sync] job enqueue unavailable", error.code);
}

export async function claimClickUpSyncJobs(limit = 2) {
  const client = db();
  if (!client) return [];
  const { data, error } = await client.rpc("echo_claim_clickup_sync_jobs", { p_limit: Math.min(5, Math.max(1, limit)) });
  if (error) throw new Error("ClickUp sync jobs are unavailable.");
  return (data || []) as Array<{ id: number; scope_key: string; user_id: string; list_id: string; encrypted_token: string }>;
}

export async function completeClickUpSyncJob(jobId: number, scope: string, listId: string, tasks: unknown[], syncedAt = new Date().toISOString()) {
  const client = db();
  if (!client) return;
  const { error } = await client.rpc("echo_publish_clickup_task_snapshot", { p_job_id: jobId, p_scope_key: scope, p_list_id: listId, p_tasks: tasks, p_synced_at: syncedAt });
  if (error) throw new Error("ClickUp snapshot could not be published.");
}

export async function failClickUpSyncJob(jobId: number, message: string) {
  const client = db();
  if (!client) return;
  await client.rpc("echo_fail_clickup_sync_job", { p_job_id: jobId, p_error: message.slice(0, 300) });
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

export async function queueClickUpWebhookJob(scope: string, listId: string) {
  const client = db();
  if (!client) return;
  const { data: connection } = await client.from("echo_clickup_connections").select("user_id").eq("scope_key", scope).maybeSingle();
  if (!connection?.user_id) return;
  await clearClickUpReadCache(scope, [`/list/${listId}/task`]);
  await client.from("echo_clickup_connections").update({ updated_at: new Date().toISOString() }).eq("scope_key", scope);
  await client.from("echo_clickup_sync_jobs").upsert({ scope_key: scope, user_id: connection.user_id, list_id: listId, state: "queued", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "scope_key,list_id" });
}

const USABLE_SNAPSHOT_STATES = new Set(["ready", "queued", "running", "retry", "failed"]);

export async function readClickUpTaskSnapshot(scope: string, listId: string, maxAgeMs = 24 * 60 * 60_000) {
  const client = db();
  if (!client) return null;
  const cutoff = Date.now() - maxAgeMs;
  const { data: job } = await client.from("echo_clickup_sync_jobs").select("last_synced_at,state").eq("scope_key", scope).eq("list_id", listId).maybeSingle();
  if (!job?.last_synced_at || !USABLE_SNAPSHOT_STATES.has(job.state) || Date.parse(job.last_synced_at) < cutoff) return null;
  const { data, error } = await client.from("echo_clickup_task_records").select("payload").eq("scope_key", scope).eq("list_id", listId).order("record_id").limit(3001);
  if (error || !data || data.length > 3000) return null;
  return { tasks: data.map((record) => record.payload as Record<string, unknown>), syncedAt: job.last_synced_at, syncState: job.state };
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

export async function completeClickUpTaskDelta(jobId: number, scope: string, listId: string, tasks: unknown[], syncedAt: string) {
  const client = db();
  if (!client) throw new Error("ClickUp sync storage is unavailable.");
  const records = tasks.flatMap((task) => {
    if (!task || typeof task !== "object" || !("id" in task) || !String((task as { id?: unknown }).id || "")) return [];
    return [{ scope_key: scope, list_id: listId, record_id: String((task as { id: unknown }).id), payload: task, synced_at: syncedAt }];
  });
  for (let offset = 0; offset < records.length; offset += 500) {
    const { error } = await client.from("echo_clickup_task_records").upsert(records.slice(offset, offset + 500), { onConflict: "scope_key,list_id,record_id" });
    if (error) throw new Error("ClickUp task changes could not be saved.");
  }
  const { data, error } = await client.from("echo_clickup_sync_jobs").update({ state: "ready", last_synced_at: syncedAt, last_error: null, lease_until: null, updated_at: syncedAt }).eq("id", jobId).eq("scope_key", scope).eq("list_id", listId).eq("state", "running").select("id").maybeSingle();
  if (error || !data) throw new Error("ClickUp sync lease is no longer valid.");
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
  await client.rpc("echo_invalidate_clickup_sync", { p_scope_key: scope, p_list_id: listId || null });
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
