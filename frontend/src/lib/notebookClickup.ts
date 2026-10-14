import { NextRequest } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch, clickUpFetch as fetch, fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";
import { clickUpScope } from "@/lib/clickupReadStore";
import { randomUUID } from "node:crypto";
import { readStagedMosaicRecords, scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const DAILY_LOG_LIST_ID = "901418075633";

export const CATEGORY_MATCHERS = {
  client: (name: string) => name.includes("client"),
  admin: (name: string) => name.includes("admin"),
  adhoc: (name: string) => name.includes("adhoc") || name.includes("ad hoc"),
  meetings: (name: string) => name.includes("meeting"),
} as const;

export type CategoryKey = keyof typeof CATEGORY_MATCHERS;

export interface RawClickUpTask {
  id: string;
  list?: { id?: string | number; name?: string };
  name?: string;
  parent?: string;
  url?: string;
  status?: { status?: string; type?: string };
  due_date?: string | null;
  start_date?: string | null;
  assignees?: Array<{
    id?: number | string;
    username?: string;
    email?: string;
    initials?: string;
    profilePicture?: string | null;
  }>;
  custom_fields?: Array<{ id?: string; name?: string; type?: string; value?: unknown }>;
}

type ClickUpTaskTree = RawClickUpTask & { subtasks?: ClickUpTaskTree[] };
const liveDailyLogParentTrees = new Map<string, Promise<ClickUpTaskTree>>();

export interface NotebookMemberInput {
  id: string;
  name: string;
}

export type Categories = Record<CategoryKey, string>;

export function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function extractText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    for (const key of ["text", "value", "name", "label"]) {
      const parsed = extractText(objectValue[key]);
      if (parsed) return parsed;
    }
  }
  return "";
}

export function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateFromTask(task: RawClickUpTask): string | null {
  const name = task.name || "";
  const numeric = name.match(/\b(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (numeric) return validIsoDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));

  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const written = name.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  if (written) {
    return validIsoDate(Number(written[3]), monthNames[written[1].toLowerCase()], Number(written[2]));
  }

  const timestamp = task.due_date || task.start_date;
  if (timestamp) return new Date(Number(timestamp)).toISOString().slice(0, 10);
  return null;
}

export function suffixOwner(name = "") {
  const match = name.match(/\s[-–—]\s([^–—-]+)$/);
  return match?.[1]?.trim() || "";
}

export function monthFromTaskName(name = "") {
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const match = name.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(20\d{2})\b/i);
  if (!match) return null;
  return `${match[2]}-${String(monthNames[match[1].toLowerCase()]).padStart(2, "0")}`;
}

export function taskOwner(task: RawClickUpTask, byId: Map<string, RawClickUpTask>) {
  let current: RawClickUpTask | undefined = task;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const assignee = current.assignees?.[0];
    if (assignee?.username || assignee?.email) {
      return {
        id: String(assignee.id || assignee.email || assignee.username),
        name: assignee.username || assignee.email || "Unassigned",
        email: assignee.email || "",
        initials: assignee.initials || (assignee.username || assignee.email || "?").slice(0, 2).toUpperCase(),
        profilePicture: assignee.profilePicture || null,
      };
    }
    const parsedName = suffixOwner(current.name);
    if (parsedName) {
      return {
        id: parsedName.toLowerCase().replace(/\s+/g, "-"),
        name: parsedName,
        email: "",
        initials: parsedName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        profilePicture: null,
      };
    }
    current = current.parent ? byId.get(String(current.parent)) : undefined;
  }
  return { id: "unassigned", name: "Unassigned", email: "", initials: "?", profilePicture: null };
}

export async function fetchClickUp(
  url: string,
  options: RequestInit = {},
  maxRetries = 4,
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      attempt++;
      if (attempt > maxRetries) {
        return response;
      }
      const retryAfter = response.headers.get("Retry-After");
      const resetHeader = response.headers.get("X-RateLimit-Reset");
      let delayMs = 1500 * attempt;
      if (retryAfter) {
        const parsed = Number(retryAfter);
        if (!Number.isNaN(parsed) && parsed > 0) {
          delayMs = Math.min(parsed * 1000 + 500, 30000);
        }
      } else if (resetHeader) {
        const resetSec = Number(resetHeader);
        if (!Number.isNaN(resetSec) && resetSec > 0) {
          const nowSec = Math.floor(Date.now() / 1000);
          const diff = resetSec > nowSec ? resetSec - nowSec : resetSec;
          if (diff > 0 && diff <= 30) {
            delayMs = diff * 1000 + 500;
          }
        }
      }
      console.warn(`ClickUp rate limit reached (429). Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

export async function fetchAllTasks(token: string) {
  return fetchAllClickUpListTasks<RawClickUpTask>(token, DAILY_LOG_LIST_ID);
}

export async function fetchDailyLogParents(token: string) {
  return fetchAllClickUpListTasks<RawClickUpTask>(token, DAILY_LOG_LIST_ID, { includeSubtasks: false });
}

export async function fetchDailyLogParentTree(token: string, parentId: string) {
  const key = `${clickUpScope(token)}:daily-log-parent:${parentId}`;
  const pending = liveDailyLogParentTrees.get(key);
  if (pending) return pending;
  const request = (async () => {
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(parentId)}?include_subtasks=true`;
    const response = await clickUpCalendarFetch(token, url, undefined, undefined, { skipCache: true, timeoutMs: 12_000 });
    const body = await response.json().catch(() => null) as (ClickUpTaskTree & { err?: string; error?: string }) | null;
    if (!response.ok || !body || !body.id) throw new Error(body?.err || body?.error || `ClickUp could not load Daily Log parent ${parentId}.`);
    return body;
  })();
  liveDailyLogParentTrees.set(key, request);
  try { return await request; } finally { liveDailyLogParentTrees.delete(key); }
}

export function flattenClickUpTaskTree(root: ClickUpTaskTree) {
  const tasks: RawClickUpTask[] = [];
  const visit = (task: ClickUpTaskTree, parentId?: string) => {
    const normalized = { ...task, ...(parentId && !task.parent ? { parent: parentId } : {}) };
    tasks.push(normalized);
    for (const child of task.subtasks || []) visit(child, String(task.id));
  };
  visit(root);
  return tasks;
}

export function clickUpHeaders(token: string) {
  return { Authorization: token, "Content-Type": "application/json" };
}

export function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromDateParts(value).getTime());
}

export function fromDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatParentName(date: string, member: NotebookMemberInput) {
  const day = fromDateParts(date);
  return `${day.toLocaleDateString("en-US", { month: "long", year: "numeric" })} - ${member.name}`;
}

export function formatDailyName(date: string) {
  return fromDateParts(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function categoryPayload(value: unknown): Categories {
  const source = value && typeof value === "object" ? value as Partial<Categories> : {};
  return {
    client: typeof source.client === "string" ? source.client.trim() : "",
    admin: typeof source.admin === "string" ? source.admin.trim() : "",
    adhoc: typeof source.adhoc === "string" ? source.adhoc.trim() : "",
    meetings: typeof source.meetings === "string" ? source.meetings.trim() : "",
  };
}

export function categoriesFromTask(task?: RawClickUpTask | null): Categories {
  const categories = categoryPayload({});
  for (const field of task?.custom_fields || []) {
    const key = (Object.keys(CATEGORY_MATCHERS) as CategoryKey[]).find((candidate) =>
      CATEGORY_MATCHERS[candidate](normalizeFieldName(field.name || "")),
    );
    if (key) categories[key] = extractText(field.value);
  }
  return categories;
}

export async function categoryFields(token: string) {
  const response = await fetchClickUp(`https://api.clickup.com/api/v2/list/${DAILY_LOG_LIST_ID}/field`, {
    headers: { Authorization: token }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to read the Daily Log fields from ClickUp.");
  const body = await response.json();
  const fields = (body.fields || []) as Array<{ id?: string; name?: string }>;
  const mapped = {} as Record<CategoryKey, string>;
  for (const key of Object.keys(CATEGORY_MATCHERS) as CategoryKey[]) {
    const field = fields.find((item) => CATEGORY_MATCHERS[key](normalizeFieldName(item.name || "")));
    if (!field?.id) throw new Error(`The ${key === "adhoc" ? "Ad hoc" : key} Daily Log field could not be found in ClickUp.`);
    mapped[key] = field.id;
  }
  return mapped;
}

export async function writeCategories(token: string, taskId: string, categories: Categories, ownerUserId?: string) {
  const fields = await categoryFields(token);
  if (ownerUserId) {
    await Promise.all((Object.keys(fields) as CategoryKey[]).map((key) => stageMosaicWrite({
      token, ownerUserId, domain: "notebook", recordId: taskId, listId: DAILY_LOG_LIST_ID,
      recordData: { id: taskId, categories } as never, operation: "update", method: "POST",
      resourcePath: `/task/${taskId}/field/${fields[key]}`, requestBody: { value: categories[key] },
    })));
    scheduleMosaicWriteSync();
    return;
  }
  await Promise.all((Object.keys(fields) as CategoryKey[]).map(async (key) => {
    const response = await fetchClickUp(`https://api.clickup.com/api/v2/task/${taskId}/field/${fields[key]}`, {
      method: "POST",
      headers: clickUpHeaders(token),
      body: JSON.stringify({ value: categories[key] }),
    });
    if (!response.ok) throw new Error(`Unable to save the ${key} Daily Log field.`);
  }));
}

let completedOnTimeStatusCache: { status: string | null; expiresAt: number } | null = null;

async function getCompletedOnTimeStatus(token: string) {
  if (completedOnTimeStatusCache && completedOnTimeStatusCache.expiresAt > Date.now()) {
    return completedOnTimeStatusCache.status;
  }
  const response = await fetchClickUp(`https://api.clickup.com/api/v2/list/${DAILY_LOG_LIST_ID}`, {
    headers: { Authorization: token }, cache: "no-store",
  });
  if (!response.ok) {
    completedOnTimeStatusCache = { status: null, expiresAt: Date.now() + 60_000 };
    return null;
  }
  const body = await response.json();
  const statuses = (body.statuses || []) as Array<{ status?: string }>;
  const completed = statuses.find((item) => normalizeFieldName(item.status || "").replace(/\s+/g, "") === "completedontime");
  completedOnTimeStatusCache = { status: completed?.status || null, expiresAt: Date.now() + 5 * 60_000 };
  return completedOnTimeStatusCache.status;
}

export async function completeDailyTaskOnTimeIfPopulated(token: string, taskId: string, currentStatus: string, categories: Categories, ownerUserId?: string) {
  const hasInput = Object.values(categories).some((value) => value.trim().length > 0);
  const normalizedStatus = normalizeFieldName(currentStatus);
  if (!hasInput || (normalizedStatus !== "to do" && normalizedStatus !== "todo")) return { updated: false };

  const completedStatus = await getCompletedOnTimeStatus(token);
  if (!completedStatus) return { updated: false, warning: "The KPI Monitoring list has no Completed On-Time status configured." };

  if (ownerUserId) {
    await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: taskId, listId: DAILY_LOG_LIST_ID, recordData: { id: taskId, status: completedStatus, categories } as never, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody: { status: completedStatus } });
    scheduleMosaicWriteSync();
    return { updated: true, pendingSync: true };
  }

  const response = await fetchClickUp(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: "PUT",
    headers: clickUpHeaders(token),
    body: JSON.stringify({ status: completedStatus }),
  });
  if (!response.ok) return { updated: false, warning: "The log was saved, but ClickUp could not update its status to Completed On-Time." };
  return { updated: true };
}

export async function createTask(token: string, payload: Record<string, unknown>, ownerUserId?: string, listId = DAILY_LOG_LIST_ID) {
  if (ownerUserId) {
    const id = randomUUID();
    const record = { id, name: String(payload.name || "Daily Log task"), description: String(payload.description || ""), parent: String(payload.parent || ""), status: { status: String(payload.status || "to do") }, assignees: Array.isArray(payload.assignees) ? payload.assignees.map((member) => ({ id: String(member) })) : [] };
    await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: id, listId, recordData: record as never, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: payload as never });
    scheduleMosaicWriteSync();
    return record as RawClickUpTask;
  }
  const response = await fetchClickUp(`https://api.clickup.com/api/v2/list/${DAILY_LOG_LIST_ID}/task`, {
    method: "POST", headers: clickUpHeaders(token), body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "ClickUp could not create the Daily Log record.");
  }
  return await response.json() as RawClickUpTask;
}

export async function ensureDailyTask(token: string, date: string, member: NotebookMemberInput, ownerUserId?: string) {
  const fetchedTasks = await fetchAllTasks(token);
  const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", DAILY_LOG_LIST_ID);
  const stagedIds = new Map(stagedRows.map((row) => [String(row.record_id), String(row.clickup_id || row.record_id)]));
  const taskMap = new Map(fetchedTasks.map((task) => [String(task.id), task]));
  for (const row of stagedRows) {
    const id = String(row.clickup_id || row.record_id);
    if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
    const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
    taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, ...(typeof data.parent === "string" && data.parent ? { parent: stagedIds.get(data.parent) || data.parent } : {}), id } as RawClickUpTask);
  }
  const rawTasks = [...taskMap.values()];
  const byId = new Map(rawTasks.map((task) => [String(task.id), task]));
  const month = date.slice(0, 7);
  let parent = rawTasks.find((task) =>
    !task.parent && monthFromTaskName(task.name) === month && taskOwner(task, byId).id === member.id,
  );
  if (!parent) {
    const numericMemberId = /^\d+$/.test(member.id) ? Number(member.id) : undefined;
    parent = await createTask(token, {
      name: formatParentName(date, member),
      assignees: numericMemberId ? [numericMemberId] : [],
    }, ownerUserId);
    byId.set(String(parent.id), parent);
  }

  let daily = rawTasks.find((task) => task.parent === parent!.id && dateFromTask(task) === date);
  if (!daily) {
    const numericMemberId = /^\d+$/.test(member.id) ? Number(member.id) : undefined;
    daily = await createTask(token, {
      name: formatDailyName(date),
      parent: parent.id,
      assignees: numericMemberId ? [numericMemberId] : [],
    }, ownerUserId);
  }
  return { daily, createdParent: !rawTasks.some((task) => task.id === parent!.id) };
}

export function requestToken(req: NextRequest) {
  return getTokenFromRequest(req);
}
