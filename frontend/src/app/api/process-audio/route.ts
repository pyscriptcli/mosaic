import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import mammoth from "mammoth";
import { getUserFromRequest } from "@/lib/auth";
import { recordTelemetry } from "@/lib/telemetry";
import { requireFeature } from "@/lib/access-control-server";

async function extractMetadataWithAI(text: string, apiKey: string) {
  if (!apiKey) return {};
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are an expert executive meeting assistant.
Extract meeting metadata in strict valid JSON matching this schema:
{
  "client_name": "Company or Client Name (or Internal if internal)",
  "meeting_type": "Internal" | "External" | "Team",
  "location": "Venue or meeting room mentioned",
  "attendees": ["List of attendee names mentioned"]
}`
          },
          {
            role: "user",
            content: `Extract metadata from this meeting content:\n${text.substring(0, 15000)}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      let cleaned = content.trim();
      if (cleaned.includes("```json")) {
        cleaned = cleaned.split("```json")[1].split("```")[0].trim();
      } else if (cleaned.includes("```")) {
        cleaned = cleaned.split("```")[1].split("```")[0].trim();
      }
      return JSON.parse(cleaned);
    }
  } catch (e) {
    console.warn("Metadata extraction fallback error:", e);
  }
  return {};
}

/** Formats a seconds value (e.g. 63.5) into [MM:SS] display. */
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

function getAudioFormat(mimeType: string, fileName?: string): string {
  const m = (mimeType || "").toLowerCase();
  const f = (fileName || "").toLowerCase();
  if (m.includes("mp3") || f.endsWith(".mp3")) return "mp3";
  if (m.includes("m4a") || f.endsWith(".m4a")) return "m4a";
  if (m.includes("mp4") || f.endsWith(".mp4")) return "mp4";
  if (m.includes("webm") || f.endsWith(".webm")) return "webm";
  if (m.includes("ogg") || f.endsWith(".ogg") || f.endsWith(".oga")) return "ogg";
  if (m.includes("flac") || f.endsWith(".flac")) return "flac";
  if (m.includes("aac") || f.endsWith(".aac")) return "aac";
  return "wav";
}

import {
  GroqRateLimitError,
  getGroqApiKeys,
  groqKeyCooldowns,
} from "@/lib/groqPool";
let groqRoundRobinPointer = 0;

async function transcribeWithGroq(buffer: Buffer, fileName: string, mimeType: string, apiKey: string): Promise<string> {
  const expiry = groqKeyCooldowns.get(apiKey) || 0;
  if (Date.now() < expiry) {
    const waitSec = Math.ceil((expiry - Date.now()) / 1000);
    throw new GroqRateLimitError(`Groq key is cooling down (${waitSec}s remaining)`, waitSec);
  }

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/webm" }), fileName || "recording.webm");
  formData.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");
  formData.append("temperature", "0");
  formData.append("prompt", process.env.GROQ_WHISPER_PROMPT || "Mosaic team meeting. Preserve English and Filipino code-switching, names, numbers, decisions, and action items.");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (response.status === 429) {
    const retryAfterSeconds = Math.max(1, Number(response.headers.get("retry-after")) || 60);
    groqKeyCooldowns.set(apiKey, Date.now() + retryAfterSeconds * 1000);
    throw new GroqRateLimitError(`Groq free-tier limit reached; retry after ${retryAfterSeconds}s`, retryAfterSeconds);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body && typeof body === "object" && "error" in body ? String((body as { error?: { message?: string } }).error?.message || "") : "";
    throw new Error(detail || `Groq Whisper transcription failed (${response.status})`);
  }

  const body = await response.json();
  if (Array.isArray(body.segments) && body.segments.length) {
    return body.segments.map((segment: { start?: number; text?: string }) => `${formatTimestamp(Number(segment.start) || 0)} ${String(segment.text || "").trim()}`).filter((line: string) => line.trim()).join("\n");
  }
  return String(body.text || "").trim();
}

export interface GroqPoolResult {
  text: string;
  keyUsed: string;
  keyIndex: number;
  keyAlias: string;
  keyMasked: string;
  poolSize: number;
  availableKeysCount: number;
  coolingDownKeysCount: number;
  attempts: number;
  failoverOccurred: boolean;
  failoverHistory?: string[];
}

async function transcribeWithGroqPool(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  groqKeys: string[]
): Promise<GroqPoolResult> {
  if (!groqKeys.length) {
    throw new Error("No Groq API keys configured");
  }

  const now = Date.now();
  // Find keys not currently cooling down
  const availableKeys = groqKeys.filter((k) => (groqKeyCooldowns.get(k) || 0) <= now);
  const coolingDownKeys = groqKeys.filter((k) => (groqKeyCooldowns.get(k) || 0) > now);

  if (availableKeys.length === 0) {
    const earliestExpiry = Math.min(...groqKeys.map((k) => groqKeyCooldowns.get(k) || 0));
    const waitSec = Math.max(1, Math.ceil((earliestExpiry - now) / 1000));
    throw new Error(`All ${groqKeys.length} Groq keys are cooling down (retry after ${waitSec}s)`);
  }

  // Order candidate keys starting at round-robin pointer
  const startOffset = groqRoundRobinPointer % availableKeys.length;
  const orderedKeys = [
    ...availableKeys.slice(startOffset),
    ...availableKeys.slice(0, startOffset),
  ];

  const poolErrors: string[] = [];
  const failoverHistory: string[] = [];
  let attempts = 0;

  for (const candidateKey of orderedKeys) {
    attempts++;
    const keyIndex = groqKeys.indexOf(candidateKey) + 1;
    const keyAlias = `groq_key_${keyIndex}`;
    const keyMasked = `${candidateKey.slice(0, 6)}...${candidateKey.slice(-4)}`;

    try {
      const text = await transcribeWithGroq(buffer, fileName, mimeType, candidateKey);
      if (text) {
        // Advance round-robin pointer for next request
        groqRoundRobinPointer = (groqRoundRobinPointer + 1) % groqKeys.length;
        return {
          text,
          keyUsed: candidateKey,
          keyIndex,
          keyAlias,
          keyMasked,
          poolSize: groqKeys.length,
          availableKeysCount: availableKeys.length,
          coolingDownKeysCount: coolingDownKeys.length,
          attempts,
          failoverOccurred: attempts > 1,
          failoverHistory: attempts > 1 ? failoverHistory : undefined,
        };
      }
    } catch (err: any) {
      if (err instanceof GroqRateLimitError) {
        failoverHistory.push(`${keyAlias}: 429 rate limit (${err.retryAfterSeconds}s cooldown)`);
        console.warn(`[Groq Pool] Key #${keyIndex} hit 429 rate limit (cooling down for ${err.retryAfterSeconds}s). Switching to next key in pool...`);
        poolErrors.push(`Key #${keyIndex}: 429 (${err.message})`);
      } else {
        failoverHistory.push(`${keyAlias}: error (${err.message})`);
        console.warn(`[Groq Pool] Key #${keyIndex} error:`, err.message);
        poolErrors.push(`Key #${keyIndex}: ${err.message}`);
      }
    }
  }

  throw new Error(`All available Groq keys in pool failed: ${poolErrors.join(" | ")}`);
}

async function transcribeWithOpenRouter(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const base64Audio = buffer.toString("base64");
  const format = getAudioFormat(mimeType, fileName);
  let lastError = "";

  // OpenRouter is the only paid fallback for audio transcription.
  try {
    const sttRes = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://project-echo.app",
        "X-Title": "Mosaic Audio Transcriber",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_STT_MODEL || "openai/whisper-large-v3",
        input_audio: {
          data: base64Audio,
          format: format,
        },
      }),
    });

    if (sttRes.ok) {
      const data = await sttRes.json();
      if (data.text && data.text.trim().length > 0) {
        return data.text.trim();
      }
    } else {
      const errJson = await sttRes.json().catch(() => ({}));
      lastError = errJson?.error?.message || `Failed with status ${sttRes.status}`;
    }
  } catch (sttErr: any) {
    lastError = sttErr.message;
  }

  throw new Error(lastError || "OpenRouter audio transcription failed across all endpoints.");
}

export interface TranscribeBufferResult {
  text: string;
  tempPath?: string;
  errors: string[];
  provider?: "groq" | "openrouter";
  groqPoolMeta?: GroqPoolResult;
}

async function transcribeAudioBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  keys: { groqKeys: string[]; openrouterKey: string }
): Promise<TranscribeBufferResult> {
  let audioTranscript = "";
  let tempFilePath: string | undefined;
  let provider: "groq" | "openrouter" | undefined;
  let groqPoolMeta: GroqPoolResult | undefined;
  const errors: string[] = [];

  // 1. Primary: Groq Multi-Key Pool (Round-Robin with Automatic 429 Failover)
  if (keys.groqKeys && keys.groqKeys.length > 0) {
    try {
      const result = await transcribeWithGroqPool(buffer, fileName, mimeType, keys.groqKeys);
      audioTranscript = result.text;
      groqPoolMeta = result;
      if (audioTranscript) provider = "groq";
    } catch (e: any) {
      console.warn("Groq multi-key pool unavailable, using OpenRouter fallback:", e.message);
      errors.push(`Groq Whisper: ${e.message}`);
    }
  }

  // 2. Paid low-cost fallback: OpenRouter
  if (!audioTranscript && keys.openrouterKey) {
    try {
      audioTranscript = await transcribeWithOpenRouter(buffer, fileName, mimeType, keys.openrouterKey);
      if (audioTranscript) provider = "openrouter";
    } catch (e: any) {
      console.warn("OpenRouter transcription failed:", e.message);
      errors.push(`OpenRouter: ${e.message}`);
    }
  }

  return { text: audioTranscript, tempPath: tempFilePath, errors, provider, groqPoolMeta };
}

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  const requestStarted = Date.now();
  try {
    const headerKey = req.headers.get("x-api-key") || req.headers.get("x-deepseek-api-key");
    const aiKey = headerKey || process.env.DEEPSEEK_API_KEY || "";
    const openrouterKey = req.headers.get("x-openrouter-api-key") || process.env.OPENROUTER_API_KEY || "";
    const geminiKey = req.headers.get("x-gemini-api-key") || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    const groqKeys = getGroqApiKeys();
    const requestUser = getUserFromRequest(req);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const directText = formData.get("text") as string | null;
    const action = formData.get("action") as string | null;
    const denied = await requireFeature(req, action === "transcribe_chunk" ? "notetaker-record" : "notetaker-upload");
    if (denied) return denied;

    // CASE 0: Parallel Audio Chunk Transcription (bypasses metadata extraction for intermediate segments)
    if (action === "transcribe_chunk" && file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = file.name || "chunk.wav";
      const mimeType = file.type || "audio/wav";

      const chunkIndexRaw = formData.get("chunk_index");
      const totalChunksRaw = formData.get("total_chunks");
      const audioSecondsRaw = formData.get("audio_seconds");

      const chunkIndex = chunkIndexRaw != null ? Number(chunkIndexRaw) : undefined;
      const totalChunks = totalChunksRaw != null ? Number(totalChunksRaw) : undefined;
      let audioSeconds = audioSecondsRaw != null ? Number(audioSecondsRaw) : undefined;

      // Estimate audio duration for PCM WAV (16kHz 16-bit mono = 32,000 bytes/sec)
      if (audioSeconds == null && (mimeType.includes("wav") || fileName.endsWith(".wav")) && buffer.length > 44) {
        audioSeconds = Math.round(((buffer.length - 44) / 32000) * 10) / 10;
      }

      const { text, tempPath, errors, provider, groqPoolMeta } = await transcribeAudioBuffer(buffer, fileName, mimeType, {
        groqKeys,
        openrouterKey,
      });
      if (tempPath) tempFilePath = tempPath;

      if (!text) {
        return NextResponse.json({
          error: `Audio chunk transcription failed: ${errors.join(" | ") || "No audio transcription API key configured"}`
        }, { status: 500 });
      }

      void recordTelemetry({
        userId: String(requestUser?.id || ""),
        userEmail: requestUser?.email,
        source: "echo_recording",
        operation: "audio_chunk",
        captureMode: "botless",
        provider,
        model: provider === "groq" ? (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo") : (process.env.OPENROUTER_STT_MODEL || "openai/whisper-large-v3"),
        audioSeconds,
        fileSizeBytes: buffer.length,
        processingMs: Date.now() - requestStarted,
        fallbackUsed: provider === "openrouter",
        success: true,
        chunkIndex,
        totalChunks,
        transcriptCharacters: text.length,
        metadata: {
          ...(groqPoolMeta ? {
            groqKeyIndex: groqPoolMeta.keyIndex,
            groqKeyAlias: groqPoolMeta.keyAlias,
            groqKeyMasked: groqPoolMeta.keyMasked,
            groqPoolSize: groqPoolMeta.poolSize,
            groqAvailableKeys: groqPoolMeta.availableKeysCount,
            groqCoolingDownKeys: groqPoolMeta.coolingDownKeysCount,
            groqAttempts: groqPoolMeta.attempts,
            groqFailoverOccurred: groqPoolMeta.failoverOccurred,
            ...(groqPoolMeta.failoverHistory ? { groqFailoverHistory: groqPoolMeta.failoverHistory } : {}),
          } : {}),
          ...(provider === "openrouter" ? {
            groqPoolExhausted: true,
            openrouterFallback: true,
            groqPoolErrors: errors.filter((e) => e.includes("Groq")),
          } : {}),
        },
      });

      return NextResponse.json({ transcript: text, provider });
    }

    if (!file && (!directText || directText.trim().length === 0)) {
      return NextResponse.json({ error: "Please upload a file or paste meeting text." }, { status: 400 });
    }

    let transcript = "";
    let metadata: any = {};

    // CASE 1: Direct Pasted Text (or combined transcript from client chunking)
    if (!file && directText) {
      transcript = directText;
      metadata = await extractMetadataWithAI(transcript, aiKey);
      return NextResponse.json({ transcript, metadata });
    }

    if (!file) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name.toLowerCase();
    const mimeType = file.type || "";

    // CASE 2: Word Document (.docx)
    if (fileName.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
      const { value: extractedText } = await mammoth.extractRawText({ buffer });
      transcript = extractedText;
      metadata = await extractMetadataWithAI(transcript, aiKey);
      return NextResponse.json({ transcript, metadata });
    }

    // CASE 3: Text file (.txt, .srt, .vtt)
    if (fileName.endsWith(".txt") || fileName.endsWith(".srt") || fileName.endsWith(".vtt") || mimeType.startsWith("text/")) {
      transcript = buffer.toString("utf-8");
      metadata = await extractMetadataWithAI(transcript, aiKey);
      return NextResponse.json({ transcript, metadata });
    }

    // CASE 4: PDF Document (.pdf)
    if (fileName.endsWith(".pdf") || mimeType === "application/pdf") {
      if (geminiKey) {
        const isSmall = buffer.length < 15 * 1024 * 1024;
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `Transcribe and summarize all text and discussion in this PDF document:`;
        
        let result;
        if (isSmall) {
          result = await model.generateContent([
            { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
            { text: prompt }
          ]);
        } else {
          const tempDir = os.tmpdir();
          tempFilePath = path.join(tempDir, `doc-${Date.now()}.pdf`);
          await fs.writeFile(tempFilePath, buffer);
          const fileManager = new GoogleAIFileManager(geminiKey);
          const uploadResult = await fileManager.uploadFile(tempFilePath, { mimeType: "application/pdf", displayName: file.name });
          result = await model.generateContent([
            { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
            { text: prompt }
          ]);
        }
        transcript = result.response.text();
      } else {
        // Fallback: extract plain text from buffer
        transcript = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      }
      metadata = await extractMetadataWithAI(transcript, aiKey);
      return NextResponse.json({ transcript, metadata });
    }

    // CASE 5: Audio / Video recording (Groq Whisper -> OpenRouter Whisper)
    const { text, tempPath, errors, provider, groqPoolMeta } = await transcribeAudioBuffer(buffer, file.name, mimeType, {
      groqKeys,
      openrouterKey,
    });
    if (tempPath) tempFilePath = tempPath;

    if (!text) {
      if (errors.length > 0) {
        return NextResponse.json({
          error: `Audio transcription failed: ${errors.join(" | ")}`
        }, { status: 500 });
      }
      return NextResponse.json({ 
        error: "Audio transcription is not configured yet. Please contact an administrator."
      }, { status: 400 });
    }

    transcript = text;
    metadata = await extractMetadataWithAI(transcript, aiKey);
    void recordTelemetry({
      userId: String(requestUser?.id || ""),
      userEmail: requestUser?.email,
      source: "uploaded_audio",
      operation: "audio_upload",
      captureMode: "unknown",
      provider: provider || "whisper",
      model: provider === "groq" ? (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo") : (process.env.OPENROUTER_STT_MODEL || "openai/whisper-large-v3"),
      fileSizeBytes: buffer.length,
      processingMs: Date.now() - requestStarted,
      fallbackUsed: provider === "openrouter",
      success: true,
      transcriptCharacters: transcript.length,
      metadata: {
        ...(groqPoolMeta ? {
          groqKeyIndex: groqPoolMeta.keyIndex,
          groqKeyAlias: groqPoolMeta.keyAlias,
          groqKeyMasked: groqPoolMeta.keyMasked,
          groqPoolSize: groqPoolMeta.poolSize,
          groqAvailableKeys: groqPoolMeta.availableKeysCount,
          groqCoolingDownKeys: groqPoolMeta.coolingDownKeysCount,
          groqAttempts: groqPoolMeta.attempts,
          groqFailoverOccurred: groqPoolMeta.failoverOccurred,
          ...(groqPoolMeta.failoverHistory ? { groqFailoverHistory: groqPoolMeta.failoverHistory } : {}),
        } : {}),
        ...(provider === "openrouter" ? {
          groqPoolExhausted: true,
          openrouterFallback: true,
          groqPoolErrors: errors.filter((e) => e.includes("Groq")),
        } : {}),
      },
    });
    return NextResponse.json({ transcript, metadata });
  } catch (error: any) {
    console.error("Error processing source file:", error);
    const msg = error?.message || String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tempFilePath) {
      try { await fs.unlink(tempFilePath); } catch (e) {}
    }
  }
}
