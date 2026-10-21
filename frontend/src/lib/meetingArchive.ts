import type { DiscussionItem, MeetingActionItem } from "@/types/meeting";

export interface MeetingContent {
  items: DiscussionItem[];
  action_items: MeetingActionItem[];
}

const emptyValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^(?:none|n\/a|tbd|unassigned|null|undefined)$/i.test(text) ? "" : text;
};

function normalizeDiscussion(item: any, index: number): DiscussionItem {
  const id = item.id ?? `discussion-${index + 1}`;
  const suggestion = item.action_suggestion || (item.action_plan ? {
    action_plan: item.action_plan,
    target_date: item.target_date || item.indicative_delivery_date,
    person_in_charge: item.person_in_charge,
  } : undefined);

  return {
    id,
    topic: item.topic || item.topic_title || `Discussion topic ${index + 1}`,
    evidence: item.evidence || item.evidence_quote || "",
    discussion_point: item.discussion_point || "",
    ...(suggestion ? {
      action_suggestion: {
        action_plan: emptyValue(suggestion.action_plan),
        target_date: emptyValue(suggestion.target_date || suggestion.indicative_delivery_date),
        person_in_charge: emptyValue(suggestion.person_in_charge),
      },
    } : {}),
  };
}

function normalizeAction(item: any, index: number): MeetingActionItem {
  return {
    id: item.id ?? `action-${index + 1}`,
    discussion_point_id: item.discussion_point_id ?? item.discussion_id ?? "",
    action_plan: emptyValue(item.action_plan),
    target_date: emptyValue(item.target_date || item.indicative_delivery_date),
    person_in_charge: emptyValue(item.person_in_charge),
    ...(Array.isArray(item.assignee_ids)
      ? { assignee_ids: item.assignee_ids.map(String) }
      : item.assignee_id ? { assignee_ids: [String(item.assignee_id)] } : {}),
    assignee_id: item.assignee_ids?.[0] ? String(item.assignee_ids[0]) : item.assignee_id ? String(item.assignee_id) : undefined,
    clickUpTaskId: item.clickUpTaskId,
    clickUpUrl: item.clickUpUrl,
  };
}

function legacyContent(items: any[]): MeetingContent {
  const discussions = items.map((item, index) => normalizeDiscussion(item, index));
  const actions = items.flatMap((item, index) => {
    if (!emptyValue(item.action_plan)) return [];
    const discussion = discussions[index];
    return [normalizeAction({
      id: `${discussion.id}-action-1`,
      discussion_point_id: discussion.id,
      action_plan: item.action_plan,
      target_date: item.target_date || item.indicative_delivery_date,
      person_in_charge: item.person_in_charge,
      clickUpTaskId: item.clickUpTaskId,
      clickUpUrl: item.clickUpUrl,
    }, index)];
  });
  return { items: discussions.map(({ action_suggestion: _legacySuggestion, ...discussion }) => discussion), action_items: actions };
}

function parseLegacyMarkdown(section: string): MeetingContent {
  const blocks = section.split(/(?=^##\s+\d+\.\s+)/m).filter((block) => /^##\s+\d+\.\s+/.test(block.trim()));
  const oldItems = blocks.map((block, index) => {
    const heading = block.match(/^##\s+\d+\.\s+(.+?)(?:\r?\n|$)/);
    const field = (label: string) => block.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`, "mi"))?.[1]?.trim() || "";
    return {
      id: `discussion-${index + 1}`,
      topic: heading?.[1]?.trim(),
      discussion_point: field("Discussion"),
      action_plan: field("Action"),
      person_in_charge: field("Owner"),
      target_date: field("Target date"),
    };
  });
  return legacyContent(oldItems);
}

/** Read current split payloads and migrate older flattened ClickUp archive content in memory. */
export function parseMeetingContent(section: string): MeetingContent {
  if (!section.trim()) return { items: [], action_items: [] };
  try {
    const parsed = JSON.parse(section.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim());
    if (Array.isArray(parsed)) return legacyContent(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.discussion_points)) {
      return {
        items: parsed.discussion_points.map(normalizeDiscussion),
        action_items: (Array.isArray(parsed.action_items) ? parsed.action_items : []).map(normalizeAction),
      };
    }
  } catch {
    return parseLegacyMarkdown(section);
  }
  return { items: [], action_items: [] };
}

export function parseDiscussionItems(section: string): DiscussionItem[] {
  return parseMeetingContent(section).items;
}

export function serializeMeetingContent(items: DiscussionItem[], actionItems: MeetingActionItem[]): string {
  return JSON.stringify({ version: 2, discussion_points: items, action_items: actionItems }, null, 2);
}

export function createActionFromDiscussion(discussion: DiscussionItem, id: string | number): MeetingActionItem {
  return {
    id,
    discussion_point_id: discussion.id,
    action_plan: discussion.action_suggestion?.action_plan || "",
    target_date: discussion.action_suggestion?.target_date || "",
    person_in_charge: discussion.action_suggestion?.person_in_charge || "",
  };
}
