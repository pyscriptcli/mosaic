import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { requireProjectAdmin, requireSubprojectEditor } from "@/lib/project-permissions";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
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
  custom_fields?: Array<{ id?: string; value?: unknown }>;
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
    const fieldsPayload = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/field`);
    const fields = (fieldsPayload.fields || []) as ClickUpField[];
    const allTasks: ClickUpTask[] = [];
    for (let page = 0; ; page += 1) {
      const taskPage = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`);
      const batch = (taskPage.tasks || []) as ClickUpTask[];
      allTasks.push(...batch);
      if (batch.length < 100) break;
    }
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
        taskId: task?.id || null,
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
    if (!field?.id) return NextResponse.json({ error: `The ${fieldName} field is not available in this subproject.` }, { status: 404 });
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

    for (const update of updates) {
      const response = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${update.fieldId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: update.value }),
      }, [`/list/${listId}/task`, `/task/${taskId}`]);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ error: result.err || result.error || `Unable to save ${update.fieldName}.` }, { status: response.status });
    }
    return NextResponse.json({ success: true, taskId, field: key, value: value.trim(), amount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save site details." }, { status: 502 });
  }
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const folderId = String(body.folderId || "");
    if (!/^\d+$/.test(folderId)) return NextResponse.json({ error: "A valid project folder is required." }, { status: 400 });
    if (folderId !== SOURCE_FOLDER_ID) return NextResponse.json({ error: "Sites storage can only be set up in the source project folder." }, { status: 403 });
    if (body.mode !== "all") return NextResponse.json({ error: "Choose all subprojects for site task setup." }, { status: 400 });
    const access = await requireProjectAdmin(request);
    if (!access.ok) return access.response;
    const { token } = access;

    const folderLists = await clickUpJson(token, `https://api.clickup.com/api/v2/folder/${folderId}/list`);
    const subprojects = (folderLists.lists || []) as Array<{ id?: string | number; name?: string }>;
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
      const [list, fieldsPayload] = await Promise.all([
        clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}`),
        clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/field`),
      ]);
      const fields = (fieldsPayload.fields || []) as ClickUpField[];
      const existingTasks: ClickUpTask[] = [];
      for (let page = 0; ; page += 1) {
        const taskPage = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`);
        const batch = (taskPage.tasks || []) as ClickUpTask[];
        existingTasks.push(...batch);
        if (batch.length < 100) break;
      }
      const statusOptions = (list.statuses || []) as Array<{ status?: string; type?: string }>;
      const closedStatus = statusOptions.find((status) => status.type?.toLocaleLowerCase() === "closed")?.status
        || statusOptions.find((status) => /^(closed|complete|completed|done)$/i.test(status.status || ""))?.status
        || "closed";
      for (const { name } of projectSiteFields) {
        if (!findField(fields, name)) missingFields.add(name);
      }
      for (const site of sites) {
        const alreadyExists = existingTasks.some((task) => {
          if (task.parent) return false;
          const description = task.description || task.text_content || "";
          return description.includes(siteRecordMarker(site)) || (task.name?.startsWith(`Site ${site.siteNo} `) && task.name.endsWith(site.siteName));
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
        const createSiteResponse = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/list/${listId}/task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Site ${site.siteNo} - ${site.siteName}`,
            description: siteRecordDescription(site),
            status: closedStatus,
            custom_fields: customFields,
            notify_all: false,
          }),
        }, [`/list/${listId}/task`]);
        const result = await createSiteResponse.json().catch(() => ({}));
        if (!createSiteResponse.ok) {
          failures.push(`${listName} site ${site.siteNo}: ${String(result.err || result.error || `ClickUp ${createSiteResponse.status}`)}`);
          continue;
        }
        createdSites += 1;
      }
    }

    return NextResponse.json({
      success: true,
      createdSites,
      existingSites,
      missingFields: Array.from(missingFields),
      failures: failures.slice(0, 8),
      totalFailures: failures.length,
      subprojectCount: subprojects.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to set up Sites storage." }, { status: 502 });
  }
}
