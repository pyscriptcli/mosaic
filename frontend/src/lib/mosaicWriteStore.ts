import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import {
  clickUpScope,
  decryptClickUpToken,
  persistClickUpConnection,
} from "@/lib/clickupReadStore";

const CLICKUP_PATH = /^\/(?:task\/[A-Za-z0-9_-]+(?:\/(?:field\/[A-Za-z0-9_-]+|tag(?:\/private)?|comment))?|list\/\d+\/task(?:\/[A-Za-z0-9_-]+)?|space\/\d+\/list)$/;
const MAX_JSON_BYTES = 1_000_000;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type MosaicWriteOperation = "create" | "update" | "delete";
export type MosaicWriteMethod = "POST" | "PUT" | "DELETE";

export interface StageMosaicWriteInput {
  token: string;
  ownerUserId: string;
  domain: string;
  recordId: string;
  listId?: string | null;
  recordData: JsonValue;
  operation: MosaicWriteOperation;
  method: MosaicWriteMethod;
  resourcePath: string;
  requestBody?: JsonValue;
}

type ClaimedWrite = {
  id: number;
  request_id: string;
  owner_user_id: string;
  scope_key: string;
  domain: string;
  record_id: string;
  operation: MosaicWriteOperation;
  http_method: MosaicWriteMethod;
  resource_path: string;
  request_body: Record<string, unknown>;
  clickup_id: string | null;
  attempts: number;
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase write staging is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }) },
  });
}

function jsonBytes(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Record data must be JSON serializable.");
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_JSON_BYTES) throw new Error("This record is too large to stage.");
  return serialized;
}

export function addMosaicSyncMarker(content: string, requestId: string) {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), _mosaicSyncRequest: requestId }, null, 2);
    }
  } catch { /* plain text descriptions use an HTML comment marker */ }
  return `${content}${content ? "\n\n" : ""}<!-- mosaic-sync-request:${requestId} -->`;
}

export async function stageMosaicWrite(input: StageMosaicWriteInput) {
  if (!input.token.trim() || !input.ownerUserId.trim()) throw new Error("A signed-in ClickUp account is required.");
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(input.domain) || !input.recordId.trim()) throw new Error("A valid record identity is required.");
  if (!CLICKUP_PATH.test(input.resourcePath)) throw new Error("This ClickUp write is not supported by the background sync queue.");
  if (input.operation === "delete" && input.method !== "DELETE") throw new Error("Delete requests must use DELETE.");
  if (input.operation === "create" && input.method !== "POST") throw new Error("Create requests must use POST.");
  jsonBytes(input.recordData);
  const requestBody = input.requestBody ?? {};
  jsonBytes(requestBody);

  const scopeKey = clickUpScope(input.token);
  const db = client();
  const { data: existingConnection, error: lookupError } = await db
    .from("echo_clickup_connections")
    .select("user_id")
    .eq("scope_key", scopeKey)
    .maybeSingle();
  if (lookupError) throw new Error("Could not verify the connected ClickUp account for background sync.");
  if (existingConnection?.user_id && String(existingConnection.user_id) !== input.ownerUserId) {
    throw new Error("This ClickUp connection belongs to a different signed-in account.");
  }
  if (!await persistClickUpConnection(input.token, input.ownerUserId)) {
    throw new Error("Background sync credentials are not configured.");
  }

  const requestId = randomUUID();
  const { data, error } = await db.rpc("echo_stage_mosaic_request", {
    p_request_id: requestId,
    p_owner_user_id: input.ownerUserId,
    p_scope_key: scopeKey,
    p_domain: input.domain,
    p_record_id: input.recordId,
    p_list_id: input.listId || "",
    p_record_data: input.recordData,
    p_operation: input.operation,
    p_http_method: input.method,
    p_resource_path: input.resourcePath,
    p_request_body: requestBody,
  });
  if (error || typeof data !== "number") {
    console.error("[mosaic-sync] could not stage record", error?.code || "unknown");
    throw new Error("Mosaic could not save this change. Try again.");
  }
  return { jobId: data, requestId, recordId: input.recordId, scopeKey };
}

async function findCreatedTask(token: string, job: ClaimedWrite, marker: string) {
  const listMatch = job.resource_path.match(/^\/list\/(\d+)\/task$/);
  if (!listMatch) return null;
  for (let page = 0; page < 30; page += 1) {
    const url = new URL(`https://api.clickup.com/api/v2${job.resource_path}`);
    url.searchParams.set("include_closed", "true");
    url.searchParams.set("include_markdown_description", "true");
    url.searchParams.set("page", String(page));
    const response = await clickUpCalendarFetch(token, url, undefined, undefined, { skipCache: true });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({})) as { tasks?: Array<Record<string, unknown>> };
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const existing = tasks.find((task) => {
      const text = `${task.description || ""}\n${task.markdown_description || ""}\n${task.text_content || ""}`;
      return text.includes(marker) || (text.includes('"_mosaicSyncRequest"') && text.includes(job.request_id));
    });
    if (existing) return existing;
    if (tasks.length < 100) return null;
  }
  return null;
}

async function processOne(db: ReturnType<typeof client>, job: ClaimedWrite) {
  try {
    const { data: connection, error: connectionError } = await db
      .from("echo_clickup_connections")
      .select("user_id,encrypted_token")
      .eq("scope_key", job.scope_key)
      .maybeSingle();
    if (connectionError || !connection?.encrypted_token || String(connection.user_id) !== job.owner_user_id) {
      await db.rpc("echo_fail_mosaic_sync_write", { p_job_id: job.id, p_error: "[permanent]No matching encrypted ClickUp connection is available." });
      return { synced: false, jobId: job.id, reason: "connection-unavailable" };
    }
    const token = decryptClickUpToken(String(connection.encrypted_token));
    const { data: stagedRecord } = await db
      .from("mosaic_staged_records")
      .select("clickup_id")
      .eq("scope_key", job.scope_key)
      .eq("domain", job.domain)
      .eq("record_id", job.record_id)
      .maybeSingle();
    const stableRemoteId = String(stagedRecord?.clickup_id || job.clickup_id || "");
    const resourcePath = stableRemoteId && stableRemoteId !== job.record_id
      ? job.resource_path.replaceAll(`/task/${job.record_id}`, `/task/${stableRemoteId}`)
      : job.resource_path;
    const body = { ...(job.request_body || {}) };
    let existingTask: Record<string, unknown> | null = null;
    const marker = `<!-- mosaic-sync-request:${job.request_id} -->`;
    if (job.operation === "create") {
      if (job.attempts > 1) existingTask = await findCreatedTask(token, job, marker);
      if (existingTask) {
        const remoteId = String(existingTask.id || "");
        const { error } = await db.rpc("echo_complete_mosaic_sync_write", { p_job_id: job.id, p_clickup_id: remoteId || null });
        if (error) throw new Error("Could not complete the staged write.");
        return { synced: true, jobId: job.id, deduplicated: true };
      }
      const contentField = typeof body.markdown_content === "string" ? "markdown_content" : "description";
      const description = typeof body[contentField] === "string" ? String(body[contentField]) : "";
      body[contentField] = addMosaicSyncMarker(description, job.request_id);
    }
    if (typeof body.parent === "string" && body.parent) {
      let { data: parentRecord } = await db.from("mosaic_staged_records")
        .select("clickup_id")
        .eq("scope_key", job.scope_key)
        .eq("domain", job.domain)
        .eq("record_id", body.parent)
        .maybeSingle();
      if (!parentRecord) {
        const fallback = await db.from("mosaic_staged_records")
          .select("clickup_id")
          .eq("scope_key", job.scope_key)
          .eq("record_id", body.parent)
          .limit(1)
          .maybeSingle();
        parentRecord = fallback.data;
      }
      if (parentRecord?.clickup_id) body.parent = parentRecord.clickup_id;
    }
    const response = await clickUpCalendarFetch(
      token,
      `https://api.clickup.com/api/v2${resourcePath}`,
      { method: job.http_method, headers: { "Content-Type": "application/json" }, ...(job.http_method === "DELETE" ? {} : { body: JSON.stringify(body) }) },
      [resourcePath.startsWith("/list/") ? resourcePath.replace(/\/task(?:\/.*)?$/, "/task") : resourcePath.replace(/\/field\/.*$|\/(?:tag(?:\/private)?|comment)$/, "")],
    );
    if (!response.ok && !(job.operation === "delete" && response.status === 404)) {
      const permanent = [400,401,403,404,422].includes(response.status);
      await db.rpc("echo_fail_mosaic_sync_write", {
        p_job_id: job.id,
        p_error: `${permanent ? "[permanent]" : ""}ClickUp returned ${response.status}.`,
      });
      return { synced: false, jobId: job.id, status: response.status };
    }
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const clickupId = String(result.id || job.clickup_id || job.record_id);
    const { error } = await db.rpc("echo_complete_mosaic_sync_write", { p_job_id: job.id, p_clickup_id: clickupId });
    if (error) throw new Error("Could not complete the staged write.");
    return { synced: true, jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background sync failed.";
    await db.rpc("echo_fail_mosaic_sync_write", { p_job_id: job.id, p_error: message.slice(0, 900) });
    console.warn("[mosaic-sync] queued record will retry", { jobId: job.id, message });
    return { synced: false, jobId: job.id, reason: "retry-scheduled" };
  }
}

export async function processMosaicWriteOutbox(limit = 15) {
  const db = client();
  const { data, error } = await db.rpc("echo_claim_mosaic_sync_requests", { p_limit: limit });
  if (error) {
    console.error("[mosaic-sync] queue claim failed", error.code || "unknown");
    throw new Error("Mosaic background sync queue is unavailable.");
  }
  const jobs = (Array.isArray(data) ? data : []) as ClaimedWrite[];
  const results = await Promise.all(jobs.map((job) => processOne(db, job)));
  return results;
}

export function scheduleMosaicWriteSync(afterSync?: () => Promise<void>) {
  after(async () => {
    try {
      for (let batch = 0; batch < 8; batch += 1) {
        const results = await processMosaicWriteOutbox(15);
        if (!results.length) break;
      }
      await afterSync?.();
    } catch (error) {
      console.warn("[mosaic-sync] staged writes remain queued", error instanceof Error ? error.message : "queue unavailable");
    }
  });
}

export async function readStagedMosaicRecords(scopeKey: string, domain: string, listId: string) {
  const freshAfter = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await client()
    .from("mosaic_staged_records")
    .select("record_id,clickup_id,list_id,record_data,sync_state,is_deleted,last_sync_error,updated_at")
    .eq("scope_key", scopeKey)
    .eq("domain", domain)
    .eq("list_id", listId)
    .or(`sync_state.neq.synced,is_deleted.eq.true,updated_at.gte.${freshAfter}`);
  if (error) throw new Error("Could not load staged Mosaic records.");
  return Array.isArray(data) ? data : [];
}

export function mergeStagedClickUpTasks<T extends Record<string, unknown>>(
  clickUpTasks: T[],
  stagedRows: Array<Record<string, unknown>>,
): T[] {
  const tasks = new Map<string, T>(clickUpTasks.map((task) => [String(task.id || ""), task]));
  for (const row of stagedRows) {
    const recordId = String(row.record_id || "");
    const clickUpId = String(row.clickup_id || recordId);
    if (!recordId || !clickUpId) continue;
    if (row.is_deleted === true) {
      tasks.delete(clickUpId);
      tasks.delete(recordId);
      continue;
    }
    const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
    const existing = tasks.get(clickUpId);
    const status = data.status && typeof data.status === "object"
      ? data.status
      : typeof data.status === "string" ? { status: data.status } : undefined;
    const priority = typeof data.priority === "number"
      ? { id: String(data.priority) }
      : data.priority && typeof data.priority === "object" ? data.priority : undefined;
    const projected = {
      ...(existing || {}),
      ...data,
      id: clickUpId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(row.list_id ? { list: { id: row.list_id } } : {}),
      _mosaicSyncState: row.sync_state,
      _mosaicSyncError: row.last_sync_error,
    } as unknown as T;
    tasks.set(clickUpId, projected);
  }
  return Array.from(tasks.values());
}

export async function findStagedMosaicRecord(scopeKey: string, domain: string, recordId: string) {
  const db = client();
  const byRecord = await db
    .from("mosaic_staged_records")
    .select("owner_user_id,record_id,clickup_id,list_id,record_data,sync_state,is_deleted")
    .eq("scope_key", scopeKey)
    .eq("domain", domain)
    .eq("record_id", recordId)
    .maybeSingle();
  if (byRecord.error) throw new Error("Could not verify this staged record.");
  if (byRecord.data) return byRecord.data;
  const byClickUpId = await db
    .from("mosaic_staged_records")
    .select("owner_user_id,record_id,clickup_id,list_id,record_data,sync_state,is_deleted")
    .eq("scope_key", scopeKey)
    .eq("domain", domain)
    .eq("clickup_id", recordId)
    .maybeSingle();
  if (byClickUpId.error) throw new Error("Could not verify this staged record.");
  return byClickUpId.data || null;
}

export async function retryFailedMosaicWrite(input: { token: string; ownerUserId: string; domain: string; recordId: string }) {
  const scopeKey = clickUpScope(input.token);
  const staged = await findStagedMosaicRecord(scopeKey, input.domain, input.recordId);
  if (!staged || staged.sync_state !== "failed" || !staged.list_id) return null;
  const { data: failedJob, error } = await client().from("mosaic_sync_outbox")
    .select("operation,http_method,resource_path,request_body")
    .eq("scope_key", scopeKey).eq("domain", input.domain).eq("record_id", input.recordId).eq("state", "failed")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error || !failedJob) return null;
  return stageMosaicWrite({
    token: input.token, ownerUserId: input.ownerUserId, domain: input.domain, recordId: input.recordId,
    listId: String(staged.list_id), recordData: staged.record_data || {},
    operation: failedJob.operation, method: failedJob.http_method, resourcePath: failedJob.resource_path,
    requestBody: failedJob.request_body || {},
  });
}

export async function uploadStagedMosaicMedia(token: string, domain: string, recordId: string, files: File[]) {
  if (!files.length) return;
  const staged = await findStagedMosaicRecord(clickUpScope(token), domain, recordId);
  const clickupId = String(staged?.clickup_id || "");
  if (!clickupId) {
    console.warn("[mosaic-sync] media upload deferred because the parent record is not synced", { domain, recordId });
    return;
  }
  for (const file of files) {
    const form = new FormData();
    form.append("attachment", file, file.name);
    const response = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(clickupId)}/attachment`, {
      method: "POST", headers: { Authorization: token }, body: form, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) console.warn("[mosaic-sync] media upload failed after record sync", { domain, recordId, status: response.status });
  }
}
