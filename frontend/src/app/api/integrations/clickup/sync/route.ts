import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { clearClickUpReadCache, clickUpScope, enqueueClickUpSyncRun, persistClickUpConnection, readClickUpSyncRun, readClickUpSyncStatus } from "@/lib/clickupReadStore";
import { processClickUpSyncQueue, registerClickUpListWebhook } from "@/lib/clickupSync";
import { processMosaicWriteOutbox } from "@/lib/mosaicWriteStore";
import { recordTelemetry } from "@/lib/telemetry";
import { DAILY_LOG_LIST_ID } from "@/lib/notebookClickup";
import { DEMANDS_CLICKUP_LIST_ID } from "@/lib/demands/clickupSync";
import { MARKET_INSIGHTS_LIST_ID } from "@/lib/marketInsights";

export const maxDuration = 60;

async function identity(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  try {
    const response = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/user", undefined, undefined, { timeoutMs: 8_000 });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { user?: { id?: string | number; email?: string } } | null;
    const userId = String(payload?.user?.id || "");
    if (!/^\d{1,24}$/.test(userId) || !await persistClickUpConnection(token, userId)) return null;
    return { token, userId, email: String(payload?.user?.email || ""), scope: clickUpScope(token) };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const current = await identity(request);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const runId = request.nextUrl.searchParams.get("runId");
  if (runId) {
    const run = await readClickUpSyncRun(current.scope, current.userId, runId);
    if (!run) return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
    return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
  }
  const status = await readClickUpSyncStatus(current.scope, current.userId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const current = await identity(request);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const status = await readClickUpSyncStatus(current.scope, current.userId);
  if (!status.configured) {
    await recordTelemetry({ userId: current.userId, userEmail: "", source: "clickup", operation: "clickup_sync", success: false, errorCategory: "sync_unconfigured", errorMessage: "Background sync is not configured for this workspace.", metadata: { requestedLists: 0 } });
    return NextResponse.json({ error: "Background sync is not configured for this workspace." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { listIds?: unknown; listLabels?: unknown };
  const requestedIds = Array.isArray(body.listIds)
    ? [...new Set(body.listIds.map(String).filter((id) => /^\d{4,24}$/.test(id)))].slice(0, 50)
    : [];
  const requestedLabels = body.listLabels && typeof body.listLabels === "object" ? body.listLabels as Record<string, unknown> : {};
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const client = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;
  const [jobsResult, configResult] = client ? await Promise.all([
    client.from("echo_clickup_sync_jobs").select("list_id").eq("scope_key", current.scope).eq("user_id", current.userId),
    client.from("echo_forms_config").select("config").eq("id", "global").maybeSingle(),
  ]) : [
    { data: [] as Array<{ list_id: string }>, error: null as { message: string } | null },
    { data: null as { config?: { mappings?: unknown[] } } | null, error: null as { message: string } | null },
  ];
  const discoveryError = jobsResult.error || configResult.error;
  if (discoveryError) {
    await recordTelemetry({ userId: current.userId, userEmail: "", source: "clickup", operation: "clickup_sync", success: false, errorCategory: "sync_discovery_failed", errorMessage: discoveryError.message, metadata: { requestedLists: 0 } });
    return NextResponse.json({ error: "ClickUp lists could not be discovered for this refresh." }, { status: 502 });
  }
  const formMappings = Array.isArray(configResult.data?.config?.mappings) ? configResult.data.config.mappings as Array<Record<string, unknown>> : [];
  const formListIds = formMappings.map((mapping) => String(mapping.listId || "")).filter((id) => /^\d{4,24}$/.test(id));
  const listIds = [...new Set([DAILY_LOG_LIST_ID, DEMANDS_CLICKUP_LIST_ID, MARKET_INSIGHTS_LIST_ID, ...formListIds, ...(jobsResult.data || []).map((job) => String(job.list_id)), ...requestedIds])];
  const labels: Record<string, string> = {
    [DAILY_LOG_LIST_ID]: "Daily activity",
    [DEMANDS_CLICKUP_LIST_ID]: "Demands",
    [MARKET_INSIGHTS_LIST_ID]: "Market insights",
  };
  for (const mapping of formMappings) {
    const id = String(mapping.listId || "");
    if (/^\d{4,24}$/.test(id)) labels[id] = `Forms · ${String(mapping.department || "General")} / ${String(mapping.formLabel || mapping.formType || "Requests")}`;
  }
  const allowedRequestedLabels = new Set(["Tasks", "Personal notes"]);
  const targets = listIds.map((id) => {
    const candidate = requestedLabels[id];
    return { id, label: labels[id] || (typeof candidate === "string" && allowedRequestedLabels.has(candidate) ? candidate : "Other saved ClickUp list") };
  });

  const startedAt = Date.now();
  await clearClickUpReadCache(current.scope);
  let enqueueErrorCode: string | null = null;
  const runId = await enqueueClickUpSyncRun(current.scope, current.userId, "manual", targets, (code) => { enqueueErrorCode = code; });
  if (!runId) {
    await recordTelemetry({
      userId: current.userId, userEmail: current.email, source: "clickup", operation: "clickup_sync",
      processingMs: Date.now() - startedAt, success: false, errorCategory: "sync_enqueue_failed",
      errorMessage: "The durable ClickUp sync queue rejected the refresh request.",
      metadata: { trigger: "manual", requestedLists: targets.length, databaseErrorCode: enqueueErrorCode },
    });
    return NextResponse.json({ error: "Sync could not start because the refresh could not be queued. Your saved log is unchanged; try again shortly." }, { status: 503 });
  }
  const userEmail = current.email;
  await recordTelemetry({
    userId: current.userId, userEmail, source: "clickup", operation: "clickup_sync",
    processingMs: Date.now() - startedAt, success: true,
    metadata: { runId, trigger: "manual", requestedLists: targets.length, lists: targets.map((target) => ({ listId: target.id, label: target.label, state: "queued" })) },
  });

  // Best-effort wake for low latency. The independent scheduled worker recovers
  // every accepted run even if this invocation or the browser disappears.
  after(async () => {
    try { await registerClickUpListWebhook(current.token, current.userId, DAILY_LOG_LIST_ID); }
    catch { console.warn("[clickup-sync] daily log webhook provisioning failed"); }
    try { await processMosaicWriteOutbox(15); } catch { console.warn("[clickup-sync] immediate write queue wake failed"); }
    try { await processClickUpSyncQueue(1); } catch { console.warn("[clickup-sync] immediate worker wake failed"); }
  });
  return NextResponse.json({ runId, accepted: targets.length, requested: targets.length, items: targets, state: "syncing" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
