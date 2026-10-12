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
  const tasks: ClickUpTask[] = [];
  for (let page = 0; page < 20; page += 1) {
    const body = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?include_closed=true&subtasks=true&include_markdown_description=true&page=${page}`);
    const batch = (body.tasks || []) as ClickUpTask[];
    tasks.push(...batch);
    if (batch.length < 100 || body.last_page === true) break;
  }
  const parent = tasks.find((task) => !task.parent && task.name?.trim().toLowerCase() === "notes");
  if (!parent) return { parent: null, note: null };
  const note = tasks.find((task) => String(task.parent) === String(parent.id) && dateFromTask(task) === date);
  return { parent, note: note ? { id: String(note.id), name: note.name || formatDailyName(date), description: note.markdown_description || note.description_text || note.text_content || note.description || "", url: note.url || `https://app.clickup.com/t/${note.id}` } : null };
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
    url: task.url || `https://app.clickup.com/t/${task.id}`,
  };
}

async function getKpiContext(token: string, date: string, req: NextRequest) {
  const tasks = await fetchAllTasks(token) as ClickUpTask[];
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  const user = getUserFromRequest(req);
  const day = tasks.find((task) => {
    const parent = task.parent ? byId.get(String(task.parent)) : undefined;
    return Boolean(parent && monthFromTaskName(parent.name) === date.slice(0, 7) && dateFromTask(task) === date && userMatches(task, byId, user));
  });
  return { tasks, day };
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  if (!isValidDate(date)) return NextResponse.json({ error: "A valid day is required." }, { status: 400 });
  try {
    const [{ tasks, day }, personalList, listInfo] = await Promise.all([
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
      date, dayTask: day ? { id: String(day.id), name: day.name || formatDailyName(date), url: day.url || `https://app.clickup.com/t/${day.id}` } : null,
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

    if (action === "note") {
      const personalList = await getPersonalList(req);
      if (!personalList) return NextResponse.json({ error: "Choose a Personal List before saving day notes." }, { status: 400 });
      const notes = await readPersonalNotes(token, personalList.id, body.date);
      let parent = notes.parent;
      if (!parent) {
        parent = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${encodeURIComponent(personalList.id)}/task`, { method: "POST", body: JSON.stringify({ name: "Notes", description: "Day notes are stored as dated subtasks." }) });
      }
      if (!parent?.id) throw new Error("Could not find or create the Notes parent task in your Personal List.");
      const dateName = formatDailyName(body.date);
      const description = String(body.notes || "");
      if (notes.note) {
        await clickUpJson(token, `https://api.clickup.com/api/v2/task/${notes.note.id}`, { method: "PUT", body: JSON.stringify({ name: dateName, markdown_content: description }) });
        return NextResponse.json({ success: true, noteTask: { ...notes.note, name: dateName, description } });
      }
      const created = await clickUpJson(token, `https://api.clickup.com/api/v2/list/${encodeURIComponent(personalList.id)}/task`, { method: "POST", body: JSON.stringify({ name: dateName, parent: parent.id, markdown_content: description, due_date: new Date(`${body.date}T12:00:00`).getTime(), due_date_time: false }) });
      return NextResponse.json({ success: true, noteTask: { id: String(created.id), name: created.name, description, url: created.url || `https://app.clickup.com/t/${created.id}` } });
    }

    if (action === "summary") {
      const denied = await requireFeature(req, "ask-echo");
      if (denied) return denied;
      if (!(await isAskEchoEnabled())) return NextResponse.json({ error: "AI summaries are currently unavailable." }, { status: 403 });
    }
    const { tasks, day } = await getKpiContext(token, body.date, req);
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
        : await ensureDailyTask(token, body.date, { id: String(user.id), name: user.username });
      await writeCategories(token, String(context.daily.id), categories);
      const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(context.daily.id), context.daily.status?.status || "to do", categories);
      return NextResponse.json({
        success: true,
        dayTask: { id: String(context.daily.id), name: context.daily.name || formatDailyName(body.date), url: context.daily.url || "https://app.clickup.com/t/" + context.daily.id },
        activity: categories,
        ...statusResult,
      });
    }
    if (action === "create") {
      const title = String(body.name || "").trim();
      if (!title) return NextResponse.json({ error: "Enter a task name." }, { status: 400 });
      const context = day ? { daily: day } : await ensureDailyTask(token, body.date, { id: String(user.id), name: user.username });
      const payload: Record<string, unknown> = { name: title, parent: context.daily.id, description: String(body.description || "") };
      if (body.dueDate && isValidDate(body.dueDate)) { payload.due_date = new Date(`${body.dueDate}T12:00:00`).getTime(); payload.due_date_time = false; }
      const priority = ({ urgent: 1, high: 2, normal: 3, low: 4 } as Record<string, number>)[body.priority];
      if (priority) payload.priority = priority;
      const created = await createTask(token, payload);
      return NextResponse.json({ success: true, task: serializeDayTask(created as ClickUpTask), dayTask: { id: String(context.daily.id), name: context.daily.name, url: context.daily.url } });
    }

    if (action === "update" || action === "delete") {
      const taskId = String(body.taskId || "");
      const task = tasks.find((item) => String(item.id) === taskId && String(item.parent) === String(day?.id));
      if (!task || !day) return NextResponse.json({ error: "That task is not part of the selected day." }, { status: 404 });
      if (action === "delete") {
        await clickUpJson(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, { method: "DELETE" });
        return NextResponse.json({ success: true });
      }
      const payload: Record<string, unknown> = {};
      if (typeof body.name === "string") payload.name = body.name.trim();
      if (typeof body.description === "string") payload.description = body.description;
      if (body.dueDate !== undefined) { payload.due_date = body.dueDate ? new Date(`${body.dueDate}T12:00:00`).getTime() : null; payload.due_date_time = false; }
      if (body.priority) payload.priority = ({ urgent: 1, high: 2, normal: 3, low: 4 } as Record<string, number>)[body.priority] || 3;
      if (body.status) payload.status = String(body.status);
      const updated = await clickUpJson(token, `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, { method: "PUT", body: JSON.stringify(payload) });
      return NextResponse.json({ success: true, task: serializeDayTask(updated as ClickUpTask) });
    }
    return NextResponse.json({ error: "Unsupported My Day action." }, { status: 400 });
  } catch (error) {
    console.error("My Day save failed:", error);
    const status = Number((error as { status?: number })?.status || 502);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save this My Day change." }, { status: status >= 500 ? 502 : status });
  }
}
