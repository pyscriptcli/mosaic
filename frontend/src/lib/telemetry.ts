import { createClient } from "@supabase/supabase-js";

export type TelemetryEvent = {
  userId?: string;
  userEmail?: string;
  source: "echo_recording" | "uploaded_audio" | "meetstream_bot" | "ask_echo" | "notetaker_finalize" | "clickup";
  operation: "audio_chunk" | "audio_upload" | "ask_echo" | "notetaker_finalize" | "tasks_route" | "clickup_request" | "clickup_cache_hit" | "clickup_sync";
  captureMode?: "botless" | "bot" | "unknown";
  provider?: string;
  model?: string;
  audioSeconds?: number;
  fileSizeBytes?: number;
  processingMs?: number;
  queueMs?: number;
  fallbackUsed?: boolean;
  retryCount?: number;
  success: boolean;
  errorCategory?: string;
  errorMessage?: string;
  chunkIndex?: number;
  totalChunks?: number;
  transcriptCharacters?: number;
  metadata?: Record<string, unknown>;
};

export async function recordTelemetry(event: TelemetryEvent) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (!url || !key) return;
  try {
    const client = createClient(url, key);
    const { error } = await client.from("echo_telemetry").insert({
      user_id: event.userId || null,
      user_email: event.userEmail || null,
      source: event.source,
      operation: event.operation,
      capture_mode: event.captureMode || "unknown",
      provider: event.provider || null,
      model: event.model || null,
      audio_seconds: event.audioSeconds ?? null,
      file_size_bytes: event.fileSizeBytes ?? null,
      processing_ms: Math.max(0, Math.round(event.processingMs || 0)),
      queue_ms: Math.max(0, Math.round(event.queueMs || 0)),
      fallback_used: event.fallbackUsed || false,
      retry_count: Math.max(0, Math.round(event.retryCount || 0)),
      success: event.success,
      error_category: event.errorCategory || null,
      error_message: event.errorMessage?.slice(0, 500) || null,
      chunk_index: event.chunkIndex ?? null,
      total_chunks: event.totalChunks ?? null,
      transcript_characters: event.transcriptCharacters ?? null,
      metadata: event.metadata || {},
    });
    if (error) console.warn("[Telemetry] Event could not be recorded:", error.message);
  } catch (error) {
    console.warn("[Telemetry] Event could not be recorded:", error instanceof Error ? error.message : error);
  }
}
