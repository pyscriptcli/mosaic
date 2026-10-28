import { after, NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { clickUpScope, enqueueClickUpSyncRun, persistClickUpConnection, readClickUpConnectionUserId, readClickUpSyncRun, readClickUpSyncStatus } from "@/lib/clickupReadStore";

export const maxDuration = 60;

async function identity(request: NextRequest, persist = true) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  try {
    const response = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/user", undefined, undefined, { timeoutMs: 8_000 });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { user?: { id?: string | number; email?: string } } | null;
    const userId = String(payload?.user?.id || "");
    if (!/^\d{1,24}$/.test(userId) || (persist && !await persistClickUpConnection(token, userId))) return null;
    return { token, userId, email: String(payload?.user?.email || ""), scope: clickUpScope(token) };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const scope = clickUpScope(token);
  const runId = request.nextUrl.searchParams.get("runId");
  if (runId) {
    const userId = await readClickUpConnectionUserId(scope);
    if (!userId) return NextResponse.json({ error: "ClickUp connection is not available for sync status." }, { status: 401 });
    const run = await readClickUpSyncRun(scope, userId, runId);
    if (!run) return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
    return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
  }
  const current = await identity(request);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const status = await readClickUpSyncStatus(current.scope, current.userId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const current = await identity(request, false);
  if (!current) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { listIds?: unknown; listLabels?: unknown };
  const requestedIds = Array.isArray(body.listIds)
    ? [...new Set(body.listIds.map(String).filter((id) => /^\d{4,24}$/.test(id)))].slice(0, 50)
    : [];
  const requestedLabels = body.listLabels && typeof body.listLabels === "object" ? body.listLabels as Record<string, unknown> : {};
  const allowedRequestedLabels = new Set(["Tasks", "Personal notes"]);
  const items = requestedIds.map((id) => {
    const candidate = requestedLabels[id];
    return { id, label: typeof candidate === "string" && allowedRequestedLabels.has(candidate) ? candidate : "ClickUp list" };
  });
  if (!items.length) return NextResponse.json({ error: "Choose at least one project list to refresh." }, { status: 400 });
  if (!await persistClickUpConnection(current.token, current.userId)) return NextResponse.json({ error: "ClickUp sync storage is unavailable." }, { status: 503 });
  const runId = await enqueueClickUpSyncRun(current.scope, current.userId, "manual", items);
  if (!runId) return NextResponse.json({ error: "The project refresh could not be queued." }, { status: 503 });
  after(async () => {
    const { processClickUpSyncQueue } = await import("@/lib/clickupSync");
    for (let pass = 0; pass < 20; pass += 1) {
      const results = await processClickUpSyncQueue(25);
      if (!results.length) break;
    }
  });
  return NextResponse.json({ runId, accepted: items.length, requested: items.length, items, state: "syncing", source: "durable-snapshot" }, { headers: { "Cache-Control": "no-store" } });
}
