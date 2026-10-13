import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { clickUpScope, queueClickUpSync, readClickUpSyncStatus } from "@/lib/clickupReadStore";
import { processClickUpSyncQueue } from "@/lib/clickupSync";
import { processMosaicWriteOutbox } from "@/lib/mosaicWriteStore";
import { DAILY_LOG_LIST_ID } from "@/lib/notebookClickup";
import { DEMANDS_CLICKUP_LIST_ID } from "@/lib/demands/clickupSync";
import { MARKET_INSIGHTS_LIST_ID } from "@/lib/marketInsights";

export const maxDuration = 60;

function identity(request: NextRequest) {
  const token = getTokenFromRequest(request);
  const user = getUserFromRequest(request);
  if (!token || !user?.id) return null;
  return { token, userId: String(user.id), scope: clickUpScope(token) };
}

export async function GET(request: NextRequest) {
  const current = identity(request);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const status = await readClickUpSyncStatus(current.scope, current.userId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const current = identity(request);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const status = await readClickUpSyncStatus(current.scope, current.userId);
  if (!status.configured) return NextResponse.json({ error: "Background sync is not configured for this workspace." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { listIds?: unknown; listLabels?: unknown };
  const requestedIds = Array.isArray(body.listIds)
    ? body.listIds.map(String).filter((id) => /^\d{4,24}$/.test(id)).slice(0, 50)
    : [];
  const requestedLabels = body.listLabels && typeof body.listLabels === "object" ? body.listLabels as Record<string, unknown> : {};
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const client = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;
  const { data: knownJobs } = client
    ? await client.from("echo_clickup_sync_jobs").select("list_id").eq("scope_key", current.scope).eq("user_id", current.userId)
    : { data: [] as Array<{ list_id: string }> };
  const listIds = [...new Set([...requestedIds, DAILY_LOG_LIST_ID, DEMANDS_CLICKUP_LIST_ID, MARKET_INSIGHTS_LIST_ID, ...(knownJobs || []).map((job) => String(job.list_id))])];
  const knownLabels: Record<string, string> = {
    [DAILY_LOG_LIST_ID]: "Daily activity",
    [DEMANDS_CLICKUP_LIST_ID]: "Demands",
    [MARKET_INSIGHTS_LIST_ID]: "Market insights",
  };
  const allowedRequestedLabels = new Set(["Tasks", "Personal notes"]);
  const items = listIds.map((id) => {
    const requestedLabel = requestedLabels[id];
    return {
      id,
      label: knownLabels[id] || (typeof requestedLabel === "string" && allowedRequestedLabels.has(requestedLabel) ? requestedLabel : "Other saved ClickUp list"),
    };
  });

  const queued = await Promise.all(listIds.map((listId) => queueClickUpSync(current.token, current.userId, listId, true)));
  after(async () => {
    try {
      const writes = await processMosaicWriteOutbox(25);
      if (writes.length === 25) await processMosaicWriteOutbox(25);
      await processClickUpSyncQueue(2);
    } catch (error) {
      console.warn("[clickup-sync] manual sync worker failed", error instanceof Error ? error.message : "unknown");
    }
  });

  return NextResponse.json({ accepted: queued.filter(Boolean).length, requested: listIds.length, items, state: "syncing" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
