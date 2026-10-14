import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { withClickUpSyncContext } from "@/lib/clickupSyncContext";
import {
  claimClickUpSyncJobs,
  decryptClickUpToken,
  isClickUpSyncStorageReady,
  persistClickUpConnection,
  registerClickUpWebhook,
  releaseClickUpSyncClaim,
  stageClickUpSyncPage,
} from "@/lib/clickupReadStore";

const CLICKUP_TASK_WEBHOOK_EVENTS = [
  "taskCreated", "taskUpdated", "taskDeleted", "taskMoved",
  "taskPriorityUpdated", "taskStatusUpdated", "taskAssigneeUpdated", "taskDueDateUpdated",
  "taskTagUpdated", "taskTimeEstimateUpdated", "taskTimeTrackedUpdated",
];

export async function registerClickUpListWebhook(token: string, userId: string, listId: string) {
  const endpoint = process.env.CLICKUP_WEBHOOK_URL || (process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") + "/api/integrations/clickup/webhooks" : "");
  if (!endpoint || !await isClickUpSyncStorageReady()) return;
  const scope = (await import("@/lib/clickupReadStore")).clickUpScope(token);
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data: existing, error: existingError } = await client.from("echo_clickup_webhooks").select("webhook_id").eq("scope_key", scope).eq("list_id", listId).eq("active", true).maybeSingle();
  if (existingError) throw new Error("ClickUp webhook registration could not be checked.");
  if (!await persistClickUpConnection(token, userId)) return;
  const teamsResponse = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/team", undefined, undefined, { skipCache: true, timeoutMs: 8_000 });
  if (!teamsResponse.ok) throw new Error("ClickUp workspace could not be checked for webhook registration.");
  const teams = await teamsResponse.json().catch(() => ({})) as { teams?: Array<{ id?: string | number }> };
  const teamId = String(teams.teams?.[0]?.id || "");
  if (!teamId) throw new Error("No ClickUp workspace is available for webhook registration.");
  const teamWebhooksUrl = "https://api.clickup.com/api/v2/team/" + encodeURIComponent(teamId) + "/webhook";
  if (existing?.webhook_id) {
    const hooksResponse = await clickUpCalendarFetch(token, teamWebhooksUrl, undefined, undefined, { skipCache: true, timeoutMs: 8_000 });
    if (!hooksResponse.ok) throw new Error("ClickUp webhook configuration could not be checked.");
    const hooksPayload = await hooksResponse.json().catch(() => ({})) as { webhooks?: Array<{ id?: string | number; events?: string[] }> };
    const current = hooksPayload.webhooks?.find((hook) => String(hook.id || "") === String(existing.webhook_id));
    if (!current) return;
    if (current.events?.includes("*") || CLICKUP_TASK_WEBHOOK_EVENTS.every((event) => current.events?.includes(event))) return;
    const update = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/webhook/" + encodeURIComponent(String(existing.webhook_id)), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, events: CLICKUP_TASK_WEBHOOK_EVENTS, status: "active" }),
    }, ["/list/" + listId + "/task"], { timeoutMs: 8_000 });
    if (!update.ok) throw new Error("ClickUp webhook could not be updated.");
    return;
  }
  const response = await clickUpCalendarFetch(token, teamWebhooksUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, events: CLICKUP_TASK_WEBHOOK_EVENTS, list_id: Number(listId) }),
  }, ["/list/" + listId + "/task"], { timeoutMs: 8_000 });
  if (!response.ok) throw new Error("ClickUp webhook could not be created.");
  const payload = await response.json().catch(() => ({})) as { id?: string | number; secret?: string };
  if (payload.id && payload.secret) await registerClickUpWebhook({ webhookId: String(payload.id), scope, listId, secret: payload.secret });
}

function retryAtFrom(response: Response) {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const resetAt = Number(response.headers.get("X-RateLimit-Reset"));
  const target = retryAfter > 0 ? Date.now() + retryAfter * 1_000 : resetAt > Date.now() / 1_000 ? resetAt * 1_000 : Date.now() + 60_000;
  return new Date(Math.max(Date.now() + 5_000, target)).toISOString();
}

function validTaskPage(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((task) => Boolean(task && typeof task === "object" && String((task as { id?: unknown }).id || "")));
}

async function processJob(job: Awaited<ReturnType<typeof claimClickUpSyncJobs>>[number]) {
  let page = Number(job.progress_page || 0);
  const syncStartedAt = new Date().toISOString();
  const full = !job.last_synced_at || !job.last_full_sync_at || Date.now() - Date.parse(job.last_full_sync_at) >= 7 * 24 * 60 * 60_000;
  const since = full ? null : Math.max(0, Date.parse(job.last_synced_at || "") - 2_000);

  try {
    const token = decryptClickUpToken(job.encrypted_token);
    for (let pageCount = 0; pageCount < 4; pageCount += 1) {
      const url = new URL("https://api.clickup.com/api/v2/list/" + encodeURIComponent(job.list_id) + "/task");
      url.searchParams.set("include_closed", "true");
      url.searchParams.set("subtasks", "true");
      url.searchParams.set("include_markdown_description", "true");
      url.searchParams.set("page", String(page));
      if (since !== null) url.searchParams.set("date_updated_gt", String(since));
      const response = await clickUpCalendarFetch(token, url, undefined, undefined, { skipCache: true, maxRateLimitRetries: 0, timeoutMs: 8_000 });
      if (response.status === 401) {
        await releaseClickUpSyncClaim(job.id, job.claim_token, "ClickUp authorization expired.", undefined, true);
        return { synced: false, listId: job.list_id, reason: "ClickUp authorization expired." };
      }
      if (response.status === 429) {
        await releaseClickUpSyncClaim(job.id, job.claim_token, "ClickUp rate limit reached; retry scheduled.", retryAtFrom(response));
        return { synced: false, listId: job.list_id, reason: "ClickUp rate limit reached; retry scheduled." };
      }
      if ([403, 404].includes(response.status)) {
        await releaseClickUpSyncClaim(job.id, job.claim_token, "ClickUp denied access to this list (" + response.status + ").", undefined, true);
        return { synced: false, listId: job.list_id, reason: "ClickUp denied access to this list (" + response.status + ")." };
      }
      if (!response.ok) throw new Error("ClickUp returned " + response.status + ".");
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { tasks?: unknown }).tasks) || !validTaskPage((payload as { tasks: unknown }).tasks)) {
        throw new Error("ClickUp returned an invalid task page.");
      }
      const tasks = (payload as { tasks: Array<Record<string, unknown>> }).tasks;
      const done = tasks.length < 100 || (payload as { last_page?: unknown }).last_page === true;
      await stageClickUpSyncPage({ jobId: job.id, claimToken: job.claim_token, generation: job.generation, tasks, nextPage: page + 1, done, full, syncedAt: syncStartedAt });
      page += 1;
      if (done) return { synced: true, listId: job.list_id, records: tasks.length, mode: full ? "full" : "delta" };
    }
    await releaseClickUpSyncClaim(job.id, job.claim_token);
    return { synced: false, listId: job.list_id, queued: true, reason: "Sync page checkpoint saved for the next worker pass." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await releaseClickUpSyncClaim(job.id, job.claim_token, message);
    return { synced: false, listId: job.list_id, reason: message };
  }
}

export async function processClickUpSyncQueue(limit = 1) {
  const jobs = await claimClickUpSyncJobs(limit);
  return Promise.all(jobs.map((job) => withClickUpSyncContext(
    { runId: job.run_id, listId: job.list_id, userId: job.user_id },
    () => processJob(job),
  )));
}
