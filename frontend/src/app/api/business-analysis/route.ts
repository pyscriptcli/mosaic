import { NextRequest, NextResponse } from "next/server";
import { authorizeBARequest, getBAStorage } from "@/lib/business-analysis-server";
import { normalizeBAState } from "@/lib/business-analysis";

export const dynamic = "force-dynamic";
const TABLE = "mosaic_ba_workspaces";

export async function GET(req: NextRequest) {
  try {
    const { user, denied } = await authorizeBARequest(req);
    if (denied || !user) return denied;
    const { data, error } = await getBAStorage().from(TABLE).select("state").eq("owner_user_id", String(user.id)).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ state: normalizeBAState(data?.state) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Business Analysis] Load failed:", error);
    return NextResponse.json({ error: "Business Analysis could not load. Check that its Supabase table is installed." }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, denied } = await authorizeBARequest(req);
    if (denied || !user) return denied;
    const raw = await req.text();
    if (raw.length > 1_000_000) return NextResponse.json({ error: "This workspace is too large to save." }, { status: 413 });
    let body: { state?: unknown };
    try { body = JSON.parse(raw) as { state?: unknown }; }
    catch { return NextResponse.json({ error: "The workspace data could not be read." }, { status: 400 }); }
    const state = normalizeBAState(body.state);
    const { error } = await getBAStorage().from(TABLE).upsert({
      owner_user_id: String(user.id), owner_email: user.email.toLowerCase().trim(), state, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id" });
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("[Business Analysis] Save failed:", error);
    return NextResponse.json({ error: "Business Analysis could not save. Check that its Supabase table is installed." }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, denied } = await authorizeBARequest(req);
    if (denied || !user) return denied;
    let body: { projectId?: unknown };
    try { body = await req.json() as { projectId?: unknown }; }
    catch { return NextResponse.json({ error: "Choose a project to delete." }, { status: 400 }); }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim().slice(0, 120) : "";
    if (!projectId) return NextResponse.json({ error: "Choose a project to delete." }, { status: 400 });

    const storage = getBAStorage();
    const { data, error: readError } = await storage.from(TABLE).select("state").eq("owner_user_id", String(user.id)).maybeSingle();
    if (readError) throw readError;
    const currentState = normalizeBAState(data?.state);
    if (!currentState.projects.some((project) => project.id === projectId)) {
      return NextResponse.json({ error: "This project is no longer in your workspace. Reload and try again." }, { status: 404 });
    }

    const state = { ...currentState, projects: currentState.projects.filter((project) => project.id !== projectId) };
    const { error: writeError } = await storage.from(TABLE).upsert({
      owner_user_id: String(user.id), owner_email: user.email.toLowerCase().trim(), state, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id" });
    if (writeError) throw writeError;
    return NextResponse.json({ state });
  } catch (error) {
    console.error("[Business Analysis] Project delete failed:", error);
    return NextResponse.json({ error: "The project could not be deleted. Try again." }, { status: 503 });
  }
}
