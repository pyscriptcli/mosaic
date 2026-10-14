import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { getUserFromRequest } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { clickUpCalendarFetch, fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";
import { clickUpScope } from "@/lib/clickupReadStore";
import { readStagedMosaicRecords, stageMosaicWrite, scheduleMosaicWriteSync } from "@/lib/mosaicWriteStore";
import { DEMANDS_CLICKUP_LIST_ID, formatDemandClickUpTitle } from "@/lib/demands/clickupSync";
import type { DemandLocationRequirement, DemandPriority, DemandRecord, DemandType } from "@/types/demands";

export const maxDuration = 60;

type ClickUpTask = {
  id: string;
  name?: string;
  url?: string;
  text_content?: string;
  description?: string;
  markdown_description?: string;
};

type DemandDraft = Omit<DemandRecord, "id" | "clickUpTaskId" | "clickUpUrl">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function normalizeDemand(value: unknown): DemandDraft | null {
  if (!isRecord(value)) return null;

  const client = text(value.client ?? value.company);
  const rawLocations = Array.isArray(value.locations) ? value.locations : [];
  const locations: DemandLocationRequirement[] = rawLocations.flatMap((item) => {
    if (!isRecord(item) || !text(item.area)) return [];
    return [{ id: text(item.id) || crypto.randomUUID(), gloc: text(item.gloc), city: text(item.city), area: text(item.area), priority: item.priority === "Secondary" || item.priority === "Tertiary" ? item.priority : "Primary" }];
  });
  if (locations.length === 0 && text(value.location)) locations.push({ id: crypto.randomUUID(), gloc: text(value.gloc), city: text(value.city), area: text(value.location), priority: "Primary" });
  if (!client || locations.length === 0) return null;

  const type = value.type === "CL" || value.type === "CS" || value.type === "INDL"
    ? value.type
    : value.segment === "Industrial" ? "INDL" : "CL";
  const date = text(value.date);

  return {
    date,
    quarter: text(value.quarter) || (date ? `${date.slice(0, 4)}Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` : ""),
    assoc: text(value.assoc ?? value.associate),
    source: text(value.source),
    type,
    industry: text(value.industry),
    client,
    minSqm: Number(value.minSqm) || 0,
    maxSqm: Number(value.maxSqm) || 0,
    gloc: locations[0].gloc || text(value.gloc ?? value.market),
    city: locations[0].city || text(value.city),
    location: locations[0].area,
    priority: value.priority === "Priority" || value.priority === "Low" ? value.priority : "Normal",
    purpose: text(value.purpose),
    timeline: text(value.timeline),
    status: text(value.status) || (value.priority === "Shelved" ? "Shelved" : "Active"),
    remarks: text(value.remarks),
    actionTaken: text(value.actionTaken),
    fulfillmentMode: value.fulfillmentMode === "either" ? "either" : value.fulfillmentMode === "rollout" ? "rollout" : undefined,
    alternativeLocations: Array.isArray(value.alternativeLocations)
      ? value.alternativeLocations.filter((item): item is string => typeof item === "string")
      : undefined,
    locations,
  };
}

function parseTask(task: ClickUpTask): DemandRecord | null {
  try {
    const raw = task.text_content || task.description || task.markdown_description || "";
    const parsed: unknown = JSON.parse(raw);
    const payload = isRecord(parsed) && "echoDemand" in parsed ? parsed.echoDemand : parsed;
    const demand = normalizeDemand(payload);
    return demand
      ? { ...demand, id: task.id, clickUpTaskId: task.id, clickUpUrl: task.url }
      : null;
  } catch {
    return null;
  }
}

function buildDraft(value: unknown): DemandDraft | null {
  if (!isRecord(value) || !text(value.client) || !Array.isArray(value.locations)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const locations: DemandLocationRequirement[] = value.locations.flatMap((location, index) => {
    if (!isRecord(location) || !text(location.area) || !text(location.city)) return [];
    return [{ id: crypto.randomUUID(), gloc: text(location.gloc), city: text(location.city), area: text(location.area), priority: location.priority === "Secondary" || location.priority === "Tertiary" ? location.priority : index === 0 ? "Primary" : "Secondary" }];
  });
  if (locations.length === 0) return null;

  const type: DemandType = value.type === "INDL" || value.type === "CS" ? value.type : "CL";
  const priority: DemandPriority = value.priority === "Priority" || value.priority === "Low" ? value.priority : "Normal";
  const fulfillmentMode = value.fulfillmentMode === "either" ? "either" : "rollout";
  return {
    date,
    quarter: `${date.slice(0, 4)}Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`,
    assoc: text(value.assoc), source: text(value.source), type,
    industry: text(value.industry), client: text(value.client),
    minSqm: Number(value.minSqm) || 0,
    maxSqm: Number(value.maxSqm) || Number(value.minSqm) || 0,
    gloc: locations[0].gloc, city: locations[0].city, location: locations[0].area,
    priority, purpose: text(value.purpose), timeline: text(value.timeline),
    status: text(value.status) || "Active", remarks: text(value.remarks),
    actionTaken: text(value.actionTaken), fulfillmentMode,
    alternativeLocations: fulfillmentMode === "either" ? locations.map((location) => location.area) : [],
    locations,
  };
}
function getUserToken(request: NextRequest) {
  return getTokenFromRequest(request);
}

async function mergeStagedDemands(token: string, remote: DemandRecord[]) {
  const staged = await readStagedMosaicRecords(clickUpScope(token), "demands", DEMANDS_CLICKUP_LIST_ID);
  const records = new Map(remote.map((demand) => [String(demand.clickUpTaskId || demand.id), demand]));
  for (const row of staged) {
    const remoteId = String(row.clickup_id || row.record_id);
    if (row.is_deleted) { records.delete(remoteId); records.delete(String(row.record_id)); continue; }
    const data = isRecord(row.record_data) ? row.record_data : {};
    const demand = normalizeDemand(data);
    if (demand) records.set(remoteId, { ...demand, id: remoteId, clickUpTaskId: remoteId, clickUpUrl: text(data.clickUpUrl) });
  }
  return [...records.values()];
}

export async function GET(request: NextRequest) {
  const token = getUserToken(request);
  if (!token) return NextResponse.json({ error: "Sign in to load demands." }, { status: 401 });

  try {
    const accessCheck = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/list/${DEMANDS_CLICKUP_LIST_ID}`, undefined, undefined, { skipCache: true });
    if (!accessCheck.ok) return NextResponse.json({ error: "This account cannot access the demands list." }, { status: accessCheck.status });
    const tasks = await fetchAllClickUpListTasks<ClickUpTask>(token, DEMANDS_CLICKUP_LIST_ID);
    const remote = tasks.map(parseTask).filter((demand): demand is DemandRecord => demand !== null);
    const fetchedAt = new Date().toISOString();
    return NextResponse.json({ demands: await mergeStagedDemands(token, remote), syncedAt: fetchedAt, fetchedAt, syncState: "synced", isFresh: true, source: "clickup-live" }, { headers: { "Cache-Control": "no-store", "X-ClickUp-Data-Source": "live" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load demands." },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const token = getUserToken(request);
  if (!token) return NextResponse.json({ error: "Sign in to save demands." }, { status: 401 });

  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid demand details." }, { status: 400 });

    const draft = buildDraft(body);
    if (!draft) {
      return NextResponse.json({ error: "Add at least one target location." }, { status: 400 });
    }

    const userId = String(getUserFromRequest(request)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save demands." }, { status: 401 });
    const localId = randomUUID();
    const requestBody = { name: formatDemandClickUpTitle({ ...draft, id: localId }), description: JSON.stringify({ echoDemand: draft }, null, 2), tags: ["demand", draft.type.toLowerCase(), draft.status.toLowerCase()] };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "demands", recordId: localId, listId: DEMANDS_CLICKUP_LIST_ID, recordData: { ...draft, id: localId, clickUpTaskId: localId } as never, operation: "create", method: "POST", resourcePath: `/list/${DEMANDS_CLICKUP_LIST_ID}/task`, requestBody });
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, created: [{ ...draft, id: localId, clickUpTaskId: localId }], pendingSync: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save demands." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const token = getUserToken(request);
  if (!token) return NextResponse.json({ error: "Sign in to update demands." }, { status: 401 });

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || !text(body.id)) {
      return NextResponse.json({ error: "A demand record is required." }, { status: 400 });
    }

    const demand = normalizeDemand(body);
    if (!demand) return NextResponse.json({ error: "Check the demand details and try again." }, { status: 400 });

    const userId = String(getUserFromRequest(request)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to update demands." }, { status: 401 });
    const staged = await readStagedMosaicRecords(clickUpScope(token), "demands", DEMANDS_CLICKUP_LIST_ID);
    const current = staged.find((row) => String(row.record_id) === text(body.id) || String(row.clickup_id) === text(body.id));
    const recordId = String(current?.record_id || body.id);
    const remoteId = String(current?.clickup_id || body.id);
    const requestBody = { name: formatDemandClickUpTitle({ ...demand, id: remoteId }), description: JSON.stringify({ echoDemand: demand }, null, 2) };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "demands", recordId, listId: DEMANDS_CLICKUP_LIST_ID, recordData: { ...demand, id: recordId, clickUpTaskId: remoteId } as never, operation: "update", method: "PUT", resourcePath: `/task/${remoteId}`, requestBody });
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, demand: { ...demand, id: recordId, clickUpTaskId: remoteId }, pendingSync: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update this demand." },
      { status: 502 },
    );
  }
}
