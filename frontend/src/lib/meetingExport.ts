import { formatEchoTime } from "@/lib/dateUtils";

export type MeetingExportDetails = {
  client_name?: unknown;
  date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  location?: unknown;
  meeting_type?: unknown;
  team_attendees?: unknown;
  prime_attendees?: unknown;
  external_attendees?: unknown;
};

export type MeetingExportDiscussion = {
  topic_title?: unknown;
  discussion_point?: unknown;
};

export type MeetingExportAction = {
  discussion_point_title?: unknown;
  topic_title?: unknown;
  action_plan?: unknown;
  target_date?: unknown;
  indicative_delivery_date?: unknown;
  person_in_charge?: unknown;
};

export type MeetingExportRequest = {
  meeting_details?: MeetingExportDetails;
  discussion_points?: MeetingExportDiscussion[];
  action_items?: MeetingExportAction[];
  summary?: unknown;
  outcome?: unknown;
  other_discussions?: unknown;
};

export const MEETING_EXPORT_STYLE = {
  blue: "003366",
  blueRgb: [0, 51, 102] as [number, number, number],
  gold: "C9A84C",
  goldRgb: [201, 168, 76] as [number, number, number],
  warmWhite: "FFFCFB",
  warmWhiteRgb: [255, 252, 251] as [number, number, number],
  gray: "181D1E",
  grayRgb: [24, 29, 30] as [number, number, number],
  wordBodyFont: "Arial",
  wordHeadingFont: "Georgia",
  pdfBodyFont: "helvetica",
  pdfHeadingFont: "times",
  titlePt: 24,
  headingPt: 15,
  bodyPt: 10.5,
  actionPt: 9.5,
  pageMarginMm: 20,
  lineSpacingTwips: 270,
} as const;

export function cleanMeetingExportField(value: unknown): string {
  if (value == null || value === false) return "";
  if (Array.isArray(value)) return value.map(cleanMeetingExportField).filter(Boolean).join(", ");
  const text = String(value).trim();
  return ["none", "n/a", "tbd", "unassigned", "null", "undefined"].includes(text.toLowerCase()) ? "" : text;
}

export function meetingExportDetails(details?: MeetingExportDetails) {
  const startTime = formatEchoTime(cleanMeetingExportField(details?.start_time));
  const endTime = formatEchoTime(cleanMeetingExportField(details?.end_time));
  const time = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime;
  const date = formatMeetingExportDate(cleanMeetingExportField(details?.date));
  const dateTime = date && time ? `${date} (${time})` : date || time;
  const dateLabel = date && time ? "DATE / TIME" : date ? "DATE" : "TIME";

  return [
    ["CLIENT", cleanMeetingExportField(details?.client_name)],
    [dateLabel, dateTime],
    ["LOCATION", cleanMeetingExportField(details?.location)],
    ["MEETING TYPE", cleanMeetingExportField(details?.meeting_type)],
    ["PRIME ATTENDEES", cleanMeetingExportField(details?.team_attendees || details?.prime_attendees)],
    ["CLIENT ATTENDEES", cleanMeetingExportField(details?.external_attendees)],
  ].filter(([, value]) => value) as [string, string][];
}

export function meetingExportTemplateDetails(details?: MeetingExportDetails): [string, string][] {
  const attendees = [
    cleanMeetingExportField(details?.team_attendees || details?.prime_attendees),
    cleanMeetingExportField(details?.external_attendees),
  ].filter(Boolean).join(", ");

  return [
    ["CLIENT", cleanMeetingExportField(details?.client_name)],
    ["ATTENDEES", attendees],
    ["LOCATION", cleanMeetingExportField(details?.location)],
    ["MEETING TYPE", cleanMeetingExportField(details?.meeting_type)],
  ].filter(([, value]) => value) as [string, string][];
}

export function formatMeetingExportTitleDate(value: unknown): string {
  const dateValue = cleanMeetingExportField(value);
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue.toUpperCase();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime())
    ? dateValue.toUpperCase()
    : new Intl.DateTimeFormat("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(date).toUpperCase();
}

export function formatMeetingExportDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function meetingExportActionFields(item: MeetingExportAction): [string, string, string, string] {
  const topic = cleanMeetingExportField(item.discussion_point_title || item.topic_title);
  const action = cleanMeetingExportField(item.action_plan);
  return [
    topic || "Not recorded",
    action,
    formatMeetingExportDate(cleanMeetingExportField(item.target_date || item.indicative_delivery_date)) || "Not recorded",
    cleanMeetingExportField(item.person_in_charge) || "Not recorded",
  ];
}

export function meetingExportSummary(value: unknown, explicitOutcome?: unknown): { summary: string; outcome: string } {
  const paragraphs = cleanMeetingExportField(value).split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  const legacyOutcome = paragraphs.slice(1).find((part) => /^bottom\s*line\s*:/i.test(part));
  return {
    summary: [paragraphs[0], ...paragraphs.slice(1).filter((part) => part !== legacyOutcome)].filter(Boolean).join("\n\n"),
    outcome: cleanMeetingExportField(explicitOutcome) || legacyOutcome?.replace(/^bottom\s*line\s*:\s*/i, "") || "",
  };
}

export function meetingExportContentLines(value: string) {
  return value.replace(/\\+\*/g, "*").split(/\r?\n/).map((raw) => {
    const normalized = raw.trim().replace(/\\-/g, "-");
    const ordered = normalized.match(/^(\d+)[.)]\s+(.*)$/);
    const bullet = normalized.match(/^[-*•]\s+(.*)$/);
    return { text: ordered?.[2] || bullet?.[1] || normalized, bullet: Boolean(bullet), number: ordered?.[1] };
  });
}

export function meetingExportInlineRuns(value: string) {
  return value.replace(/\\+\*/g, "*").split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return { text: bold ? part.slice(2, -2) : part, bold };
  });
}
