import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "admin@primephilippines.com";
const REPOSITORY = "pyscriptcli/mosaic";
const WORKFLOW = "project-atlas-sync.yml";
const API_VERSION = "2026-03-10";

type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  run_number: number;
  created_at: string;
  updated_at: string;
};

async function getVerifiedEmail(request: NextRequest): Promise<string> {
  const token = getTokenFromRequest(request);
  if (!token) return "";
  try {
    const response = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: token },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "";
    const result = await response.json() as { user?: { email?: string } };
    return String(result.user?.email || "").toLowerCase().trim();
  } catch {
    return "";
  }
}

async function isAdmin(request: NextRequest) {
  const email = await getVerifiedEmail(request);
  if (!email) return false;
  if (email === OWNER_EMAIL) return true;

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (!supabaseUrl || !supabaseKey) return false;
  try {
    const { data, error } = await createClient(supabaseUrl, supabaseKey)
      .from("echo_forms_config")
      .select("config")
      .eq("id", "global")
      .maybeSingle();
    if (error) return false;
    const admins = (data?.config as { admins?: Array<{ email?: string; active?: boolean }> } | null)?.admins || [];
    return admins.some((admin) => admin.active !== false && String(admin.email || "").toLowerCase().trim() === email);
  } catch {
    return false;
  }
}

function getToken() {
  return process.env.PROJECT_ATLAS_SYNC_TOKEN?.trim() || "";
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function latestRun(token: string): Promise<WorkflowRun | null> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=1`, {
    headers: githubHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub could not read the sync workflow (HTTP ${response.status}).`);
  const result = await response.json() as { workflow_runs?: WorkflowRun[] };
  return result.workflow_runs?.[0] || null;
}

function toRun(run: WorkflowRun | null) {
  return run ? {
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    runNumber: run.run_number,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  } : null;
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return json({ error: "Admin access required." }, 403);
  const token = getToken();
  if (!token) return json({ configured: false, latestRun: null });
  try {
    return json({ configured: true, latestRun: toRun(await latestRun(token)) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not read Project Atlas sync status." }, 502);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return json({ error: "Admin access required." }, 403);
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== request.nextUrl.origin) return json({ error: "Request origin could not be verified." }, 403);
  } catch {
    return json({ error: "Request origin could not be verified." }, 403);
  }

  const token = getToken();
  if (!token) return json({ error: "Project Atlas sync is not configured. Add PROJECT_ATLAS_SYNC_TOKEN to the Mosaic deployment." }, 503);

  try {
    const currentRun = await latestRun(token);
    if (currentRun?.status === "queued" || currentRun?.status === "in_progress") {
      return json({ error: "A Project Atlas sync is already running." }, 409);
    }

    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return json({ error: `GitHub did not start the sync workflow (HTTP ${response.status}). Check the token's Actions: write access and that the workflow exists on main.` }, 502);
    }
    const run = await response.json().catch(() => null) as { html_url?: string; workflow_run_id?: number } | null;
    return json({ queued: true, runUrl: run?.html_url || null, runId: run?.workflow_run_id || null }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not start Project Atlas sync." }, 502);
  }
}
