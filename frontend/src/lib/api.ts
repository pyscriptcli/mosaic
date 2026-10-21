import { isAudioFile, runAudioPipeline, AudioTelemetry } from "./audioPipeline";
export type { AudioTelemetry };

export function getStoredApiKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_api_key") || "";
  }
  return "";
}

export function setStoredApiKey(key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_api_key", key.trim());
  }
}

export function getStoredOpenAiKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_openai_key") || "";
  }
  return "";
}

export function setStoredOpenAiKey(key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_openai_key", key.trim());
  }
}

export function getStoredOpenRouterKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_openrouter_key") || "";
  }
  return "";
}

export function setStoredOpenRouterKey(key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_openrouter_key", key.trim());
  }
}

export function getStoredGeminiKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_gemini_key") || "";
  }
  return "";
}

export function setStoredGeminiKey(key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_gemini_key", key.trim());
  }
}

export function getStoredClickUpToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_clickup_token") || "";
  }
  return "";
}

export function setStoredClickUpToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_clickup_token", token.trim());
  }
}

export function getStoredClickUpListId(): string {
  if (typeof window !== "undefined") {
    const fromStorage = localStorage.getItem("project_echo_clickup_list_id");
    if (fromStorage) return fromStorage;
    const match = document.cookie.match(/(^|;)\s*echo_clickup_list_id=([^;]+)/);
    if (match) return decodeURIComponent(match[2]);
  }
  return "";
}

export function setStoredClickUpListId(listId: string) {
  if (typeof window !== "undefined") {
    const trimmed = listId.trim();
    localStorage.setItem("project_echo_clickup_list_id", trimmed);
    const isProd = window.location.protocol === "https:";
    document.cookie = `echo_clickup_list_id=${encodeURIComponent(trimmed)}; path=/; max-age=2592000; SameSite=Lax${isProd ? "; Secure" : ""}`;
  }
}

export function getStoredClickUpListName(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("project_echo_clickup_list_name") || "";
  }
  return "";
}

export function setStoredClickUpListName(name: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("project_echo_clickup_list_name", name.trim());
  }
}

function getAudioApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const storedKey = getStoredApiKey();
  if (storedKey) headers["x-api-key"] = storedKey;

  const storedOpenAi = getStoredOpenAiKey();
  if (storedOpenAi) headers["x-openai-api-key"] = storedOpenAi;

  const storedOpenRouter = getStoredOpenRouterKey();
  if (storedOpenRouter) headers["x-openrouter-api-key"] = storedOpenRouter;

  const storedGemini = getStoredGeminiKey();
  if (storedGemini) headers["x-gemini-api-key"] = storedGemini;

  return headers;
}

async function transcribeSingleChunk(
  chunkBlob: Blob,
  chunkIndex: number,
  totalChunks: number,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const formData = new FormData();
  formData.append("file", chunkBlob, `chunk_${chunkIndex + 1}.wav`);
  formData.append("action", "transcribe_chunk");
  formData.append("chunk_index", String(chunkIndex));
  if (totalChunks > 0) formData.append("total_chunks", String(totalChunks));

  const res = await fetch("/api/process-audio", {
    method: "POST",
    headers,
    body: formData,
    signal,
  });

  if (!res.ok) {
    let errMsg = `Failed to transcribe chunk ${chunkIndex + 1}`;
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch (e) {
      errMsg = `Server error (${res.status} ${res.statusText})`;
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.transcript || "";
}

export async function processSource(
  fileOrText: { file?: File | null; text?: string },
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<{ transcript: string; metadata: any; telemetry?: AudioTelemetry }> {
  const headers = getAudioApiHeaders();

  // 1. Audio Processing through the 10-Layer Resilient Pipeline
  if (fileOrText.file && isAudioFile(fileOrText.file) && typeof window !== "undefined") {
    try {
      const pipelineResult = await runAudioPipeline(
        fileOrText.file,
        (chunkBlob, idx) => transcribeSingleChunk(chunkBlob, idx, 0, headers, signal),
        onProgress,
        signal
      );

      onProgress?.("Extracting structured meeting metadata...");
      // Send assembled text to extract metadata with DeepSeek/AI
      const metaRes = await processSource({ text: pipelineResult.transcript }, onProgress, signal);

      return {
        transcript: pipelineResult.transcript,
        metadata: metaRes.metadata,
        telemetry: pipelineResult.telemetry,
      };
    } catch (pipelineErr: any) {
      if (signal?.aborted || pipelineErr?.name === "AbortError") {
        throw pipelineErr;
      }
      console.warn("Audio pipeline fallback triggered:", pipelineErr);

      if (fileOrText.file.size > 4.2 * 1024 * 1024) {
        throw new Error(
          `Audio file (${(fileOrText.file.size / (1024 * 1024)).toFixed(1)}MB) could not be processed: ${pipelineErr.message || "Decoding error"}. Please export as MP3/WAV or paste meeting text.`
        );
      }
      // Fallback: file is under 4.2MB, continue to direct upload below
    }
  }

  // 2. Large Non-Audio File Guard (Avoids cryptic 413 from Vercel)
  if (fileOrText.file && !isAudioFile(fileOrText.file) && fileOrText.file.size > 4.2 * 1024 * 1024) {
    throw new Error(
      `Document (${(fileOrText.file.size / (1024 * 1024)).toFixed(1)}MB) exceeds Vercel's 4.5MB serverless upload limit. Please upload a smaller document or paste the text directly.`
    );
  }

  // 3. Direct Upload / Text Processing
  const formData = new FormData();
  if (fileOrText.file) {
    formData.append("file", fileOrText.file);
  }
  if (fileOrText.text) {
    formData.append("text", fileOrText.text);
  }

  const res = await fetch("/api/process-audio", {
    method: "POST",
    headers,
    body: formData,
    signal,
  });

  if (!res.ok) {
    let errMsg = "Failed to process source.";
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch (e) {
      errMsg = `Server error (${res.status} ${res.statusText})`;
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export const processAudio = (file: File) => processSource({ file });

export async function generateMinutes(transcript: string, user_topics: string, notes: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const storedKey = getStoredApiKey();
  if (storedKey) {
    headers["x-api-key"] = storedKey;
  }

  const res = await fetch("/api/generate-minutes", {
    method: "POST",
    headers,
    body: JSON.stringify({ transcript, user_topics, notes }),
  });

  if (!res.ok) {
    let errMsg = "Failed to generate minutes.";
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch (e) {
      errMsg = `Server error (${res.status} ${res.statusText})`;
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function askEcho(
  question: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }> = [],
  signal?: AbortSignal,
  currentMeeting?: {
    elapsedSeconds: number;
    segments: Array<{ index: number; startedAtSeconds: number; text: string }>;
    notes: Array<{ timestamp: string; text: string }>;
  }
) {
  const res = await fetch("/api/ask-echo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, conversation, currentMeeting }),
    signal,
  });

  if (!res.ok) {
    let errMsg = "Ask Echo request failed.";
    try {
      const err = await res.json();
      errMsg = err.error || errMsg;
    } catch (e) {
      errMsg = `Server error (${res.status} ${res.statusText})`;
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function saveMeeting(metadata: any, items: any[], action_items: any[], summary: string, other_discussions: string, transcript: string, meeting_notes?: string) {
  const res = await fetch("/api/save-meeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_details: metadata,
      items,
      action_items,
      summary,
      other_discussions,
      transcript,
      meeting_notes,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to save meeting.");
  }
  return res.json();
}

export async function fetchMeetings(spaceId?: string, personalListId?: string) {
  const headers = getClickUpHeaders();
  if (personalListId) {
    headers["x-personal-list-id"] = personalListId;
  }
  let url = spaceId && spaceId !== "__all__"
    ? `/api/meetings?spaceId=${encodeURIComponent(spaceId)}`
    : "/api/meetings?all=true";
  if (personalListId) {
    url += `&personalListId=${encodeURIComponent(personalListId)}`;
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load meetings.");
  }
  return res.json();
}

export async function moveMeetingArchive(payload: {
  meetingId: string;
  destinationListId: string;
  sourceListId?: string;
  isConfidential?: boolean;
  destinationSpaceId?: string;
  destinationSpaceName?: string;
  destinationListName?: string;
}) {
  const headers = getClickUpHeaders();
  headers["Content-Type"] = "application/json";
  const res = await fetch("/api/meetings/move", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to relocate meeting archive.");
  }
  return res.json();
}

export async function fetchSpaceLists(spaceId: string) {
  const headers = getClickUpHeaders();
  const res = await fetch(`/api/tasks?action=space-lists&spaceId=${encodeURIComponent(spaceId)}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch lists for space.");
  }
  return res.json();
}

export async function deleteMeeting(meetingId: string) {
  const res = await fetch(`/api/meetings?meetingId=${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete meeting.");
  }
  return res.json();
}

export async function exportWord(metadata: any, items: any[], action_items: any[], summary: string, other_discussions: string) {
  const res = await fetch("/api/export-word", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_details: metadata,
      discussion_points: items,
      action_items,
      summary,
      other_discussions,
    }),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MoM_${metadata.client_name || "Meeting"}_${new Date().toISOString().split("T")[0]}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function requestMeetingPdf(metadata: any, items: any[], action_items: any[], summary: string, other_discussions: string) {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting_details: metadata,
      discussion_points: items,
      action_items,
      summary,
      other_discussions,
    }),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const filename = `MoM_${String(metadata.client_name || "Meeting").replace(/[^a-z0-9-_]+/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  return { blob, filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export async function exportPdf(metadata: any, items: any[], action_items: any[], summary: string, other_discussions: string) {
  const { blob, filename } = await requestMeetingPdf(metadata, items, action_items, summary, other_discussions);
  downloadBlob(blob, filename);
}

// ─── ClickUp Tasks API ────────────────────────────────────────────────────────

function getClickUpHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getStoredClickUpToken();
  const listId = getStoredClickUpListId();
  if (token) headers["x-clickup-token"] = token;
  if (listId) headers["x-clickup-list-id"] = listId;
  return headers;
}

export async function fetchClickUpTasks(customListId?: string, forceRefresh = false) {
  const headers = getClickUpHeaders();
  let url = "/api/tasks";
  const targetId = customListId || getStoredClickUpListId();
  const params = new URLSearchParams();
  if (targetId) params.set("listId", targetId);
  if (forceRefresh) params.set("refresh", "1");
  if (params.size) url += `?${params.toString()}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: any = new Error(err.error || "Failed to fetch ClickUp tasks");
    error.status = res.status;
    error.needsListSelection = err.needsListSelection;
    error.needsAuth = err.needsAuth;
    throw error;
  }
  return res.json();
}

export async function createClickUpTask(taskData: {
  name: string;
  description?: string;
  meetingTitle?: string;
  meetingDate?: string;
  status?: string;
  priority?: string | number;
  dueDate?: string | null;
  assignees?: any[];
  listId?: string;
  discussionPointId?: string;
  structuredDescription?: boolean;
  personInCharge?: string;
  topic?: string;
  discussion?: string;
  evidence?: string;
}) {
  const headers = getClickUpHeaders();
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify(taskData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create task in ClickUp");
  }
  return res.json();
}

export async function updateClickUpTask(updateData: {
  taskId: string;
  status?: string;
  name?: string;
  description?: string;
  priority?: string | number;
  dueDate?: string | null;
  assignees?: any[];
}) {
  const headers = getClickUpHeaders();
  const res = await fetch("/api/tasks", {
    method: "PUT",
    headers,
    body: JSON.stringify(updateData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || "Failed to update task in ClickUp"), { status: res.status });
  }
  return res.json();
}

export async function deleteClickUpTask(taskId: string) {
  const headers = getClickUpHeaders();
  const res = await fetch(`/api/tasks?taskId=${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || "Failed to delete task from ClickUp"), { status: res.status });
  }
  return res.json();
}

export async function discoverClickUpLists(tokenOverride?: string) {
  const headers = getClickUpHeaders();
  if (tokenOverride) {
    headers["x-clickup-token"] = tokenOverride;
  }
  const res = await fetch("/api/tasks?action=discover", { headers, cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: any = new Error(err.error || "Failed to discover ClickUp workspaces/lists");
    error.status = res.status;
    error.needsAuth = err.needsAuth;
    throw error;
  }
  return res.json();
}

export async function transcribeRecordingBatch(
  audio: Blob,
  batchIndex: number,
  signal?: AbortSignal
): Promise<string> {
  const headers = getAudioApiHeaders();
  const extension = audio.type.includes("webm") ? "webm" : audio.type.includes("ogg") ? "ogg" : "wav";
  const formData = new FormData();
  formData.append("file", audio, `live_batch_${batchIndex + 1}.${extension}`);
  formData.append("action", "transcribe_chunk");
  formData.append("chunk_index", String(batchIndex));
  const response = await fetch("/api/process-audio", { method: "POST", headers, body: formData, signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "This part could not be transcribed yet.");
  }
  const body = await response.json();
  return String(body.transcript || "").trim();
}
