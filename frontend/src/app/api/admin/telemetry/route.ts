import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";

const OWNER_EMAIL = "admin@primephilippines.com";

async function isAdmin(email: string) {
  if (email === OWNER_EMAIL) return true;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (!url || !key) return false;
  const { data } = await createClient(url, key).from("echo_forms_config").select("config").eq("id", "global").maybeSingle();
  return Boolean(data?.config?.admins?.some((admin: { email?: string; active?: boolean }) => admin.active !== false && String(admin.email).toLowerCase().trim() === email));
}

function range(req: NextRequest) {
  const now = new Date();
  const end = req.nextUrl.searchParams.get("end") || now.toISOString();
  const start = req.nextUrl.searchParams.get("start") || new Date(now.getTime() - 7 * 86400000).toISOString();
  return { start, end };
}

async function readAllPages(query: { range: (from: number, to: number) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { code?: string; message?: string } | null }> }) {
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const identityResponse = await clickUpCalendarFetch(token, "https://api.clickup.com/api/v2/user", undefined, undefined, { timeoutMs: 8_000 });
  if (!identityResponse.ok) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const identity = await identityResponse.json().catch(() => ({})) as { user?: { email?: string } };
  const email = String(identity.user?.email || "").toLowerCase().trim();
  if (!email || !(await isAdmin(email))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  const { start, end } = range(req);
  if (!url || !key) return NextResponse.json({ start, end, events: [], summary: emptySummary(), configured: false });

  const client = createClient(url, key);
  const [{ data, error }, { data: syncRuns, error: syncRunsError }, { data: currentJobs, error: currentJobsError }] = await Promise.all([
    readAllPages(client.from("echo_telemetry").select("*").gte("occurred_at", start).lte("occurred_at", end).order("occurred_at", { ascending: false }) as never),
    readAllPages(client.from("echo_clickup_sync_runs").select("id,user_id,trigger,state,requested_targets,completed_targets,failed_targets,created_at,finished_at,echo_clickup_sync_run_targets(list_id,list_label,generation,state,records,last_error,updated_at)").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }) as never),
    readAllPages(client.from("echo_clickup_sync_jobs").select("scope_key,list_id,state,attempts,next_attempt_at,last_synced_at,last_error,updated_at") as never),
  ]);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ start, end, events: [], summary: emptySummary(), configured: false });
    return NextResponse.json({ error: "Unable to load telemetry." }, { status: 500 });
  }
  const events = data || [];
  if (syncRunsError && syncRunsError.code !== "42P01") return NextResponse.json({ error: "Unable to load sync runs." }, { status: 500 });
  if (currentJobsError) return NextResponse.json({ error: "Unable to load current ClickUp queue state." }, { status: 500 });
  const summary = summarize(events, syncRuns || [], currentJobs || []);
  if (req.nextUrl.searchParams.get("format") === "jsonl") {
    const body = events.map((event) => JSON.stringify(event)).join("\n");
    return new NextResponse(body, { headers: { "Content-Type": "application/x-ndjson", "Content-Disposition": `attachment; filename="echo-telemetry-${start.slice(0, 10)}-to-${end.slice(0, 10)}.jsonl"` } });
  }
  return NextResponse.json({ start, end, events, summary, configured: true });
}

function emptySummary() {
  return { 
    totalEvents: 0, 
    successfulEvents: 0, 
    failedEvents: 0, 
    averageProcessingMs: 0, 
    averageAudioSeconds: 0, 
    totalAudioSeconds: 0,
    fallbackRate: 0, 
    byProvider: {}, 
    bySource: {}, 
    byOperation: {},
    clickupPerformance: { syncRuns: 0, completedRuns: 0, activeRuns: 0, partialRuns: 0, syncFailures: 0, averageRunDurationMs: 0, oldestQueueAgeMs: 0, retryingLists: 0, terminalQueueFailures: 0, listsRequested: 0, listsSynced: 0, listsFailed: 0, listsPending: 0, byList: {}, requests: 0, failures: 0, cacheHits: 0, cacheHitRate: 0, averageMs: 0, p95Ms: 0, averageQueueMs: 0, averageRateWaitMs: 0, averageUpstreamMs: 0, byEndpoint: {}, pageReads: 0, dataSources: {}, averageRecords: 0, averageSnapshotAgeMs: null },
    cost: {
      totalUsd: 0,
      totalPhp: 0,
      sttGroqUsd: 0,
      sttGroqPhp: 0,
      sttGroqMinutes: 0,
      sttFallbackUsd: 0,
      sttFallbackPhp: 0,
      sttFallbackMinutes: 0,
      llmUsd: 0,
      llmPhp: 0,
      summarizeCount: 0,
      usdToPhpRate: 57,
      groqHourlyPhp: 2.28,
      fallbackHourlyPhp: 20.52,
      deepseekHourlyPhp: 0.25,
      blendedHourlyPhp: 2.53
    }
  };
}

function summarize(events: Array<Record<string, unknown>>, syncRuns: Array<Record<string, unknown>> = [], currentJobs: Array<Record<string, unknown>> = []) {
  const successfulEvents = events.filter((event) => event.success === true).length;
  const processing = events.map((event) => Number(event.processing_ms || 0)).filter((value) => value > 0);
  const audio = events.map((event) => Number(event.audio_seconds || 0)).filter((value) => value > 0);
  const totalAudioSeconds = Math.round(audio.reduce((sum, value) => sum + value, 0));

  // Compute Groq vs OpenRouter fallback audio seconds
  const groqAudioSec = events
    .filter((e) => e.provider === "groq" || (!e.fallback_used && e.provider !== "openrouter"))
    .reduce((sum, e) => sum + Number(e.audio_seconds || 0), 0);
  const fallbackAudioSec = events
    .filter((e) => e.fallback_used === true || e.provider === "openrouter")
    .reduce((sum, e) => sum + Number(e.audio_seconds || 0), 0);

  const summarizeCount = events.filter((e) => e.operation === "notetaker_finalize" || e.source === "notetaker_finalize").length;

  // Rate Benchmarks: Groq Whisper Turbo $0.04/hr, OpenRouter Whisper Fallback $0.36/hr, DeepSeek ~$0.0044/summary
  const USD_TO_PHP = 57.0;
  const sttGroqUsd = (groqAudioSec / 3600) * 0.04;
  const sttFallbackUsd = (fallbackAudioSec / 3600) * 0.36;
  const llmUsd = summarizeCount > 0 
    ? summarizeCount * 0.00438 
    : (totalAudioSeconds / 3600) * (0.25 / USD_TO_PHP);
  const totalUsd = sttGroqUsd + sttFallbackUsd + llmUsd;
  const totalPhp = totalUsd * USD_TO_PHP;

  const countBy = (field: string) => events.reduce<Record<string, number>>((result, event) => { const key = String(event[field] || "unknown"); result[key] = (result[key] || 0) + 1; return result; }, {});
  const clickupEvents = events.filter((event) => event.source === "clickup" && event.operation === "tasks_route");
  const percentile = (values: number[], fraction: number) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] : 0;
  const clickupMetadata = clickupEvents.map((event) => event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {});
  const snapshotAges = clickupMetadata.map((metadata) => Number(metadata.snapshotAgeMs)).filter((value) => Number.isFinite(value) && value >= 0);
  const recordCounts = clickupMetadata.map((metadata) => Number(metadata.recordCount)).filter((value) => Number.isFinite(value) && value >= 0);
  const dataSources = clickupMetadata.reduce<Record<string, number>>((result, metadata) => {
    const source = String(metadata.dataSource || "unknown");
    result[source] = (result[source] || 0) + 1;
    return result;
  }, {});
  const syncEvents = events.filter((event) => event.source === "clickup" && event.operation === "clickup_sync").reverse();
  const syncMetadata = syncEvents.map((event) => event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {});
  const runTargets = syncRuns.flatMap((run) => Array.isArray(run.echo_clickup_sync_run_targets) ? run.echo_clickup_sync_run_targets as Array<Record<string, unknown>> : []);
  const listResults = runTargets.length ? runTargets : syncMetadata.flatMap((metadata) => Array.isArray(metadata.lists) ? metadata.lists as Array<Record<string, unknown>> : []);
  const runDurations = syncRuns.flatMap((run) => run.finished_at && run.created_at ? [Math.max(0, Date.parse(String(run.finished_at)) - Date.parse(String(run.created_at)))] : []);
  const queueAges = currentJobs.flatMap((job) => ["queued", "retry", "running"].includes(String(job.state)) && job.updated_at
    ? [Math.max(0, Date.now() - Date.parse(String(job.updated_at)))] : []);
  const byList = listResults.reduce<Record<string, { requested: number; synced: number; failed: number; pending: number; records: number; reason?: string }>>((result, item) => {
    const label = String(item.list_label || item.label || item.list_id || item.listId || "Unknown list");
    const current = result[label] || { requested: 0, synced: 0, failed: 0, pending: 0, records: 0 };
    current.requested += 1;
    if (item.state === "synced") current.synced += 1;
    if (item.state === "failed" || item.state === "not_queued") current.failed += 1;
    current.records += Math.max(0, Number(item.records || 0));
    current.reason = item.state === "failed" || item.state === "not_queued" ? String(item.reason || "Sync did not complete.") : undefined;
    result[label] = current;
    return result;
  }, {});
  const listLabelById = new Map(listResults.map((item) => [String(item.list_id || item.listId || ""), String(item.list_label || item.label || item.list_id || item.listId || "Unknown list")]));
  for (const job of currentJobs) {
    if (!["queued", "running", "retry"].includes(String(job.state))) continue;
    const label = listLabelById.get(String(job.list_id || "")) || String(job.list_id || "Unknown list");
    const current = byList[label] || { requested: 0, synced: 0, failed: 0, pending: 0, records: 0 };
    current.pending += 1;
    byList[label] = current;
  }
  const apiRequests = events.filter((event) => event.source === "clickup" && event.operation === "clickup_request");
  const cacheHits = events.filter((event) => event.source === "clickup" && event.operation === "clickup_cache_hit");
  const apiDurations = apiRequests.map((event) => Number(event.processing_ms || 0)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const averageMetadataMetric = (key: string) => {
    const values = apiRequests.map((event) => {
      const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
      return Number(metadata[key]);
    }).filter((value) => Number.isFinite(value) && value >= 0);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  };
  const byEndpoint = apiRequests.reduce<Record<string, number>>((result, event) => {
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
    const endpoint = String(metadata.endpoint || "unknown");
    result[endpoint] = (result[endpoint] || 0) + 1;
    return result;
  }, {});
  
  return { 
    totalEvents: events.length, 
    successfulEvents, 
    failedEvents: events.length - successfulEvents, 
    averageProcessingMs: processing.length ? Math.round(processing.reduce((sum, value) => sum + value, 0) / processing.length) : 0, 
    averageAudioSeconds: audio.length ? Math.round((audio.reduce((sum, value) => sum + value, 0) / audio.length) * 10) / 10 : 0, 
    totalAudioSeconds,
    fallbackRate: events.length ? Math.round(events.filter((event) => event.fallback_used === true).length / events.length * 100) : 0, 
    byProvider: countBy("provider"), 
    bySource: countBy("source"), 
    byOperation: countBy("operation"),
    clickupPerformance: {
      syncRuns: syncRuns.length,
      completedRuns: syncRuns.filter((run) => run.state === "synced").length,
      activeRuns: syncRuns.filter((run) => ["queued", "running"].includes(String(run.state))).length,
      partialRuns: syncRuns.filter((run) => run.state === "partial").length,
      syncFailures: listResults.filter((item) => item.state === "failed" || item.state === "not_queued").length,
      averageRunDurationMs: runDurations.length ? Math.round(runDurations.reduce((sum, value) => sum + value, 0) / runDurations.length) : 0,
      oldestQueueAgeMs: queueAges.length ? Math.max(...queueAges) : 0,
      retryingLists: currentJobs.filter((job) => job.state === "retry").length,
      terminalQueueFailures: currentJobs.filter((job) => job.state === "failed").length,
      listsRequested: runTargets.length ? runTargets.length : syncMetadata.reduce((sum, metadata) => sum + Number(metadata.requestedLists || 0), 0),
      listsSynced: listResults.filter((item) => item.state === "synced").length,
      listsFailed: listResults.filter((item) => item.state === "failed" || item.state === "not_queued").length,
      listsPending: currentJobs.filter((job) => ["queued", "running", "retry"].includes(String(job.state))).length,
      byList,
      requests: apiRequests.length,
      failures: apiRequests.filter((event) => event.success !== true).length,
      cacheHits: cacheHits.length,
      cacheHitRate: apiRequests.length + cacheHits.length ? Math.round(cacheHits.length / (apiRequests.length + cacheHits.length) * 100) : 0,
      averageMs: syncEvents.length ? Math.round(syncEvents.reduce((sum, event) => sum + Number(event.processing_ms || 0), 0) / syncEvents.length) : 0,
      p95Ms: percentile(apiDurations, 0.95),
      averageQueueMs: apiRequests.length ? Math.round(apiRequests.reduce((sum, event) => sum + Number(event.queue_ms || 0), 0) / apiRequests.length) : 0,
      averageRateWaitMs: averageMetadataMetric("rateWaitMs"),
      averageUpstreamMs: averageMetadataMetric("upstreamMs"),
      byEndpoint,
      pageReads: clickupEvents.length,
      dataSources,
      averageRecords: recordCounts.length ? Math.round(recordCounts.reduce((sum, value) => sum + value, 0) / recordCounts.length) : 0,
      averageSnapshotAgeMs: snapshotAges.length ? Math.round(snapshotAges.reduce((sum, value) => sum + value, 0) / snapshotAges.length) : null,
      runHistory: syncRuns.map((run) => ({
        runId: run.id,
        trigger: run.trigger,
        state: run.state,
        requestedTargets: Number(run.requested_targets || 0),
        completedTargets: Number(run.completed_targets || 0),
        failedTargets: Number(run.failed_targets || 0),
        createdAt: run.created_at,
        finishedAt: run.finished_at,
        targets: Array.isArray(run.echo_clickup_sync_run_targets) ? run.echo_clickup_sync_run_targets : [],
      })),
    },
    cost: {
      totalUsd: Number(totalUsd.toFixed(4)),
      totalPhp: Number(totalPhp.toFixed(2)),
      sttGroqUsd: Number(sttGroqUsd.toFixed(4)),
      sttGroqPhp: Number((sttGroqUsd * USD_TO_PHP).toFixed(2)),
      sttGroqMinutes: Math.round(groqAudioSec / 60),
      sttFallbackUsd: Number(sttFallbackUsd.toFixed(4)),
      sttFallbackPhp: Number((sttFallbackUsd * USD_TO_PHP).toFixed(2)),
      sttFallbackMinutes: Math.round(fallbackAudioSec / 60),
      llmUsd: Number(llmUsd.toFixed(4)),
      llmPhp: Number((llmUsd * USD_TO_PHP).toFixed(2)),
      summarizeCount,
      usdToPhpRate: USD_TO_PHP,
      groqHourlyPhp: 2.28,
      fallbackHourlyPhp: 20.52,
      deepseekHourlyPhp: 0.25,
      blendedHourlyPhp: totalAudioSeconds > 0 ? Number((totalPhp / (totalAudioSeconds / 3600)).toFixed(2)) : 2.53
    }
  };
}
