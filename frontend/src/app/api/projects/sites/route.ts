import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getTokenFromRequest } from "@/lib/auth";
import { requireProjectAdmin, requireSubprojectEditor } from "@/lib/project-permissions";
import { clickUpCalendarFetch, fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";
import { getUserFromRequest } from "@/lib/auth";
import { readStagedMosaicRecords, scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";
import { clickUpScope, queueClickUpSync, readClickUpTaskSnapshot } from "@/lib/clickupReadStore";
import { calculateSiteAmount, projectSiteFields, siteRecordDescription, siteRecordMarker, sitesForSubproject } from "@/lib/projectSites";

type ClickUpField = {
  id: string;
  name: string;
  type?: string;
  type_config?: { options?: Array<{ id?: string; name?: string }> };
};

type ClickUpTask = {
  id?: string;
  name?: string;
  description?: string;
  text_content?: string;
  status?: { status?: string };
  parent?: string | null;
  custom_fields?: Array<{ id?: string; name?: string; value?: unknown }>;
};

const SOURCE_FOLDER_ID = "901414174663";
const SITE_FIELD_ALIASES: Record<string, string[]> = {
  "p/s": ["p/s", "p/s site"],
  "monthly rate": ["monthly rate", "monthly rent"],
};

function taskFieldTextValue(task: ClickUpTask, fields: ClickUpField[], fieldName: string) {
  const field = findField(fields, fieldName);
  const raw = field && task.custom_fields?.find((item) => String(item.id) === field.id)?.value;
  if (raw !== undefined && raw !== null && raw !== "") return String(raw);

  const description = task.description || task.text_content || "";
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return description.match(new RegExp(`^${escaped}:[ \\t]*([^\\r\\n]*)$`, "mi"))?.[1]?.trim() || "";
}

function setDescriptionField(description: string, fieldName: string, value: string) {
  const linePattern = new RegExp(`^${fieldName}:[ \\t]*[^\\r\\n]*$`, "mi");
  if (linePattern.test(description)) return description.replace(linePattern, `${fieldName}: ${value}`);
  return `${description.trimEnd()}\n${fieldName}: ${value}`;
}

function findField(fields: ClickUpField[], name: string) {
  const matches = SITE_FIELD_ALIASES[name.toLocaleLowerCase()] || [name.toLocaleLowerCase()];
  return fields.find((field) => matches.includes(field.name.trim().toLocaleLowerCase()));
}

function taskFieldValue(field: ClickUpField, key: string, site: ReturnType<typeof sitesForSubproject>[number]) {
  const rawValue: Record<string, string> = {
    siteNo: site.siteNo,
    siteName: site.siteName,
    priority: site.priority,
    lessor: "",
    status: "",
    monthlyRate: "",
    pfStructure: "",
    amount: "",
  };
  const value = rawValue[key] || "";
  if (!value) return undefined;
  if (field.type === "drop_down" || field.type === "labels") {
    const option = field.type_config?.options?.find((item) => item.name?.toLocaleLowerCase() === value.toLocaleLowerCase());
    return option?.id;
  }
  if (["number", "currency", "money"].includes(field.type || "")) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return value;
}

function getSitesToken(request: NextRequest) {
  return getTokenFromRequest(request);
}

async function clickUpJson(token: string, url: string, init?: RequestInit) {
  const response = await clickUpCalendarFetch(token, url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.err || payload.error || `ClickUp request failed (${response.status}).`;
    throw new Error(String(error));
  }
  return payload as Record<string, any>;
}

export async function GET(request: NextRequest) {
  try {
    const token = getSitesToken(request);
    if (!token) return NextResponse.json({ error: "Sign in with ClickUp to load site task details." }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId") || "";
    const listId = searchParams.get("listId") || "";
    const listName = searchParams.get("listName") || "";
    if (!/^\d+$/.test(folderId) || !/^\d+$/.test(listId) || !listName) return NextResponse.json({ error: "A valid project subfolder is required." }, { status: 400 });

    const lists = await clickUpJson(token, `https://api.clickup.com/api/v2/folder/${folderId}/list`);
    const selectedList = (lists.lists || []).find((list: { id?: string | number }) => String(list.id) === listId);
    if (!selectedList) return NextResponse.json({ error: "This subfolder does not belong to the selected project." }, { status: 403 });
    const sourceSites = sitesForSubproject(listName);
    const scope = clickUpScope(token);
    const [fieldsPayload, snapshot, stagedRows] = await Promise.all([
      clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/field`),
      readClickUpTaskSnapshot(scope, listId, 30 * 24 * 60 * 60_000),
      readStagedMosaicRecords(scope, "project_sites", listId),
    ]);
    const snapshotIsFresh = Boolean(snapshot && snapshot.syncState === "ready" && Date.now() - Date.parse(snapshot.syncedAt) < 5 * 60_000);
    if (!snapshotIsFresh) {
      const clickUpUserId = String(getUserFromRequest(request)?.id || "");
      void queueClickUpSync(token, clickUpUserId, listId, snapshot?.syncState === "failed").catch(() => undefined);
    }
    // Serve the durable task snapshot while the sync worker refreshes stale data.
    // Only a cold cache needs to wait for ClickUp's paginated list endpoint.
    const allTasks = snapshot?.tasks
      ? snapshot.tasks as ClickUpTask[]
      : await fetchAllClickUpListTasks<ClickUpTask>(token, listId, { includeSubtasks: false });
    const fields = (fieldsPayload.fields || []) as ClickUpField[];
    const taskMap = new Map(allTasks.map((task) => [String(task.id || ""), task]));
    const pendingTaskIds = new Set<string>();
    const failedTaskIds = new Set<string>();
    for (const row of stagedRows) {
      const id = String(row.clickup_id || row.record_id);
      if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
      const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
      taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, id } as ClickUpTask);
      if (!row.clickup_id && row.sync_state === "failed") failedTaskIds.add(id);
      else if (!row.clickup_id || row.sync_state !== "synced") pendingTaskIds.add(id);
    }
    allTasks.splice(0, allTasks.length, ...taskMap.values());
    const taskMatchesSite = (task: ClickUpTask, site: typeof sourceSites[number]) => {
      const description = task.description || task.text_content || "";
      return description.includes(siteRecordMarker(site)) || (task.name?.startsWith(`Site ${site.siteNo} `) && task.name.endsWith(site.siteName));
    };
    const taskForSite = (site: typeof sourceSites[number]) => allTasks.find((task) => !task.parent && taskMatchesSite(task, site))
      || allTasks.find((task) => taskMatchesSite(task, site));
    const textValue = (fieldName: string, task: ClickUpTask | undefined) => {
      if (!task) return "";
      const field = findField(fields, fieldName);
      const raw = field && task.custom_fields?.find((item) => String(item.id) === field.id)?.value;
      if (raw !== undefined && raw !== null && raw !== "") {
        if ((field?.type === "drop_down" || field?.type === "labels") && Array.isArray(field.type_config?.options)) {
          const option = field.type_config.options.find((item) => item.id === String(raw));
          return option?.name || String(raw);
        }
        return String(raw);
      }
      const description = task.description || task.text_content || "";
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return description.match(new RegExp(`^${escaped}:[ \\t]*([^\\r\\n]*)$`, "mi"))?.[1]?.trim() || "";
    };
    const sites = sourceSites.map((site) => {
      const task = taskForSite(site);
      return {
        ...site,
        taskId: task?.id && !pendingTaskIds.has(String(task.id)) && !failedTaskIds.has(String(task.id)) ? task.id : null,
        taskPending: Boolean(task?.id && pendingTaskIds.has(String(task.id))),
        taskFailed: Boolean(task?.id && failedTaskIds.has(String(task.id))),
        siteNo: textValue("Site No", task) || site.siteNo,
        siteName: textValue("Site Name", task) || site.siteName,
        priority: textValue("P/S", task) || site.priority,
        lessor: textValue("Lessor", task),
        status: textValue("Status", task),
        monthlyRate: textValue("Monthly Rate", task),
        pfStructure: textValue("PF Structure", task),
        amount: calculateSiteAmount(textValue("Monthly Rate", task), textValue("PF Structure", task)) || textValue("Amount", task),
        taskUrl: task?.id ? `https://app.clickup.com/t/${task.id}` : null,
      };
    });
    return NextResponse.json({ sites, fields: projectSiteFields.map(({ name }) => name), availableFields: fields.map((field) => field.name) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load site task details." }, { status: 502 });
  }
}

const editableSiteFields: Record<string, string> = {
  lessor: "Lessor",
  status: "Status",
  monthlyRate: "Monthly Rate",
  pfStructure: "PF Structure",
};

export async function PATCH(request: NextRequest) {
  try {
    const token = getSitesToken(request);
    if (!token) return NextResponse.json({ error: "Sign in with ClickUp to edit site details." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const folderId = String(body.folderId || "");
    const listId = String(body.listId || "");
    const taskId = String(body.taskId || "");
    const key = String(body.field || "");
    const value = typeof body.value === "string" ? body.value : "";
    const fieldName = editableSiteFields[key];
    if (folderId !== SOURCE_FOLDER_ID || !/^\d+$/.test(listId) || !/^[A-Za-z0-9_-]+$/.test(taskId) || !fieldName) {
      return NextResponse.json({ error: "A valid site and editable field are required." }, { status: 400 });
    }
    const access = await requireSubprojectEditor(request, folderId, listId);
    if (!access.ok) return access.response;
    if (value.length > 2_000) return NextResponse.json({ error: "Keep site details under 2,000 characters." }, { status: 400 });
    if ((key === "monthlyRate" || key === "pfStructure") && value !== "" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
      return NextResponse.json({ error: `${fieldName} must be a number.` }, { status: 400 });
    }

    const lists = await clickUpJson(token, `https://api.clickup.com/api/v2/folder/${folderId}/list`);
    const selectedList = (lists.lists || []).find((list: { id?: string | number }) => String(list.id) === listId);
    if (!selectedList) return NextResponse.json({ error: "This subproject does not belong to the selected project." }, { status: 403 });

    const [task, fieldsPayload] = await Promise.all([
      clickUpJson(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`) as Promise<ClickUpTask & { list?: { id?: string | number } }>,
      clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/field`),
    ]);
    const description = task.description || task.text_content || "";
    if (String(task.list?.id || "") !== listId || !description.includes("<!-- MOSAIC_SITE_RECORD:")) {
      return NextResponse.json({ error: "Only site tasks in the selected subproject can be edited here." }, { status: 403 });
    }
    const fields = (fieldsPayload.fields || []) as ClickUpField[];
    const field = findField(fields, fieldName);
    if (!field?.id) {
      let nextDescription = setDescriptionField(description, fieldName, value.trim());
      let amount: string | null = null;
      if (key === "monthlyRate" || key === "pfStructure") {
        const monthlyRate = key === "monthlyRate" ? value.trim() : taskFieldTextValue(task, fields, "Monthly Rate");
        const pfStructure = key === "pfStructure" ? value.trim() : taskFieldTextValue(task, fields, "PF Structure");
        amount = calculateSiteAmount(monthlyRate, pfStructure);
        nextDescription = setDescriptionField(nextDescription, "Amount", amount || "");
      }
      const userId = String(getUserFromRequest(request)?.id || "");
      if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to edit sites." }, { status: 401 });
      await stageMosaicWrite({ token, ownerUserId: userId, domain: "project_sites", recordId: taskId, listId, recordData: { id: taskId, name: task.name, description: nextDescription, list: { id: listId } } as never, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody: { description: nextDescription } });
      scheduleMosaicWriteSync();
      return NextResponse.json({ success: true, taskId, field: key, value: value.trim(), amount, pendingSync: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    const updates: Array<{ fieldId: string; fieldName: string; value: string }> = [{ fieldId: field.id, fieldName, value: value.trim() }];
    let amount: string | null = null;
    if (key === "monthlyRate" || key === "pfStructure") {
      const amountField = findField(fields, "Amount");
      if (!amountField?.id) return NextResponse.json({ error: "The Amount field is not available in this subproject." }, { status: 404 });
      const monthlyRate = key === "monthlyRate" ? value.trim() : taskFieldTextValue(task, fields, "Monthly Rate");
      const pfStructure = key === "pfStructure" ? value.trim() : taskFieldTextValue(task, fields, "PF Structure");
      amount = calculateSiteAmount(monthlyRate, pfStructure);
      updates.push({ fieldId: amountField.id, fieldName: "Amount", value: amount || "" });
    }

    const userId = String(getUserFromRequest(request)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to edit sites." }, { status: 401 });
    const stagedFields = [...(task.custom_fields || [])];
    for (const update of updates) {
      const index = stagedFields.findIndex((item) => String(item.id) === update.fieldId);
      const valueObject = { value: update.value };
      if (index >= 0) stagedFields[index] = { ...stagedFields[index], ...valueObject };
      else stagedFields.push({ id: update.fieldId, name: update.fieldName, ...valueObject });
      await stageMosaicWrite({ token, ownerUserId: userId, domain: "project_sites", recordId: taskId, listId, recordData: { id: taskId, name: task.name, description, list: { id: listId }, custom_fields: stagedFields } as never, operation: "update", method: "POST", resourcePath: `/task/${taskId}/field/${update.fieldId}`, requestBody: valueObject });
    }
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, taskId, field: key, value: value.trim(), amount, pendingSync: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save site details." }, { status: 502 });
  }
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const folderId = String(body.folderId || "");
    const mode = String(body.mode || "");
    const requestedListId = String(body.listId || "");
    if (!/^\d+$/.test(folderId)) return NextResponse.json({ error: "A valid project folder is required." }, { status: 400 });
    if (folderId !== SOURCE_FOLDER_ID) return NextResponse.json({ error: "Sites storage can only be set up in the source project folder." }, { status: 403 });
    if (mode !== "all" && mode !== "list") return NextResponse.json({ error: "Choose a subproject for site task setup." }, { status: 400 });
    if (mode === "list" && !/^\d+$/.test(requestedListId)) return NextResponse.json({ error: "A valid subproject is required for site task setup." }, { status: 400 });
    const access = mode === "all"
      ? await requireProjectAdmin(request)
      : await requireSubprojectEditor(request, folderId, requestedListId);
    if (!access.ok) return access.response;
    const { token } = access;
    const userId = String(getUserFromRequest(request)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to set up site records." }, { status: 401 });

    const folderLists = await clickUpJson(token, `https://api.clickup.com/api/v2/folder/${folderId}/list`);
    const allSubprojects = (folderLists.lists || []) as Array<{ id?: string | number; name?: string }>;
    const subprojects = mode === "list" ? allSubprojects.filter((list) => String(list.id) === requestedListId) : allSubprojects;
    if (mode === "list" && subprojects.length === 0) return NextResponse.json({ error: "This subproject does not belong to the selected project." }, { status: 403 });
    if (!subprojects.length) return NextResponse.json({ error: "No subprojects were found in this project." }, { status: 404 });

    let createdSites = 0;
    let existingSites = 0;
    const missingFields = new Set<string>();
    const failures: string[] = [];

    for (const subproject of subprojects) {
      const listId = String(subproject.id || "");
      const listName = String(subproject.name || "Subproject");
      if (!/^\d+$/.test(listId)) continue;
      const sites = sitesForSubproject(listName);
      const [list, fieldsPayload, existingTasks, stagedRows] = await Promise.all([
        clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}`),
        clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/field`),
        fetchAllClickUpListTasks<ClickUpTask>(token, listId, { includeSubtasks: false }),
        readStagedMosaicRecords(clickUpScope(token), "project_sites", listId),
      ]);
      const fields = (fieldsPayload.fields || []) as ClickUpField[];
      const statusOptions = (list.statuses || []) as Array<{ status?: string; type?: string }>;
      const closedStatus = statusOptions.find((status) => status.type?.toLocaleLowerCase() === "closed")?.status
        || statusOptions.find((status) => /^(closed|complete|completed|done)$/i.test(status.status || ""))?.status
        || "closed";
      for (const { name } of projectSiteFields) {
        if (!findField(fields, name)) missingFields.add(name);
      }
      for (const site of sites) {
        const matchesSite = (task: ClickUpTask) => {
          if (task.parent) return false;
          const description = task.description || task.text_content || "";
          return description.includes(siteRecordMarker(site)) || (task.name?.startsWith(`Site ${site.siteNo} `) && task.name.endsWith(site.siteName));
        };
        const alreadyExists = existingTasks.some(matchesSite) || stagedRows.some((row) => {
          if (row.is_deleted || row.sync_state === "failed") return false;
          const data = row.record_data && typeof row.record_data === "object" ? row.record_data as ClickUpTask : {};
          return matchesSite(data);
        });
        if (alreadyExists) {
          existingSites += 1;
          continue;
        }
        const customFields = projectSiteFields.flatMap(({ key, name }) => {
          const field = findField(fields, name);
          if (!field?.id) return [];
          const value = taskFieldValue(field, key, site);
          return value === undefined ? [] : [{ id: field.id, value }];
        });
        const taskId = randomUUID();
        const requestBody = { name: `Site ${site.siteNo} - ${site.siteName}`, description: siteRecordDescription(site), status: closedStatus, custom_fields: customFields, notify_all: false };
        await stageMosaicWrite({ token, ownerUserId: userId, domain: "project_sites", recordId: taskId, listId, recordData: { id: taskId, ...requestBody, list: { id: listId } } as never, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: requestBody as never });
        createdSites += 1;
      }
    }

    if (createdSites) scheduleMosaicWriteSync();
    return NextResponse.json({
      success: true,
      createdSites,
      existingSites,
      missingFields: Array.from(missingFields),
      failures: failures.slice(0, 8),
      totalFailures: failures.length,
      subprojectCount: subprojects.length,
      pendingSync: createdSites > 0,
    }, { status: createdSites ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to set up Sites storage." }, { status: 502 });
  }
}
