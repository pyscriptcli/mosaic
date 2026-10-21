import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getTokenFromRequest = vi.fn();
const getUserFromRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  cleanEnv: (value?: string) => value?.trim() || "",
  getTokenFromRequest,
  getUserFromRequest,
}));

describe("MeetStream bot route", () => {
  beforeEach(() => {
    vi.stubEnv("MEETSTREAM_API_KEY", "test-key");
    getTokenFromRequest.mockReturnValue("clickup-token");
    getUserFromRequest.mockReturnValue({ id: 42, email: "user@primephilippines.com" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts supported meeting links and creates an audio-only Echo bot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ bot_id: "bot-1", status: "Active" }), { status: 201 }));
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://echo.example/api/meetstream/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingLink: "https://meet.google.com/abc-defg-hij" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ botId: "bot-1", transcriptId: null, platform: "google_meet", status: "Active" });
    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(request?.body));
    expect(payload).toMatchObject({
      bot_name: "Mosaic Notetaker",
      callback_url: "https://echo.example/api/meetstream/webhook",
      video_required: false,
    });
    expect(payload.live_transcription_required).toBeUndefined();
    expect(payload.recording_config).toBeUndefined();
  });

  it("rejects unsupported or malformed links before calling MeetStream", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://echo.example/api/meetstream/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingLink: "https://example.com/meeting" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Paste a valid Google Meet, Microsoft Teams, or Zoom meeting link." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing server configuration without exposing a secret", async () => {
    vi.stubEnv("MEETSTREAM_API_KEY", "");
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://echo.example/api/meetstream/bots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingLink: "https://meet.google.com/abc-defg-hij" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Meeting bot setup is not configured yet." });
  });
});
