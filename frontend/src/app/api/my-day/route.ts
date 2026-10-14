import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { requireFeature } from "@/lib/access-control-server";
import { isAskEchoEnabled } from "@/lib/admin-config/store";
import { summarizeMyDayTasks } from "@/lib/ask-echo/service";
import {
  DAILY_LOG_LIST_ID, createTask, dateFromTask, ensureDailyTask, fetchAllTasks,
  fetchClickUp, formatDailyName, isValidDate, monthFromTaskName, taskOwner,
  categoryPayload, categoriesFromTask, writeCategories, completeDailyTaskOnTimeIfPopulated,
  type RawClickUpTask,
} from "@/lib/notebookClickup";
import { randomUUID } from "node:crypto";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";
import { readStagedMosaicRecords } from "@/lib/mosaicWriteStore";
import { clickUpScope } from "@/lib/clickupReadStore";
import { fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";

export const maxDuration = 60;

type ClickUpTask = RawClickUpTask & {
  description?: string; description_text?: string; text_content?: string; markdown_description?: string;
  priority?: { id?: string | number; priority?: string } | null;
  status?: { status?: string; type?: string };
};

function headers(token: string) {
  return { Authorization: token, "Content-Type": "application/json" };
}

async function clickUpJson(token: string, url: string, init?: RequestInit) {
  const requestHeaders = new Headers(headers(token));
  new Headers(init?.headers).forEach((value, key) => requestHeaders.set(key, value));
  const response = await fetchClickUp(url, { ...init, headers: requestHeaders });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.err || body.error || `ClickUp returned ${response.status}.`);
  return body;
}

async function getPersonalList(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("personalListId") || req.headers.get("x-personal-list-id");
  if (id) return { id, name: req.nextUrl.searchParams.get("personalListName") || "Personal List" };
  const email = getUserFromRequest(req)?.email?.toLowerCase().trim();
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (!email || !supabaseUrl || !supabaseKey) return null;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from("echo_user_preferences").select("preferences").eq("email", email).maybeSingle();
    const preferences = data?.preferences;
    if (preferences?.personal_list_id) return { id: String(preferences.personal_list_id), name: String(preferences.personal_list_name || "Personal List") };
    const { data: globalData } = await supabase.from("echo_forms_config").select("config").eq("id", "global").maybeSingle();
    const fallback = globalData?.config?.userPreferences?.[email];
    if (fallback?.personal_list_id) return { id: String(fallback.personal_list_id), name: String(fallback.personal_list_name || "Personal List") };
  } catch (error) {
    console.warn("My Day personal list preference lookup failed:", error);
  }
  return null;
}

function userMatches(task: RawClickUpTask, byId: Map<string, RawClickUpTask>, user: ReturnType<typeof getUserFromRequest>) {
  if (!user) return false;
  const owner = taskOwner(task, byId);
  return owner.id === String(user.id) || owner.email.toLowerCase() === user.email.toLowerCase() || owner.name.toLowerCase() === user.username.toLowerCase();
}

async function readPersonalNotes(token: string, listId: string, date: string) {
  const tasks = await fetchAllClickUpListTasks<ClickUpTask>(token, listId, { includeMarkdownDescription: true });
  const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", listId);
  const stagedIds = new Map(stagedRows.map((row) => [String(row.record_id), String(row.clickup_id || row.record_id)]));
  const taskMap = new Map(tasks.map((task) => [String(task.id), task]));
  for (const row of stagedRows) {
    const id = String(row.clickup_id || row.record_id);
    if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
    const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
    taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, ...(typeof data.parent === "string" && data.parent ? { parent: stagedIds.get(data.parent) || data.parent } : {}), id } as ClickUpTask);
  }
  tasks.splice(0, tasks.length, ...taskMap.values());
  const parent = tasks.find((task) => !task.parent && task.name?.trim().toLowerCase() === "notes");
  if (!parent) return { parent: null, note: null };
  const note = tasks.find((task) => String(task.parent) === String(parent.id) && dateFromTask(task) === date);
  return { parent, note: note ? { id: String(note.id), name: note.name || formatDailyName(date), description: note.markdown_description || note.description_text || note.text_content || note.description || "", url: note.url || "" } : null };
}

function serializeDayTask(task: ClickUpTask) {
  const priority = Number(task.priority?.id || 3);
  return {
    id: String(task.id), name: task.name || "Untitled task",
    description: task.description_text || task.text_content || task.description || "",
    status: task.status?.status || "to do", statusType: task.status?.type || "",
    completed: task.status?.type === "closed" || /^(complete|completed|closed|done)$/i.test(task.status?.status || ""),
    priority: priority === 1 ? "urgent" : priority === 2 ? "high" : priority === 4 ? "low" : "normal",
    dueDate: task.due_date ? new Date(Number(task.due_date)).toISOString().slice(0, 10) : "",
    url: task.url || "",
  };
}

async function getKpiContext(token: string, date: string, req: NextRequest) {
  const remoteTasks = await fetchAllTasks(token) as ClickUpTask[];
  const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", DAILY_LOG_LIST_ID);
  const stagedIds = new Map(stagedRows.map((row) => [String(row.record_id), String(row.clickup_id || row.record_id)]));
  const taskMap = new Map(remoteTasks.map((task) => [String(task.id), task]));
  for (const row of stagedRows) {
    const id = String(row.clickup_id || row.record_id);
    if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
    const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
    taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, ...(typeof data.parent === "string" && data.parent ? { parent: stagedIds.get(data.parent) || data.parent } : {}), id } as ClickUpTask);
  }
  const tasks = [...taskMap.values()];
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  const user = getUserFromRequest(req);
  const day = tasks.find((task) => {
    const parent = task.parent ? byId.get(String(task.parent)) : undefined;
    return Boolean(parent && monthFromTaskName(parent.name) === date.slice(0, 7) && dateFromTask(task) === date && userMatches(task, byId, user));
  });
  return { tasks, day, syncState: "synced", syncedAt: new Date().toISOString(), isFresh: true };
}

async function getDailyTaskById(token: string, id: string, date: string, req: NextRequest) {
  if (!id) return null;
  const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", DAILY_LOG_LIST_ID);
  const staged = stagedRows.find((row) => String(row.clickup_id || row.record_id) === id || String(row.record_id) === id);
  if (staged?.is_deleted) return null;
  const stagedData = staged?.record_data && typeof staged.record_data === "object"
    ? staged.record_data as Record<string, unknown>
    : null;
  let task: ClickUpTask;
  if (stagedData) {
    task = { ...stagedData, id: String(staged?.clickup_id || staged?.record_id || id) } as ClickUpTask;
  } else {
    task = await clickUpJson(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}?include_markdown_description=true`) as ClickUpTask;
  }
  if (dateFromTask(task) !== date || String(task.list?.id || staged?.list_id || "") !== DAILY_LOG_LIST_ID || !task.parent) return null;

  const parentId = String(task.parent);
  const stagedParent = stagedRows.find((row) => String(row.clickup_id || row.record_id) === parentId || String(row.record_id) === parentId);
  const parentData = stagedParent?.record_data && typeof stagedParent.record_data === "object"
    ? stagedParent.record_data as Record<string, unknown>
    : null;
  const parent = parentData
    ? { ...parentData, id: String(stagedParent?.clickup_id || stagedParent?.record_id || parentId) } as ClickUpTask
    : await clickUpJson(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(parentId)}`) as ClickUpTask;
  const byId = new Map<string, RawClickUpTask>([[String(task.id), task], [String(parent.id), parent]]);
  return monthFromTaskName(parent.name) === date.slice(0, 7) && userMatches(task, byId, getUserFromRequest(req)) ? task : null;
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  if (!isValidDate(date)) return NextResponse.json({ error: "A valid day is required." }, { status: 400 });
  try {
    const [{ tasks, day, syncState, syncedAt, isFresh }, personalList, listInfo] = await Promise.all([
      getKpiContext(token, date, req),
      getPersonalList(req),
      clickUpJson(token, `https://api.clickup.com/api/v2/list/${DAILY_LOG_LIST_ID}`),
    ]);
    const statuses = (listInfo.statuses || []) as Array<{ status?: string; type?: string }>;
    const completeStatus = statuses.find((item) => item.type === "closed" || /complete|done|closed/i.test(item.status || ""))?.status || "complete";
    const openStatus = statuses.find((item) => item.type === "open" && /to do|open|not started/i.test(item.status || ""))?.status || statuses.find((item) => item.type === "open")?.status || "to do";
    let note = null;
    let notesError = "";
    if (personalList) {
      try { note = (await readPersonalNotes(token, personalList.id, date)).note; }
      catch (error) { notesError = error instanceof Error ? error.message : "Personal notes could not be loaded."; }
    }
    const children = day ? tasks.filter((task) => String(task.parent) === String(day.id)).map(serializeDayTask) : [];
    return NextResponse.json({
      date, dayTask: day ? { id: String(day.id), name: day.name || formatDailyName(date), url: day.url || "" } : null,
      syncState,
      syncedAt,
      isFresh,
      tasks: children, notes: note?.description || "", noteTask: note, activity: categoriesFromTask(day),
      completeStatus, openStatus,
      personalList: personalList ? { id: personalList.id, name: personalList.name } : null, notesError,
    });
  } catch (error) {
    console.error("My Day load failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load My Day from ClickUp." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req);
  const user = getUserFromRequest(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  if (!user?.id || !user.username) return NextResponse.json({ error: "Your ClickUp profile is required to add a task to the daily log." }, { status: 401 });
  try {
    const body = await req.json();
    if (!isValidDate(body.date)) return NextResponse.json({ error: "A valid day is required." }, { status: 400 });
    const { action } = body;
    const ownerUserId = String(user.id);

    if (action === "note") {
      const personalList = await getPersonalList(req);
      if (!personalList) return NextResponse.json({ error: "Choose a Personal List before saving day notes." }, { status: 400 });
      const notes = await readPersonalNotes(token, personalList.id, body.date);
      let parent = notes.parent;
      if (!parent) {
        parent = await createTask(token, { name: "Notes", description: "Day notes are stored as dated subtasks." }, ownerUserId, personalList.id);
      }
      if (!parent?.id) throw new Error("Could not find or create the Notes parent task in your Personal List.");
      const dateName = formatDailyName(body.date);
      const description = String(body.notes || "");
      if (notes.note) {
        await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: String(notes.note.id), listId: personalList.id, recordData: { ...notes.note, name: dateName, description } as never, operation: "update", method: "PUT", resourcePath: `/task/${notes.note.id}`, requestBody: { name: dateName, markdown_content: description } });
        scheduleMosaicWriteSync();
        return NextResponse.json({ success: true, noteTask: { ...notes.note, name: dateName, description } });
      }
      const localId = randomUUID();
      const requestBody = { name: dateName, parent: parent.id, markdown_content: description, due_date: new Date(`${body.date}T12:00:00`).getTime(), due_date_time: false };
      const record = { id: localId, name: dateName, description, parent: parent.id, url: "" };
      await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: localId, listId: personalList.id, recordData: record as never, operation: "create", method: "POST", resourcePath: `/list/${personalList.id}/task`, requestBody });
      scheduleMosaicWriteSync();
      return NextResponse.json({ success: true, noteTask: { ...record, url: "" }, pendingSync: true }, { status: 202 });
    }

    if (action === "summary") {
      const denied = await requireFeature(req, "ask-echo");
      if (denied) return denied;
      if (!(await isAskEchoEnabled())) return NextResponse.json({ error: "AI summaries are currently unavailable." }, { status: 403 });
    }
    let tasks: ClickUpTask[] = [];
    let day: ClickUpTask | undefined;
    if (action === "create" && typeof body.dayTaskId === "string") {
      try { day = await getDailyTaskById(token, body.dayTaskId, body.date, req) || undefined; }
      catch { /* Fall back to the full context lookup if the supplied day is stale. */ }
    }
    if (!day) {
      const context = await getKpiContext(token, body.date, req);
      tasks = context.tasks;
      day = context.day;
    }
    if (action === "summary") {
      if (!day) return NextResponse.json({ summary: "" });
      const dayTasks = tasks.filter((task) => String(task.parent) === String(day.id)).map((task) => ({
        id: String(task.id), name: String(task.name || "Untitled task"),
        description: String(task.description_text || task.text_content || task.description || ""),
        status: String(task.status?.status || ""),
        completed: task.status?.type === "closed" || /^(complete|completed|closed|done)$/i.test(task.status?.status || ""),
      }));
      if (!dayTasks.length) return NextResponse.json({ summary: "" });
      const summary = await summarizeMyDayTasks(dayTasks, { id: user.id, name: user.username, email: user.email });
      return NextResponse.json({ summary });
    }
    if (action === "activity") {
      const categories = categoryPayload(body.categories);
      const context = day
        ? { daily: day }
        : await ensureDailyTask(token, body.date, { id: String(user.id), name: user.username }, ownerUserId);
      await writeCategories(token, String(context.daily.id), categories, ownerUserId);
      const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(context.daily.id), context.daily.status?.status || "to do", categories, ownerUserId);
      return NextResponse.json({
        success: true,
        dayTask: { id: String(context.daily.id), name: context.daily.name || formatDailyName(body.date), url: context.daily.url || "" },
        activity: categories,
        ...statusResult,
      });
    }
    if (action === "create") {
      const title = String(body.name || "").trim();
      if (!title) return NextResponse.json({ error: "Enter a task name." }, { status: 400 });
      const context = day ? { daily: day } : await ensureDailyTask(token, body.date, { id: String(user.id), name: user.username }, ownerUserId);
      const payload: Record<string, unknown> = { name: title, parent: context.daily.id, description: String(body.description || "") };
      if (body.dueDate && isValidDate(body.dueDate)) { payload.due_date = new Date(`${body.dueDate}T12:00:00`).getTime(); payload.due_date_time = false; }
      const priority = ({ urgent: 1, high: 2, normal: 3, low: 4 } as Record<string, number>)[body.priority];
      if (priority) payload.priority = priority;
      const created = await createTask(token, payload, ownerUserId, String(context.daily.list?.id || DAILY_LOG_LIST_ID));
      return NextResponse.json({ success: true, task: serializeDayTask(created as ClickUpTask), dayTask: { id: String(context.daily.id), name: context.daily.name, url: context.daily.url }, pendingSync: true }, { status: 202 });
    }

    if (action === "update" || action === "delete") {
      const taskId = String(body.taskId || "");
      const task = tasks.find((item) => String(item.id) === taskId && String(item.parent) === String(day?.id));
      if (!task || !day) return NextResponse.json({ error: "That task is not part of the selected day." }, { status: 404 });
      if (action === "delete") {
        await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: taskId, listId: String(task.list?.id || DAILY_LOG_LIST_ID), recordData: {}, operation: "delete", method: "DELETE", resourcePath: `/task/${taskId}` });
        scheduleMosaicWriteSync();
        return NextResponse.json({ success: true, pendingSync: true }, { status: 202 });
      }
      const payload: Record<string, unknown> = {};
      if (typeof body.name === "string") payload.name = body.name.trim();
      if (typeof body.description === "string") payload.description = body.description;
      if (body.dueDate !== undefined) { payload.due_date = body.dueDate ? new Date(`${body.dueDate}T12:00:00`).getTime() : null; payload.due_date_time = false; }
      if (body.priority) payload.priority = ({ urgent: 1, high: 2, normal: 3, low: 4 } as Record<string, number>)[body.priority] || 3;
      if (body.status) payload.status = String(body.status);
      const projected = { ...task, ...payload, id: taskId };
      await stageMosaicWrite({ token, ownerUserId, domain: "notebook", recordId: taskId, listId: String(task.list?.id || DAILY_LOG_LIST_ID), recordData: projected as never, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody: payload as never });
      scheduleMosaicWriteSync();
      return NextResponse.json({ success: true, task: serializeDayTask(projected as ClickUpTask), pendingSync: true }, { status: 202 });
    }
    return NextResponse.json({ error: "Unsupported My Day action." }, { status: 400 });
  } catch (error) {
    console.error("My Day save failed:", error);
    const status = Number((error as { status?: number })?.status || 502);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save this My Day change." }, { status: status >= 500 ? 502 : status });
  }
}
