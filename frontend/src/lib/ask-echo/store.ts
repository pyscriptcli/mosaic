import { createClient } from "@supabase/supabase-js";
import { DEFAULT_AI_POLICY, normalizeAiPolicy, type AiPolicy, type UsageSnapshot } from "./limits";
import { INITIAL_ARCHIVED_MEETINGS } from "@/lib/meetingsData";
import type { ArchivedMeeting } from "@/types/meeting";
import type { EchoPage } from "./access";

export interface EchoConfiguration {
  aiPolicy: AiPolicy;
  defaultPageAccess: EchoPage[];
  pagePermissions: Array<{ email: string; allowedPages: EchoPage[] }>;
  admins: Array<{ email: string; active?: boolean }>;
  mappings: Array<{ listId?: string }>;
}

function db() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  return url && key ? createClient(url, key) : null;
}

export async function loadAiPolicy(): Promise<AiPolicy> {
  const client = db();
  if (!client) return DEFAULT_AI_POLICY;
  const { data } = await client.from("echo_forms_config").select("config").eq("id", "global").maybeSingle();
  return normalizeAiPolicy(data?.config?.aiPolicy);
}

export async function loadEchoConfiguration(): Promise<EchoConfiguration> {
  const client = db();
  const fallback: EchoConfiguration = { aiPolicy: DEFAULT_AI_POLICY, defaultPageAccess: ["forms"], pagePermissions: [], admins: [], mappings: [] };
  if (!client) return fallback;
  const { data } = await client.from("echo_forms_config").select("config").eq("id", "global").maybeSingle();
  if (!data?.config) return fallback;
  return {
    aiPolicy: normalizeAiPolicy(data.config.aiPolicy),
    defaultPageAccess: data.config.defaultPageAccess || fallback.defaultPageAccess,
    pagePermissions: data.config.pagePermissions || [],
    admins: data.config.admins || [],
    mappings: data.config.mappings || [],
  };
}

export async function loadMeetingsForUser(_email: string): Promise<ArchivedMeeting[]> {
  const client = db();
  if (!client) return INITIAL_ARCHIVED_MEETINGS;
  const { data, error } = await client.from("meeting_archives").select("*").order("created_at", { ascending: false });
  if (error || !data?.length) return INITIAL_ARCHIVED_MEETINGS;
  return data.map((meeting: any) => ({
    id: String(meeting.meeting_id || meeting.id), meeting_id: String(meeting.meeting_id || meeting.id), title: meeting.client_name || "Meeting", date: meeting.meeting_date || "", meeting_type: meeting.meeting_type || "Internal", location: meeting.location || "", attendees_prime: meeting.attendees_prime || [], attendees_external: meeting.attendees_external || [], summary: meeting.summary_md || "", items: Array.isArray(meeting.table_items) ? meeting.table_items : [], transcript: meeting.transcript_md || "", created_at: meeting.created_at,
  }));
}

export async function getUsageSnapshot(email: string): Promise<UsageSnapshot> {
  const client = db();
  if (!client) return { requestsLastMinute: 0, concurrentRequests: 0, userTokensToday: 0, organizationTokensThisMonth: 0 };
  const now = new Date();
  const minute = new Date(now.getTime() - 60_000).toISOString();
  const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ count }, { data: userRows }, { data: organizationRows }] = await Promise.all([
    client.from("echo_ai_usage").select("id", { count: "exact", head: true }).eq("user_email", email).gte("created_at", minute),
    client.from("echo_ai_usage").select("total_tokens").eq("user_email", email).gte("created_at", day.toISOString()),
    client.from("echo_ai_usage").select("total_tokens").gte("created_at", month.toISOString()),
  ]);
  return {
    requestsLastMinute: count || 0,
    concurrentRequests: 0,
    userTokensToday: (userRows || []).reduce((sum, row: any) => sum + Number(row.total_tokens || 0), 0),
    organizationTokensThisMonth: (organizationRows || []).reduce((sum, row: any) => sum + Number(row.total_tokens || 0), 0),
  };
}

export async function recordUsage(entry: { userEmail: string; model: string; status: string; latencyMs: number; inputTokens: number; outputTokens: number; totalTokens: number }) {
  const client = db();
  if (!client) return;
  const { error } = await client.from("echo_ai_usage").insert({ user_email: entry.userEmail, model: entry.model, status: entry.status, latency_ms: entry.latencyMs, input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, total_tokens: entry.totalTokens });
  if (error) console.warn("[Ask Echo] Usage could not be recorded:", error.message);
}

export async function getUsageSummary() {
  const client = db();
  if (!client) return { today: { requests: 0, tokens: 0 }, month: { requests: 0, tokens: 0 }, recentLimitHits: 0 };
  const now = new Date(); const day = new Date(now); day.setUTCHours(0, 0, 0, 0); const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ data: today }, { data: monthRows }] = await Promise.all([client.from("echo_ai_usage").select("total_tokens,status").gte("created_at", day.toISOString()), client.from("echo_ai_usage").select("total_tokens,status").gte("created_at", month.toISOString())]);
  const summarize = (rows: any[] = []) => ({ requests: rows.length, tokens: rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0) });
  return { today: summarize(today || []), month: summarize(monthRows || []), recentLimitHits: (today || []).filter((row: any) => row.status === "limited").length };
}
