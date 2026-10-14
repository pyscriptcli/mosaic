import { fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";

function idPart(value: string, fallback: string) {
  const result = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || fallback;
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}${part("month")}${part("day")}`;
}

/**
 * Builds a readable sequence ID from the current ClickUp list. ClickUp remains
 * the source of truth: completed and active tasks are both considered.
 */
export async function createFormRequestId({
  token,
  listId,
  department,
  formName,
}: {
  token: string;
  listId: string;
  department: string;
  formName: string;
}) {
  const prefix = `FORMS-${idPart(department, "GENERAL")}-${idPart(formName, "REQUEST")}-${manilaDate()}`;
  let sequence = 1;

  try {
    const tasks = await fetchAllClickUpListTasks<{ name?: string }>(token, listId);
    if (Array.isArray(tasks)) {
      const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)(?:\\s|$)`);
      sequence = tasks.reduce((highest: number, task) => {
        const match = task.name?.match(matcher);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0) + 1;
    }
  } catch {
    // Creation continues with the first sequence when the existing task list
    // cannot be read; ClickUp creation remains available to the requestor.
  }

  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}
