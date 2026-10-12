import { NextRequest, NextResponse } from "next/server";
import { requireSubprojectAdmin } from "@/lib/project-permissions";
import { AdminConfigError, loadAdminConfig, saveAdminConfig } from "@/lib/admin-config/store";
import { clearClickUpCalendarCache, clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { recordProjectActivity } from "@/lib/projectActivity";
import { getUserFromRequest } from "@/lib/auth";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const listId = String(body.listId || "");
    const folderId = String(body.folderId || "");
    const listName = String(body.listName || "Subproject");
    const assigneeIds: string[] = Array.isArray(body.assigneeIds) ? Array.from(new Set<string>(body.assigneeIds.map(String).filter((id: string) => /^\d+$/.test(id)))).slice(0, 1) : [];
    if (!/^\d+$/.test(listId) || !/^\d+$/.test(folderId)) return NextResponse.json({ error: "Choose a valid project and subproject." }, { status: 400 });
    const access = await requireSubprojectAdmin(req, folderId, listId);
    if (!access.ok) return access.response;
    const { token } = access;
    const ownerUserId = String(getUserFromRequest(req)?.id || "");
    if (!ownerUserId) return NextResponse.json({ error: "Your ClickUp profile is required to update subproject assignments." }, { status: 401 });
    const leadId = Number(assigneeIds[0]);
    const taskIds: string[] = [];
    let assignedCount = 0;
    let alreadyAssignedCount = 0;
    let failedCount = 0;
    if (Number.isFinite(leadId)) {
      const tasks: Array<{ id: string | number; assignees?: Array<{ id: string | number }> }> = [];
      for (let page = 0; ; page += 1) {
        const response = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?subtasks=true&include_closed=true&page=${page}`);
        if (!response.ok) return NextResponse.json({ error: `Lead saved was canceled because existing tasks could not be loaded (${response.status}).` }, { status: response.status });
        const payload = await response.json() as { tasks?: typeof tasks };
        const pageTasks = payload.tasks || [];
        tasks.push(...pageTasks);
        if (pageTasks.length < 100) break;
      }
      for (const task of tasks) {
        const taskId = String(task.id);
        if ((task.assignees || []).some((assignee) => String(assignee.id) === String(leadId))) { alreadyAssignedCount += 1; taskIds.push(taskId); continue; }
        try {
          const requestBody = { assignees: { add: [leadId], rem: [] } };
          await stageMosaicWrite({ token, ownerUserId, domain: "project_tasks", recordId: taskId, listId, recordData: { id: taskId, assignees: [{ id: String(leadId) }] }, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody });
          assignedCount += 1;
          taskIds.push(taskId);
        } catch { failedCount += 1; }
      }
      clearClickUpCalendarCache(token, [`/list/${listId}/task`]);
    }
    const config = await loadAdminConfig();
    const defaults = config.projectDefaultAssignees && typeof config.projectDefaultAssignees === "object" && !Array.isArray(config.projectDefaultAssignees)
      ? config.projectDefaultAssignees as Record<string, string[]>
      : {};
    const previousLeadId = defaults[listId]?.[0] || "";
    if (assigneeIds.length) defaults[listId] = assigneeIds;
    else delete defaults[listId];
    await saveAdminConfig({ ...config, projectDefaultAssignees: defaults });
    if (previousLeadId !== (assigneeIds[0] || "")) await recordProjectActivity(req, {
      folderId, listId, listName, eventType: "subproject-lead-changed",
      summary: assigneeIds.length ? `Set ${String(body.leadName || "a new member")} as subproject lead and assigned them to ${assignedCount + alreadyAssignedCount} existing tasks` : "Cleared the subproject lead",
      details: { previousLeadId: previousLeadId || null, leadId: assigneeIds[0] || null, leadName: String(body.leadName || ""), assignedCount, alreadyAssignedCount, failedCount, taskIds },
    });
    if (assignedCount) scheduleMosaicWriteSync();
    return NextResponse.json({ listId, assigneeIds, taskIds, assignedCount, alreadyAssignedCount, failedCount, pendingSync: assignedCount > 0 }, { status: assignedCount ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AdminConfigError ? error.status : 503;
    return NextResponse.json({ error: "The subproject assignees could not be saved." }, { status });
  }
}
