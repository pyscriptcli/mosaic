import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { authorizeBARequest } from "@/lib/business-analysis-server";
import { clickUpFetch } from "@/lib/clickupCalendarApi";
import { getUserFromRequest } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

type ClickUpList = { id: string; name: string; teamName: string; spaceName: string; folderName: string };

export async function GET(req: NextRequest) {
  const { denied } = await authorizeBARequest(req);
  if (denied) return denied;
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "Sign in with ClickUp to choose a task list." }, { status: 401 });
  try {
    const teamsResponse = await clickUpFetch("https://api.clickup.com/api/v2/team", { headers: { Authorization: token }, cache: "no-store" });
    if (!teamsResponse.ok) return NextResponse.json({ error: "Could not load your task lists." }, { status: teamsResponse.status });
    const teamsPayload = await teamsResponse.json() as { teams?: Array<{ id: string | number; name?: string }> };
    const listsById = new Map<string, ClickUpList>();
    await Promise.all((teamsPayload.teams || []).map(async (team) => {
      const spacesResponse = await clickUpFetch(`https://api.clickup.com/api/v2/team/${encodeURIComponent(String(team.id))}/space`, { headers: { Authorization: token }, cache: "no-store" }).catch(() => null);
      if (!spacesResponse?.ok) return;
      const spacesPayload = await spacesResponse.json().catch(() => ({})) as { spaces?: Array<{ id: string | number; name?: string }> };
      await Promise.all((spacesPayload.spaces || []).map(async (space) => {
        const [listsResponse, foldersResponse] = await Promise.all([
          clickUpFetch(`https://api.clickup.com/api/v2/space/${encodeURIComponent(String(space.id))}/list?archived=false`, { headers: { Authorization: token }, cache: "no-store" }).catch(() => null),
          clickUpFetch(`https://api.clickup.com/api/v2/space/${encodeURIComponent(String(space.id))}/folder?archived=false`, { headers: { Authorization: token }, cache: "no-store" }).catch(() => null),
        ]);
        const addList = (list: { id: string | number; name?: string }, folderName = "") => {
          const id = String(list.id);
          if (/^\d+$/.test(id)) listsById.set(id, { id, name: String(list.name || "Untitled list"), teamName: String(team.name || "Workspace"), spaceName: String(space.name || "Space"), folderName });
        };
        if (listsResponse?.ok) {
          const payload = await listsResponse.json().catch(() => ({})) as { lists?: Array<{ id: string | number; name?: string }> };
          for (const list of payload.lists || []) addList(list);
        }
        if (foldersResponse?.ok) {
          const payload = await foldersResponse.json().catch(() => ({})) as { folders?: Array<{ name?: string; lists?: Array<{ id: string | number; name?: string }> }> };
          for (const folder of payload.folders || []) for (const list of folder.lists || []) addList(list, String(folder.name || ""));
        }
      }));
    }));
    const lists = [...listsById.values()].sort((left, right) => left.spaceName.localeCompare(right.spaceName) || left.folderName.localeCompare(right.folderName) || left.name.localeCompare(right.name));
    return NextResponse.json({ lists }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load your task lists." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const { denied } = await authorizeBARequest(req);
  if (denied) return denied;
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "Sign in with ClickUp to save this task." }, { status: 401 });
  try {
    const body = await req.json() as { listId?: unknown; taskName?: unknown; requirementId?: unknown; requirement?: unknown; localTaskId?: unknown };
    const listId = typeof body.listId === "string" ? body.listId : "";
    const taskName = typeof body.taskName === "string" ? body.taskName.trim().slice(0, 500) : "";
    const requirementId = typeof body.requirementId === "string" ? body.requirementId.trim().slice(0, 40) : "";
    const requirement = typeof body.requirement === "string" ? body.requirement.trim().slice(0, 2_000) : "";
    const localTaskId = typeof body.localTaskId === "string" ? body.localTaskId.slice(0, 80) : "";
    if (!/^\d+$/.test(listId) || !taskName || !/^REQ-\d+$/i.test(requirementId) || !localTaskId) return NextResponse.json({ error: "Choose a task and a valid ClickUp list." }, { status: 400 });
    const listResponse = await clickUpFetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}`, { headers: { Authorization: token }, cache: "no-store" });
    const list = await listResponse.json().catch(() => ({})) as { id?: string | number; name?: string; err?: string };
    if (!listResponse.ok || String(list.id || "") !== listId) return NextResponse.json({ error: list.err || "That ClickUp list is not available to your account." }, { status: listResponse.status || 404 });
    const description = [`Mosaic requirement: ${requirementId}`, requirement ? `Requirement: ${requirement}` : "", `Local task reference: ${localTaskId}`].filter(Boolean).join("\n\n");
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save this task." }, { status: 401 });
    const taskId = randomUUID();
    const requestBody = { name: taskName, description, notify_all: false };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "ba_tasks", recordId: taskId, listId, recordData: { id: taskId, name: taskName, description, url: "", requirementId, localTaskId } as never, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody });
    scheduleMosaicWriteSync();
    return NextResponse.json({ clickUpTask: { id: taskId, url: "", listId, listName: String(list.name || "") }, pendingSync: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not save this task to ClickUp." }, { status: 503 });
  }
}
