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
  titlePt: 22,
  headingPt: 14,
  bodyPt: 10.5,
  actionPt: 9.5,
  pageMarginMm: 20,
  lineSpacingTwips: 276,
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
  const date = cleanMeetingExportField(details?.date);
  const dateTime = date && time ? `${date} (${time})` : date || time;

  return [
    ["PROJECT / CLIENT", cleanMeetingExportField(details?.client_name)],
    ["DATE & TIME", dateTime],
    ["VENUE / LOCATION", cleanMeetingExportField(details?.location)],
    ["MEETING TYPE", cleanMeetingExportField(details?.meeting_type)],
    ["TEAM ATTENDEES", cleanMeetingExportField(details?.team_attendees || details?.prime_attendees)],
    ["EXTERNAL ATTENDEES", cleanMeetingExportField(details?.external_attendees)],
  ].filter(([, value]) => value) as [string, string][];
}

export function meetingExportActionFields(item: MeetingExportAction): [string, string, string, string] {
  return [
    cleanMeetingExportField(item.discussion_point_title || item.topic_title),
    cleanMeetingExportField(item.action_plan),
    cleanMeetingExportField(item.target_date || item.indicative_delivery_date),
    cleanMeetingExportField(item.person_in_charge),
  ];
}

export function meetingExportSummary(value: unknown): { summary: string; outcome: string } {
  const paragraphs = cleanMeetingExportField(value).split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  return {
    summary: paragraphs[0] || "",
    outcome: paragraphs.length > 1 ? paragraphs.slice(1).join(" ").replace(/^bottom\s*line:\s*/i, "") : "",
  };
}

export function meetingExportContentLines(value: string) {
  return value.replace(/\\+\*/g, "*").split(/\r?\n/).map((raw) => {
    const normalized = raw.trim().replace(/\\-/g, "-");
    const bullet = normalized.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    return { text: bullet ? bullet[1] : normalized, bullet: Boolean(bullet) };
  });
}

export function meetingExportInlineRuns(value: string) {
  return value.replace(/\\+\*/g, "*").split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return { text: bold ? part.slice(2, -2) : part, bold };
  });
}
