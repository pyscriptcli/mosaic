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
  fetchAllTasks,
  isValidDate,
  monthFromTaskName,
  normalizeFieldName,
  requestToken,
  taskOwner,
  writeCategories,
} from "@/lib/notebookClickup";

export async function GET(req: NextRequest) {
  const token = requestToken(req);
  if (!token) {
    return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  }

  try {
    const rawTasks = await fetchAllTasks(token);
    const byId = new Map(rawTasks.map((task) => [String(task.id), task]));
    const members = new Map<string, ReturnType<typeof taskOwner>>();
    const memberMonths = new Map<string, Set<string>>();

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
      if (!date || (!isDatedDailyTask && (Boolean(task.parent) || !hasRecognizedFields))) return [];
      const dailyTasks = rawTasks.filter((child) => String(child.parent) === String(task.id)).map((child) => ({
        id: String(child.id), name: child.name || "Untitled task", status: child.status?.status || "to do",
        completed: child.status?.type === "closed" || /^(complete|completed|closed|done)$/i.test(child.status?.status || ""),
        dueDate: child.due_date ? new Date(Number(child.due_date)).toISOString().slice(0, 10) : "",
        url: child.url || `https://app.clickup.com/t/${child.id}`,
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

    return NextResponse.json({
      listId: DAILY_LOG_LIST_ID,
      entries,
      members: Array.from(members.values())
        .map((member) => ({ ...member, months: Array.from(memberMonths.get(member.id) || []) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      fetchedAt: new Date().toISOString(),
    });
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
    const categories = categoryPayload(body.categories);
    const { daily, createdParent } = await ensureDailyTask(token, body.date, { id: String(body.member.id), name: String(body.member.name) });
    await writeCategories(token, String(daily.id), categories);
    const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(daily.id), daily.status?.status || "to do", categories);
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
    const categories = categoryPayload(body.categories);
    await writeCategories(token, String(body.taskId), categories);
    const statusResult = await completeDailyTaskOnTimeIfPopulated(token, String(body.taskId), String(body.currentStatus || ""), categories);
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
    const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, { method: "DELETE", headers: { Authorization: token } });
    if (!response.ok) throw new Error("ClickUp could not delete the Daily Log record.");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notebook delete failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete the Daily Log." }, { status: 502 });
  }
}
