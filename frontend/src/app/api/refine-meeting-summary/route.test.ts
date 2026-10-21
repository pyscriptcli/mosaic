import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/refine-meeting-summary", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
  });

  it("refines summary fields from meeting notes and transcript without returning unsupported facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "Refined summary", bottom_line: "Agreed to proceed." }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/refine-meeting-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Original summary",
        bottom_line: "Original bottom line",
        notes: "Agenda: renewal review",
        transcript: "The team agreed to proceed.",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ summary: "Refined summary", bottom_line: "Agreed to proceed." });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.messages[1].content).toContain("Agenda: renewal review");
    expect(request.messages[1].content).toContain("The team agreed to proceed.");
  });

  it("applies the selected refinement style as bounded guidance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "Concise summary", bottom_line: "Decision pending." }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/refine-meeting-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Original summary",
        bottom_line: "Original bottom line",
        notes: "Renewal review",
        refinement_style: "concise",
      }),
    }));

    expect(response.status).toBe(200);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.messages[0].content).toContain("Prefer short sentences and retain only material context");
    expect(request.messages[0].content).toContain("do not omit decisions, dates, owners, risks, or unresolved questions");
  });
});
