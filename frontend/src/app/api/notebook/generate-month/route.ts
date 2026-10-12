import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { clickUpScope } from "@/lib/clickupReadStore";
import { readStagedMosaicRecords, scheduleMosaicWriteSync } from "@/lib/mosaicWriteStore";
import {
  createTask,
  dateFromTask,
  fetchAllTasks,
  formatDailyName,
  formatParentName,
  monthFromTaskName,
  requestToken,
  taskOwner,
} from "@/lib/notebookClickup";

export const maxDuration = 60;

interface GenerateMonthRequest {
  month: string; // "YYYY-MM"
  member: {
    id: string;
    name: string;
  };
  limit?: number;
}

function getWeekdaysInMonth(monthStr: string): string[] {
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return [];

  // Get total days in month
  const totalDays = new Date(year, month, 0).getDate();
  const weekdays: string[] = [];

  for (let day = 1; day <= totalDays; day++) {
    // Check day of week (0 is Sunday, 6 is Saturday)
    const d = new Date(year, month - 1, day, 12, 0, 0);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      weekdays.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }

  return weekdays;
}

export async function POST(req: NextRequest) {
  const token = requestToken(req);
  if (!token) {
    return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  }

  try {
    const ownerUserId = String(getUserFromRequest(req)?.id || "");
    if (!ownerUserId) return NextResponse.json({ error: "Your ClickUp profile is required to generate Daily Log records." }, { status: 401 });
    const body = (await req.json()) as GenerateMonthRequest;
    if (!body?.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json({ error: "A valid month in YYYY-MM format is required." }, { status: 400 });
    }
    if (!body?.member?.id || !body?.member?.name) {
      return NextResponse.json({ error: "A team member is required." }, { status: 400 });
    }

    const { month, member } = body;
    const targetWeekdays = getWeekdaysInMonth(month);
    if (!targetWeekdays.length) {
      return NextResponse.json({ error: "No weekdays found for the specified month." }, { status: 400 });
    }

    // Fetch existing tasks
    const remoteTasks = await fetchAllTasks(token);
    const stagedRows = await readStagedMosaicRecords(clickUpScope(token), "notebook", "901418075633");
    const stagedIds = new Map(stagedRows.map((row) => [String(row.record_id), String(row.clickup_id || row.record_id)]));
    const taskMap = new Map(remoteTasks.map((task) => [String(task.id), task]));
    for (const row of stagedRows) {
      const id = String(row.clickup_id || row.record_id);
      if (row.is_deleted) { taskMap.delete(id); taskMap.delete(String(row.record_id)); continue; }
      const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
      taskMap.set(id, { ...(taskMap.get(id) || {}), ...data, ...(typeof data.parent === "string" && data.parent ? { parent: stagedIds.get(data.parent) || data.parent } : {}), id } as typeof remoteTasks[number]);
    }
    const rawTasks = [...taskMap.values()];
    const byId = new Map(rawTasks.map((t) => [String(t.id), t]));

    // Find or create month parent task
    let parent = rawTasks.find(
      (task) =>
        !task.parent &&
        monthFromTaskName(task.name) === month &&
        taskOwner(task, byId).id === member.id,
    );

    const numericMemberId = /^\d+$/.test(member.id) ? Number(member.id) : undefined;

    if (!parent) {
      parent = await createTask(token, {
        name: formatParentName(`${month}-01`, member),
        assignees: numericMemberId ? [numericMemberId] : [],
      }, ownerUserId);
      byId.set(String(parent.id), parent);
    }

    // Determine existing dates under this parent or matching member and date
    const existingDates = new Set<string>();
    for (const task of rawTasks) {
      if (task.parent === parent.id) {
        const d = dateFromTask(task);
        if (d && d.startsWith(month)) {
          existingDates.add(d);
        }
      }
    }

    // Missing weekdays to create
    const missingDates = targetWeekdays.filter((date) => !existingDates.has(date));
    const batchLimit = body.limit && body.limit > 0 ? body.limit : missingDates.length;
    const toProcess = missingDates.slice(0, batchLimit);

    // Stage local records quickly; the outbox applies them to ClickUp after the response.
    const createdTasks: Array<{ id: string; name?: string; date: string }> = [];
    for (let i = 0; i < toProcess.length; i++) {
      const date = toProcess[i];
      const [year, mNum, day] = date.split("-").map(Number);
      const startOfDayUtc = Date.UTC(year, mNum - 1, day, 9, 0, 0);
      const endOfDayUtc = Date.UTC(year, mNum - 1, day, 18, 0, 0);

      const created = await createTask(token, {
        name: formatDailyName(date),
        parent: parent.id,
        assignees: numericMemberId ? [numericMemberId] : [],
        start_date: String(startOfDayUtc),
        due_date: String(endOfDayUtc),
      }, ownerUserId);

      createdTasks.push({ id: String(created.id), name: created.name, date });

    }
    if (createdTasks.length || !parent) scheduleMosaicWriteSync();

    const remainingCount = missingDates.length - toProcess.length;

    return NextResponse.json({
      success: true,
      month,
      member,
      parentTaskId: parent.id,
      parentTaskName: parent.name,
      totalWeekdays: targetWeekdays.length,
      existingCount: existingDates.size + createdTasks.length,
      createdCount: createdTasks.length,
      remainingCount,
      createdTasks,
      pendingSync: true,
    }, { status: createdTasks.length ? 202 : 200 });
  } catch (error) {
    console.error("Generate month tasks failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate month tasks in ClickUp." },
      { status: 502 },
    );
  }
}
