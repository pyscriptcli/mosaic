import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/generate-minutes", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses supplied meeting notes as context and separates them from the transcript", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matched_items: [],
                  recommended_missed_points: [],
                  other_discussions: "",
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/generate-minutes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "=== MEETING NOTES ===\nOld agenda\n\n=== TRANSCRIPT ===\n[00:12] Nag-usap kami tungkol sa project.",
        user_topics: "Advisor account updates",
        notes: "Agenda: Advisor account updates\nCorrect project name: Project Alon",
      }),
    });

    const response = await POST(req);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    const systemPrompt = requestBody.messages[0].content as string;
    const userPrompt = requestBody.messages[1].content as string;

    expect(response.status).toBe(200);
    expect(systemPrompt).toContain("Meeting notes are the primary source of truth");
    expect(systemPrompt).toContain("Do not create discussion, decisions, or action items solely because they appear as agenda topics.");
    expect(systemPrompt).toContain("Start each discussion_point with one short introductory paragraph before its detail bullets.");
    expect(systemPrompt).toContain("Never begin a discussion_point with a bullet or put bullets before the introductory paragraph.");
    expect(systemPrompt).toContain("Do not include literal backslashes before bullet or bold markers");
    expect(systemPrompt).toContain("Do not include action plans, target dates, owners, or transcript evidence inside discussion_point.");
    expect(systemPrompt).toContain("Keep discussion points and action items distinct.");
    expect(userPrompt).toContain("<meeting_notes>\nAgenda: Advisor account updates\nCorrect project name: Project Alon\n</meeting_notes>");
    expect(userPrompt).toContain("<transcript>\n[00:12] Nag-usap kami tungkol sa project.\n</transcript>");
    expect(userPrompt).not.toContain("Old agenda");
  });

  it("uses notes embedded in a legacy transcript as context when separate notes are absent", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matched_items: [],
                  recommended_missed_points: [],
                  other_discussions: "",
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/generate-minutes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "=== MEETING NOTES ===\nAttendees: Ana and Ben\n\n=== TRANSCRIPT ===\n[00:20] The account is progressing.",
        user_topics: "General Meeting Agenda",
      }),
    });

    const response = await POST(req);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    const userPrompt = requestBody.messages[1].content as string;

    expect(response.status).toBe(200);
    expect(userPrompt).toContain("<meeting_notes>\nAttendees: Ana and Ben\n</meeting_notes>");
    expect(userPrompt).toContain("<transcript>\n[00:20] The account is progressing.\n</transcript>");
  });

  it("uses the indexed materiality rubric and returns classified insight fields", async () => {
    const generatedMinutes = {
      summary: "The team reviewed the launch plan.",
      bottom_line: "Launch timing depends on client approval.",
      matched_items: [{
        category: "insight",
        importance: "material",
        topic_title: "Client approval risk",
        discussion_point: "The client has not approved the revised schedule.",
        why_it_matters: "The launch date depends on approval.",
        evidence_quote: "[00:42] We still need the client to approve this schedule.",
        action_plan: "None",
        indicative_delivery_date: "TBD",
        person_in_charge: "Unassigned",
        confidence: "High",
      }],
      recommended_missed_points: [],
      other_discussions: "",
    };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedMinutes) } }] }), { status: 200 }),
    );
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/generate-minutes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "[00:42] We still need the client to approve this schedule." }),
    });

    const response = await POST(req);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    const systemPrompt = requestBody.messages[0].content as string;

    expect(systemPrompt).toContain("# PROMPT INDEX");
    expect(systemPrompt).toContain("2. Importance rubric");
    expect(systemPrompt).toContain("3. Key insight test");
    expect(systemPrompt).toContain("identify candidate points; resolve source conflicts using section 4; classify each point using section 2");
    expect(systemPrompt).toContain("An insight is a source-supported observation");
    expect(await response.json()).toEqual(generatedMinutes);
  });
});
