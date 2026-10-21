import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resetGroqPool } from "@/lib/groqPool";

const requireFeature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access-control-server", () => ({ requireFeature }));

function chunkRequest() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "chunk.webm", { type: "audio/webm" }));
  form.append("action", "transcribe_chunk");
  return new NextRequest("https://echo.example/api/process-audio", { method: "POST", body: form });
}

describe("botless transcription routing", () => {
  beforeEach(() => {
    requireFeature.mockReset();
    requireFeature.mockResolvedValue(null);
  });

  afterEach(async () => {
    resetGroqPool();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses Groq Whisper before paid providers", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ text: "Hello team" }), { status: 200 }));
    const { POST } = await import("./route");

    const response = await POST(chunkRequest());

    expect(await response.json()).toMatchObject({ transcript: "Hello team", provider: "groq" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
  });

  it("rejects denied recording access before invoking a transcription provider", async () => {
    requireFeature.mockResolvedValue(NextResponse.json({ code: "FEATURE_FORBIDDEN" }, { status: 403 }));
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");
    const response = await POST(chunkRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FEATURE_FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("round-robins across multiple Groq API keys", async () => {
    vi.stubEnv("GROQ_API_KEY", "key-alpha");
    vi.stubEnv("GROQ_API_KEY_2", "key-beta");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "From alpha" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "From beta" }), { status: 200 }));
    const { POST } = await import("./route");

    const res1 = await POST(chunkRequest());
    expect(await res1.json()).toMatchObject({ transcript: "From alpha", provider: "groq" });

    const res2 = await POST(chunkRequest());
    expect(await res2.json()).toMatchObject({ transcript: "From beta", provider: "groq" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const authHeaders = fetchMock.mock.calls.map((call) => (call[1] as RequestInit)?.headers);
    expect(authHeaders).toEqual([
      { Authorization: "Bearer key-alpha" },
      { Authorization: "Bearer key-beta" },
    ]);
  });

  it("fails over to secondary Groq key on 429 without touching OpenRouter", async () => {
    vi.stubEnv("GROQ_API_KEY", "key-alpha");
    vi.stubEnv("GROQ_API_KEY_2", "key-beta");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key");

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429, headers: { "retry-after": "30" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "Rescued by beta" }), { status: 200 }));
    const { POST } = await import("./route");

    const response = await POST(chunkRequest());

    expect(await response.json()).toMatchObject({ transcript: "Rescued by beta", provider: "groq" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((fetchMock.mock.calls[1][1] as RequestInit)?.headers).toEqual({ Authorization: "Bearer key-beta" });
  });

  it("honors Groq rate limiting across all keys and falls back to OpenRouter", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Rate limited" } }), { status: 429, headers: { "retry-after": "30" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "Fallback transcript" }), { status: 200 }));
    const { POST } = await import("./route");

    const response = await POST(chunkRequest());

    expect(await response.json()).toMatchObject({ transcript: "Fallback transcript", provider: "openrouter" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.groq.com/openai/v1/audio/transcriptions",
      "https://openrouter.ai/api/v1/audio/transcriptions",
    ]);
  });

  it("records Groq pool performance metadata in telemetry", async () => {
    vi.stubEnv("GROQ_API_KEY", "key-alpha-1234567890");
    vi.stubEnv("GROQ_API_KEY_2", "key-beta-1234567890");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ text: "Telemetry test" }), { status: 200 }));

    const telemetry = await import("@/lib/telemetry");
    const recordSpy = vi.spyOn(telemetry, "recordTelemetry");

    const { POST } = await import("./route");

    const req = chunkRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "groq",
        metadata: expect.objectContaining({
          groqKeyIndex: 1,
          groqKeyAlias: "groq_key_1",
          groqPoolSize: 2,
          groqAttempts: 1,
          groqFailoverOccurred: false,
        }),
      })
    );
  });
});
