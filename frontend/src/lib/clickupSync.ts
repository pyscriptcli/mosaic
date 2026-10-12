import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { claimClickUpSyncJobs, completeClickUpSyncJob, completeClickUpTaskDelta, decryptClickUpToken, failClickUpSyncJob, readClickUpTaskSyncCursor, isClickUpSyncStorageReady, persistClickUpConnection, registerClickUpWebhook, clickUpScope, revokeClickUpSyncConnection } from "@/lib/clickupReadStore";

const CLICKUP_TASK_WEBHOOK_EVENTS = [
  "taskCreated", "taskUpdated", "taskDeleted", "taskMoved",
  "taskPriorityUpdated", "taskStatusUpdated", "taskAssigneeUpdated", "taskDueDateUpdated",
  "taskTagUpdated", "taskTimeEstimateUpdated", "taskTimeTrackedUpdated",
];

export async function registerClickUpListWebhook(token: string, userId: string, listId: string) {
  const endpoint = process.env.CLICKUP_WEBHOOK_URL || (process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") + "/api/integrations/clickup/webhooks" : "");
  if (!endpoint || !await isClickUpSyncStorageReady()) return;
  const scope = clickUpScope(token);
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data: existing } = await client.from("echo_clickup_webhooks").select("webhook_id").eq("scope_key", scope).eq("list_id", listId).eq("active", true).maybeSingle();
  if (!await persistClickUpConnection(token, userId)) return;
  const teamsResponse = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/team");
  if (!teamsResponse.ok) return;
  const teams = await teamsResponse.json().catch(() => ({})) as { teams?: Array<{ id?: string | number }> };
  const teamId = String(teams.teams?.[0]?.id || "");
  if (!teamId) return;
  const teamWebhooksUrl = "https://api.clickup.com/api/v2/team/" + encodeURIComponent(teamId) + "/webhook";
  if (existing?.webhook_id) {
    const hooksResponse = await clickUpCalendarFetch(token, teamWebhooksUrl);
    if (!hooksResponse.ok) throw new Error("ClickUp webhook configuration could not be checked.");
    const hooksPayload = await hooksResponse.json().catch(() => ({})) as { webhooks?: Array<{ id?: string | number; events?: string[] }> };
    const current = hooksPayload.webhooks?.find((hook) => String(hook.id || "") === String(existing.webhook_id));
    if (current && (current.events?.includes("*") || CLICKUP_TASK_WEBHOOK_EVENTS.every((event) => current.events?.includes(event)))) return;
    if (!current) return;
    const update = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/webhook/" + encodeURIComponent(String(existing.webhook_id)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, events: CLICKUP_TASK_WEBHOOK_EVENTS, status: "active" }),
    }, ["/list/" + listId + "/task"]);
    if (!update.ok) throw new Error("ClickUp webhook could not be updated.");
    return;
  }
  const response = await clickUpCalendarFetch(token, teamWebhooksUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, events: CLICKUP_TASK_WEBHOOK_EVENTS, list_id: Number(listId) }),
  }, ["/list/" + listId + "/task"]);
  if (!response.ok) return;
  const payload = await response.json().catch(() => ({})) as { id?: string | number; secret?: string };
  if (payload.id && payload.secret) await registerClickUpWebhook({ webhookId: String(payload.id), scope, listId, secret: payload.secret });
}

export async function processClickUpSyncQueue(limit = 2) {
  const jobs = await claimClickUpSyncJobs(limit);
  return Promise.all(jobs.map(async (job) => {
    try {
      const token = decryptClickUpToken(job.encrypted_token);
      const cursor = await readClickUpTaskSyncCursor(job.scope_key, job.list_id);
      const since = cursor ? Math.max(0, Date.parse(cursor) - 2_000) : null;
      const syncStartedAt = new Date().toISOString();
      const tasks: unknown[] = [];
      for (let page = 0; page < 30; page += 1) {
        const url = new URL("https://api.clickup.com/api/v2/list/" + encodeURIComponent(job.list_id) + "/task");
        url.searchParams.set("include_closed", "true");
        url.searchParams.set("subtasks", "true");
        url.searchParams.set("include_markdown_description", "true");
        url.searchParams.set("page", String(page));
        if (since !== null) url.searchParams.set("date_updated_gt", String(since));
        const response = await clickUpCalendarFetch(token, url, undefined, undefined, { skipCache: true });
        if (response.status === 401) {
          await revokeClickUpSyncConnection(job.scope_key);
          return { synced: false, listId: job.list_id, reason: "connection-expired" };
        }
        if (!response.ok) throw new Error("ClickUp returned " + response.status + ".");
        const payload = await response.json() as { tasks?: unknown[] };
        const batch = Array.isArray(payload.tasks) ? payload.tasks : [];
        tasks.push(...batch);
        if (batch.length < 100) {
          if (since === null) await completeClickUpSyncJob(job.id, job.scope_key, job.list_id, tasks, syncStartedAt);
          else await completeClickUpTaskDelta(job.id, job.scope_key, job.list_id, tasks, syncStartedAt);
          return { synced: true, listId: job.list_id, records: tasks.length, mode: since === null ? "full" : "delta" };
        }
      }
      throw new Error("The sync exceeds the 3,000-record limit; no partial snapshot was published.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      await failClickUpSyncJob(job.id, message);
      return { synced: false, listId: job.list_id };
    }
  }));
}
