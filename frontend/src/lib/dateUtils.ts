/**
 * Utility for formatting dates globally across Mosaic
 * Required format: "September 9, 2026"
 */

export function formatEchoDate(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateInput);
  }
}

export function formatEchoDateTime(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return "";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const dateStr = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return String(dateInput);
  }
}

/** Format a time-only value as a 12-hour clock without changing its date or timezone. */
export function formatEchoTime(timeInput: string | null | undefined): string {
  if (!timeInput) return "";

  const value = timeInput.trim();
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return value;

  const rawHour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3]?.toUpperCase();
  if (rawHour > (suffix ? 12 : 23) || rawHour < (suffix ? 1 : 0)) return value;

  const period = suffix ?? (rawHour >= 12 ? "PM" : "AM");
  const hour = rawHour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}
