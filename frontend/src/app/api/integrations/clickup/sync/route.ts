import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { clickUpScope, persistClickUpConnection, readClickUpSyncRun, readClickUpSyncStatus } from "@/lib/clickupReadStore";

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
  // This endpoint only verifies the ClickUp token. The browser then refreshes
  // mounted feature views through their authenticated live GET routes.
  return NextResponse.json({ accepted: items.length, requested: items.length, items, state: "synced", source: "clickup-live" }, { headers: { "Cache-Control": "no-store" } });
}
