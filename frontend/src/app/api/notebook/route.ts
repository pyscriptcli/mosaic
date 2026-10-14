import { NextRequest, NextResponse } from "next/server";
import {
  CATEGORY_MATCHERS,
  CategoryKey,
  DAILY_LOG_LIST_ID,
  categoryPayload,
  completeDailyTaskOnTimeIfPopulated,
  dateFromTask,
  ensureDailyTask,
  extractText,
  isValidDate,
  monthFromTaskName,
  normalizeFieldName,
  requestToken,
  fetchDailyLogParents,
  fetchDailyLogParentTree,
  flattenClickUpTaskTree,
  taskOwner,
  writeCategories,
} from "@/lib/notebookClickup";
import { getUserFromRequest } from "@/lib/auth";
import { clickUpScope } from "@/lib/clickupReadStore";
import { readStagedMosaicRecords, scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

function monthsInRange(start: string, end: string) {
  const months: string[] = [];
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (++month > 12) { month = 1; year += 1; }
  }
  return months;
}

function ownerMatchesCurrentUser(task: Parameters<typeof taskOwner>[0], byId: Map<string, Parameters<typeof taskOwner>[0]>, user: ReturnType<typeof getUserFromRequest>) {
  if (!user) return false;
  const owner = taskOwner(task, byId);
  return owner.id === String(user.id) || owner.email.toLowerCase() === user.email.toLowerCase() || owner.name.toLowerCase() === user.username.toLowerCase();
}

export async function GET(req: NextRequest) {
  const token = requestToken(req);
  if (!token) {
    return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  }

  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const defaultStart = `${today.slice(0, 7)}-01`;
    const rangeStart = req.nextUrl.searchParams.get("start") || defaultStart;
    const rangeEnd = req.nextUrl.searchParams.get("end") || today;
    const selectedMemberId = req.nextUrl.searchParams.get("memberId") || "";
    const forceRefresh = req.nextUrl.searchParams.get("liveRefresh") === "1";
    if (!isValidDate(rangeStart) || !isValidDate(rangeEnd) || rangeStart > rangeEnd) {
      return NextResponse.json({ error: "A valid Daily Log date range is required." }, { status: 400 });
    }
    const requestedMonths = new Set(monthsInRange(rangeStart, rangeEnd));
    const currentUserOnly = req.nextUrl.searchParams.get("currentUser") === "1";
    const currentUser = getUserFromRequest(req);
    const parentAssigneeId = selectedMemberId || (currentUserOnly ? currentUser?.id : undefined);
    const remoteTasks = await fetchDailyLogParents(token, { assigneeId: parentAssigneeId, forceRefresh, requiredMonths: Array.from(requestedMonths) });
    const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", DAILY_LOG_LIST_ID);
    const stagedIdMap = new Map(stagedRows.map((row) => [String(row.record_id), String(row.clickup_id || row.record_id)]));
    const applyStaged = (source: typeof remoteTasks) => {
      const taskMap = new Map(source.map((task) => [String(task.id), task]));
      for (const row of stagedRows) {
        const id = String(row.clickup_id || row.record_id);
        if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
        const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
        taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, ...(typeof data.parent === "string" && data.parent ? { parent: stagedIdMap.get(data.parent) || data.parent } : {}), id } as typeof remoteTasks[number]);
      }
      return [...taskMap.values()];
    };
    const rootTasks = applyStaged(remoteTasks);
    const rootTaskMap = new Map(rootTasks.map((task) => [String(task.id), task]));
    const targetParents = rootTasks.filter((task) =>
      !task.parent && requestedMonths.has(monthFromTaskName(task.name) || "") &&
      (!selectedMemberId || taskOwner(task, rootTaskMap).id === selectedMemberId) &&
      (!currentUserOnly || ownerMatchesCurrentUser(task, rootTaskMap, currentUser)),
    );
    const trees = await Promise.all(targetParents.map(async (task) => {
      const id = String(task.id);
      // Staged local IDs are not yet addressable in ClickUp. Their queued writes
      // remain visible through the staged overlay below.
      if (stagedRows.some((row) => String(row.record_id) === id && !row.clickup_id)) return [];
      return flattenClickUpTaskTree(await fetchDailyLogParentTree(token, id, forceRefresh));
    }));
    const rawTasks = applyStaged([...rootTasks, ...trees.flat()] as typeof remoteTasks);
    const byId = new Map(rawTasks.map((task) => [String(task.id), task]));
    const members = new Map<string, ReturnType<typeof taskOwner>>();
    const memberMonths = new Map<string, Set<string>>();

    const childrenByParent = new Map<string, typeof rawTasks>();
    for (const child of rawTasks) {
      if (!child.parent) continue;
      const key = String(child.parent);
      const children = childrenByParent.get(key) || [];
      children.push(child);
      childrenByParent.set(key, children);
    }

    const entries = rawTasks.flatMap((task) => {
      const date = dateFromTask(task);
      const owner = taskOwner(task, byId);
      if (owner.id !== "unassigned") {
        members.set(owner.id, owner);
        const taskMonth = monthFromTaskName(task.name);
        if (taskMonth) {
          const months = memberMonths.get(owner.id) || new Set<string>();
          months.add(taskMonth);
          memberMonths.set(owner.id, months);
        }
      }

      const categories = Object.fromEntries(
        Object.keys(CATEGORY_MATCHERS).map((key) => [key, ""]),
      ) as Record<CategoryKey, string>;

      for (const field of task.custom_fields || []) {
        const fieldName = normalizeFieldName(field.name || "");
        const category = (Object.keys(CATEGORY_MATCHERS) as CategoryKey[]).find((key) => CATEGORY_MATCHERS[key](fieldName));
        if (category) categories[category] = extractText(field.value);
      }

      const hasRecognizedFields = Object.values(categories).some(Boolean) ||
        (task.custom_fields || []).some((field) =>
          (Object.keys(CATEGORY_MATCHERS) as CategoryKey[]).some((key) => CATEGORY_MATCHERS[key](normalizeFieldName(field.name || ""))),
        );

      const parent = task.parent ? byId.get(String(task.parent)) : undefined;
      const isDatedDailyTask = Boolean(parent && monthFromTaskName(parent.name) === date?.slice(0, 7));
      if (!date || date < rangeStart || date > rangeEnd || (!isDatedDailyTask && (Boolean(task.parent) || !hasRecognizedFields))) return [];
      const dailyTasks = (childrenByParent.get(String(task.id)) || []).map((child) => ({
        id: String(child.id), name: child.name || "Untitled task", status: child.status?.status || "to do",
        completed: child.status?.type === "closed" || /^(complete|completed|closed|done)$/i.test(child.status?.status || ""),
        dueDate: child.due_date ? new Date(Number(child.due_date)).toISOString().slice(0, 10) : "",
        url: child.url || "",
      }));
      return [{
        id: String(task.id),
        name: task.name || date,
        date,
        url: task.url || "",
        status: task.status?.status || "",
        member: owner,
        categories,
        hasContent: Object.values(categories).some((value) => value.trim().length > 0),
        dailyTasks,
      }];
    });

    const fetchedAt = new Date().toISOString();
    return NextResponse.json({
      listId: DAILY_LOG_LIST_ID,
      rangeStart,
      rangeEnd,
      memberId: selectedMemberId || null,
      entries,
      members: Array.from(members.values())
        .map((member) => ({ ...member, months: Array.from(memberMonths.get(member.id) || []) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      fetchedAt,
      syncedAt: fetchedAt,
      syncState: "synced",
      source: "clickup-live",
    }, { headers: { "Cache-Control": "no-store", "X-ClickUp-Data-Source": "live" } });
  } catch (error) {
    console.error("Notebook ClickUp read failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read the ClickUp daily log." },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const token = requestToken(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  try {
    const body = await req.json();
    if (!isValidDate(body.date) || !body.member?.id || !body.member?.name) {
      return NextResponse.json({ error: "A valid work date and team member are required." }, { status: 400 });
    }
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save the Daily Log." }, { status: 401 });
    const categories = categoryPayload(body.categories);
    const { daily, createdParent } = await ensureDailyTask(token, body.date, { id: String(body.member.id), name: String(body.member.name) }, userId);
    await writeCategories(token, String(daily.id), categories, userId);
    const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(daily.id), daily.status?.status || "to do", categories, userId);
    return NextResponse.json({ success: true, taskId: daily.id, url: daily.url || "", createdParent, ...statusResult });
  } catch (error) {
    console.error("Notebook create failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the Daily Log." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = requestToken(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.taskId) return NextResponse.json({ error: "A Daily Log task is required." }, { status: 400 });
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save the Daily Log." }, { status: 401 });
    const categories = categoryPayload(body.categories);
    await writeCategories(token, String(body.taskId), categories, userId);
    const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(body.taskId), String(body.currentStatus || ""), categories, userId);
    return NextResponse.json({ success: true, ...statusResult });
  } catch (error) {
    console.error("Notebook update failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the Daily Log." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = requestToken(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "A Daily Log task is required." }, { status: 400 });
  try {
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to delete the Daily Log." }, { status: 401 });
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "notebook", recordId: taskId, listId: DAILY_LOG_LIST_ID, recordData: {}, operation: "delete", method: "DELETE", resourcePath: `/task/${taskId}` });
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, pendingSync: true }, { status: 202 });
  } catch (error) {
    console.error("Notebook delete failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete the Daily Log." }, { status: 502 });
  }
}
