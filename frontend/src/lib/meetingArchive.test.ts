import { describe, expect, it } from "vitest";
import { parseMeetingContent, serializeMeetingContent } from "./meetingArchive";

describe("meeting archive content", () => {
  it("stores discussions and explicit actions separately, linked by discussion ID", () => {
    const serialized = serializeMeetingContent(
      [{ id: "dp-1", topic: "Budget", evidence: "[00:10] Budget was reviewed", discussion_point: "The team reviewed the budget." }],
      [{ id: "act-1", discussion_point_id: "dp-1", action_plan: "Send revised forecast", target_date: "2026-09-20", person_in_charge: "Dave", assignee_id: "42" }],
    );

    expect(parseMeetingContent(serialized)).toEqual({
      items: [{ id: "dp-1", topic: "Budget", evidence: "[00:10] Budget was reviewed", discussion_point: "The team reviewed the budget." }],
      action_items: [{ id: "act-1", discussion_point_id: "dp-1", action_plan: "Send revised forecast", target_date: "2026-09-20", person_in_charge: "Dave", assignee_id: "42", clickUpTaskId: undefined, clickUpUrl: undefined }],
    });
  });

  it("converts saved legacy action fields into separate linked records", () => {
    const result = parseMeetingContent(JSON.stringify([
      { id: "dp-1", topic_title: "Budget", evidence_quote: "[00:10] Budget was reviewed", discussion_point: "The team reviewed the budget.", action_plan: "Send revised forecast", indicative_delivery_date: "2026-09-20", person_in_charge: "Dave" },
      { id: "dp-2", topic_title: "Hiring", discussion_point: "Hiring needs were reviewed.", action_plan: "None", person_in_charge: "Unassigned" },
    ]));

    expect(result.items).toEqual([
      { id: "dp-1", topic: "Budget", evidence: "[00:10] Budget was reviewed", discussion_point: "The team reviewed the budget." },
      { id: "dp-2", topic: "Hiring", evidence: "", discussion_point: "Hiring needs were reviewed." },
    ]);
    expect(result.action_items).toEqual([
      { id: "dp-1-action-1", discussion_point_id: "dp-1", action_plan: "Send revised forecast", target_date: "2026-09-20", person_in_charge: "Dave", assignee_id: undefined, clickUpTaskId: undefined, clickUpUrl: undefined },
    ]);
  });

  it("reads older markdown archives without turning discussion text into an action", () => {
    const result = parseMeetingContent(`## 1. RFP automation\n**Discussion:** The team reviewed the workflow.\n**Action:** Confirm the next prototype.\n**Owner:** Dave\n**Target date:** 2026-09-18`);

    expect(result.items[0].discussion_point).toBe("The team reviewed the workflow.");
    expect(result.action_items[0]).toMatchObject({ discussion_point_id: "discussion-1", action_plan: "Confirm the next prototype.", target_date: "2026-09-18", person_in_charge: "Dave" });
  });
});
