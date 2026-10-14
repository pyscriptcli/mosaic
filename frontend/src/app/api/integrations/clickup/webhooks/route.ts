import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { clickUpScope, decryptClickUpToken, forgetClickUpWebhookEvent, isClickUpSyncStorageReady, loadClickUpWebhook, persistClickUpConnection, queueClickUpWebhookJob, registerClickUpWebhook, recordClickUpWebhookEvent } from "@/lib/clickupReadStore";

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  let event: Record<string, unknown>;
  try { event = JSON.parse(bodyText) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const webhookId = String(event.webhook_id || "");
  const signature = request.headers.get("x-signature") || "";
  if (!webhookId || !signature) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  const stored = await loadClickUpWebhook(webhookId);
  if (!stored) return NextResponse.json({ error: "Unknown webhook." }, { status: 401 });
  let secret = "";
  try { secret = decryptClickUpToken(stored.encrypted_secret); } catch { return NextResponse.json({ error: "Webhook verification is unavailable." }, { status: 503 }); }
  const expected = createHmac("sha256", secret).update(bodyText).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "hex"); } catch { return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 }); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  const historyIds = Array.isArray(event.history_items) ? event.history_items.map((item: unknown) => item && typeof item === "object" ? String((item as { id?: unknown }).id || "") : "").filter(Boolean).sort() : [];
  const eventKey = createHash("sha256").update(`${String(event.event || "")}:${historyIds.join(",") || bodyText}`).digest("hex");
  const firstDelivery = await recordClickUpWebhookEvent(webhookId, eventKey);
  if (firstDelivery === null) return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 503 });
  if (!firstDelivery) return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  const eventName = String(event.event || "");
  const taskId = String(event.task_id || "");
  const deleted = eventName === "taskDeleted" || eventName === "taskMoved";
  try {
    await queueClickUpWebhookJob(stored.scope_key, stored.list_id, taskId || undefined, deleted);
  } catch {
    await forgetClickUpWebhookEvent(webhookId, eventKey);
    return NextResponse.json({ error: "The ClickUp webhook event could not be queued." }, { status: 503 });
  }
  return NextResponse.json({ received: true }, { status: 202 });
}

export async function PUT(request: NextRequest) {
  const token = getTokenFromRequest(request);
  const user = getUserFromRequest(request);
  if (!token || !user?.id) return NextResponse.json({ error: "Sign in to connect ClickUp updates." }, { status: 401 });
  const { listId } = await request.json().catch(() => ({}));
  const normalizedListId = String(listId || "");
  if (!/^\d+$/.test(normalizedListId)) return NextResponse.json({ error: "Choose a valid list." }, { status: 400 });
  const endpoint = process.env.CLICKUP_WEBHOOK_URL || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/integrations/clickup/webhooks` : "");
  if (!endpoint || !await isClickUpSyncStorageReady()) return NextResponse.json({ error: "ClickUp update sync is not configured." }, { status: 503 });
  if (!await persistClickUpConnection(token, String(user.id))) return NextResponse.json({ error: "ClickUp update sync is not configured." }, { status: 503 });
  const teams = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/team");
  const teamData = await teams.json().catch(() => ({}));
  const teamId = String(teamData.teams?.[0]?.id || "");
  if (!teams.ok || !teamId) return NextResponse.json({ error: "Unable to find an accessible workspace." }, { status: teams.status || 502 });
  const response = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/webhook`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint, events: ["taskCreated", "taskUpdated", "taskDeleted", "taskMoved", "taskPriorityUpdated", "taskStatusUpdated", "taskAssigneeUpdated", "taskDueDateUpdated", "taskTagUpdated", "taskTimeEstimateUpdated", "taskTimeTrackedUpdated"], list_id: Number(normalizedListId) }) }, ["/list/" + normalizedListId + "/task"]);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id || !payload.secret) return NextResponse.json({ error: "The update subscription could not be created." }, { status: response.status || 502 });
  try {
    await registerClickUpWebhook({ webhookId: String(payload.id), scope: clickUpScope(token), listId: normalizedListId, secret: String(payload.secret) });
  } catch {
    return NextResponse.json({ error: "The update subscription was created but its signing key could not be stored. Remove that subscription in ClickUp and retry after sync storage is configured." }, { status: 503 });
  }
  return NextResponse.json({ connected: true });
}
