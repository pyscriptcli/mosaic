import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/discover-topics", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    vi.restoreAllMocks();
  });

  it("returns empty topics when transcript is empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { POST } = await import("./route");

    const req = new NextRequest("http://localhost/api/discover-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "   " }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ topics: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects request with 401 when no API key is available", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const { POST } = await import("./route");

    const req = new NextRequest("http://localhost/api/discover-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "Some meeting content" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("discovers discussion points separately from optional action suggestions", async () => {
    const mockTopics = [
      {
        topic_title: "Signing Sequence Preference (Landlord Signs First)",
        discussion_point: "Property owners should execute the contract ahead due to internal routing approvals.",
        evidence_quote: "[00:10:09] it will be best that um it will be the property owners to sign ahead.",
        action_plan: "Ensure standard contract draft is sent to landlord first.",
        indicative_delivery_date: "October 6, 2026",
        person_in_charge: "Melisa",
        confidence: "High",
      },
    ];

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ topics: mockTopics }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/discover-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "=== MEETING NOTES ===\nOutdated agenda\n\n=== TRANSCRIPT ===\nMeeting transcript about landlord signing...",
        notes: "Agenda: Advisor account updates\nCorrect name: Melisa",
        existingTopics: ["Site Sourcing SLA"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.topics).toHaveLength(1);
    expect(json.topics[0]).toEqual({
      topic_title: "Signing Sequence Preference (Landlord Signs First)",
      discussion_point: "Property owners should execute the contract ahead due to internal routing approvals.",
      evidence_quote: "[00:10:09] it will be best that um it will be the property owners to sign ahead.",
      action_plan: "Ensure standard contract draft is sent to landlord first.",
      indicative_delivery_date: "October 6, 2026",
      person_in_charge: "Melisa",
      confidence: "High",
    });
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(requestBody.messages[0].content).toContain("Meeting notes are the primary source of truth");
    expect(requestBody.messages[0].content).toContain("Return discussion points only; never treat every discussion point as an action item.");
    expect(requestBody.messages[0].content).toContain('"action_plan": Optional suggestion only when the transcript contains an explicit commitment or assigned next step.');
    expect(requestBody.messages[0].content).toContain("Start with one short introductory paragraph that frames the topic.");
    expect(requestBody.messages[0].content).toContain("Never start with a bullet or put bullets before the introductory paragraph.");
    expect(requestBody.messages[0].content).toContain("Start with one short introductory paragraph that frames the topic.");
    expect(requestBody.messages[0].content).toContain("Never start with a bullet or put bullets before the introductory paragraph.");
    expect(requestBody.messages[0].content).toContain("Do not put literal backslashes before bullet or bold markers.");
    expect(requestBody.messages[0].content).toContain("Do not include action plans, dates, owners, or transcript evidence inside discussion_point.");
    expect(requestBody.messages[1].content).toContain("<meeting_notes>\nAgenda: Advisor account updates\nCorrect name: Melisa\n</meeting_notes>");
    expect(requestBody.messages[1].content).toContain("<transcript>\nMeeting transcript about landlord signing...\n</transcript>");
    expect(requestBody.messages[1].content).not.toContain("Outdated agenda");
  });

  it("normalizes legacy topic and quote keys and falls back gracefully", async () => {
    const legacyMock = [
      {
        topic: "Reclamation Projects",
        quote: "[01:14:00] government is planning to pursue reclamation",
      },
    ];

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ topics: legacyMock }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/discover-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "Meeting transcript about reclamation...",
        query: "reclamation",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.topics).toHaveLength(1);
    expect(json.topics[0].topic_title).toBe("Reclamation Projects");
    expect(json.topics[0].evidence_quote).toBe("[01:14:00] government is planning to pursue reclamation");
    expect(json.topics[0].action_plan).toBe("None");
    expect(json.topics[0].indicative_delivery_date).toBe("TBD");
    expect(json.topics[0].person_in_charge).toBe("Unassigned");
    expect(json.topics[0].confidence).toBe("High");
  });
});
