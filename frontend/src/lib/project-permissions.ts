import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";
import { loadAdminConfig } from "@/lib/admin-config/store";

export const SUBPROJECT_ADMIN_EMAIL = "dave.policarpio@primephilippines.com";
const PROJECT_FOLDER_ID = "901414174663";

export interface VerifiedClickUpUser {
  id: string;
  email: string;
}

interface ProjectPermissionConfig {
  projectDefaultAssignees?: Record<string, string[]>;
  features?: unknown;
}

export async function getVerifiedClickUpUser(token: string): Promise<VerifiedClickUpUser | null> {
  const response = await clickUpCalendarFetch(
    token,
    "https://api.clickup.com/api/v2/user",
    undefined,
    undefined,
    // Identity is stable for the short HTTP cache window. Avoid one ClickUp
    // round trip on every staged task edit; token authentication still applies.
  );
  if (!response.ok) return null;

  const payload = await response.json().catch(() => ({}));
  const user = payload?.user;
  if (!user?.id || typeof user.email !== "string") return null;
  return { id: String(user.id), email: user.email.trim().toLowerCase() };
}

export function isSubprojectAdmin(user: VerifiedClickUpUser | null | undefined): boolean {
  return user?.email === SUBPROJECT_ADMIN_EMAIL;
}

export function getSubprojectAccess(user: VerifiedClickUpUser | null, listId: string, config: ProjectPermissionConfig) {
  const leadId = String(config.projectDefaultAssignees?.[listId]?.[0] || "");
  const isAdmin = isSubprojectAdmin(user);
  return {
    leadId,
    isAdmin,
    canEdit: isAdmin || Boolean(user?.id && user.id === leadId),
  };
}

type AccessResult =
  | { ok: true; token: string; user: VerifiedClickUpUser; isAdmin: boolean; leadId: string }
  | { ok: false; response: NextResponse };

async function getSubprojectMemberAccess(request: NextRequest, folderId: string, listId: string): Promise<AccessResult> {
  const token = getTokenFromRequest(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: "Sign in with ClickUp to edit this subproject." }, { status: 401 }) };
  if (!/^\d+$/.test(folderId) || !/^\d+$/.test(listId)) {
    return { ok: false, response: NextResponse.json({ error: "A valid project and subproject are required." }, { status: 400 }) };
  }

  const user = await getVerifiedClickUpUser(token);
  if (!user) return { ok: false, response: NextResponse.json({ error: "Your ClickUp identity could not be verified. Sign in again and retry." }, { status: 401 }) };

  const listResponse = await clickUpCalendarFetch(
    token,
    `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}`,
    undefined,
    undefined,
    // List membership is also cached briefly; fresh task membership is checked
    // separately against the durable task snapshot by the move route.
  );
  const list = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    return { ok: false, response: NextResponse.json({ error: "Unable to verify the selected subproject." }, { status: listResponse.status }) };
  }
  if (String(list.folder?.id || "") !== folderId) {
    return { ok: false, response: NextResponse.json({ error: "This subproject does not belong to the selected project." }, { status: 403 }) };
  }

  return { ok: true, token, user, isAdmin: isSubprojectAdmin(user), leadId: "" };
}

async function getAccess(request: NextRequest, folderId: string, listId: string): Promise<AccessResult> {
  const memberAccess = await getSubprojectMemberAccess(request, folderId, listId);
  if (!memberAccess.ok) return memberAccess;
  try {
    const config = await loadAdminConfig();
    const access = getSubprojectAccess(memberAccess.user, listId, config);
    return { ...memberAccess, isAdmin: access.isAdmin, leadId: access.leadId };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Project permissions could not be loaded." }, { status: 503 }) };
  }
}

export async function requireSubprojectMember(request: NextRequest, folderId: string, listId: string): Promise<AccessResult> {
  return getSubprojectMemberAccess(request, folderId, listId);
}

export async function requireProjectMember(request: NextRequest, folderId: string): Promise<{ ok: true; token: string; user: VerifiedClickUpUser } | { ok: false; response: NextResponse }> {
  const token = getTokenFromRequest(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: "Sign in with ClickUp to access this project." }, { status: 401 }) };
  if (!/^\d+$/.test(folderId)) return { ok: false, response: NextResponse.json({ error: "A valid project folder is required." }, { status: 400 }) };
  const user = await getVerifiedClickUpUser(token);
  if (!user) return { ok: false, response: NextResponse.json({ error: "Your ClickUp identity could not be verified. Sign in again and retry." }, { status: 401 }) };
  const folderResponse = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/folder/${encodeURIComponent(folderId)}/list`, undefined, undefined, { skipCache: true });
  if (!folderResponse.ok) return { ok: false, response: NextResponse.json({ error: "This ClickUp account cannot access the selected project." }, { status: folderResponse.status }) };
  return { ok: true, token, user };
}

export async function requireSubprojectEditor(request: NextRequest, folderId: string, listId: string): Promise<AccessResult> {
  const access = await getAccess(request, folderId, listId);
  if (!access.ok) return access;
  if (!access.isAdmin && access.user.id !== access.leadId) {
    return { ok: false, response: NextResponse.json({ error: "Only the subproject lead or Mosaic admin can edit this subproject." }, { status: 403 }) };
  }
  return access;
}

export async function requireSubprojectAdmin(request: NextRequest, folderId: string, listId: string): Promise<AccessResult> {
  const access = await getAccess(request, folderId, listId);
  if (!access.ok) return access;
  if (!access.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Only the Mosaic admin can manage the subproject lead." }, { status: 403 }) };
  }
  return access;
}

export async function requireProjectAdmin(request: NextRequest): Promise<{ ok: true; token: string; user: VerifiedClickUpUser } | { ok: false; response: NextResponse }> {
  const token = getTokenFromRequest(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: "Sign in with ClickUp to manage project settings." }, { status: 401 }) };
  const user = await getVerifiedClickUpUser(token);
  if (!user) return { ok: false, response: NextResponse.json({ error: "Your ClickUp identity could not be verified. Sign in again and retry." }, { status: 401 }) };
  if (!isSubprojectAdmin(user)) return { ok: false, response: NextResponse.json({ error: "Only the Mosaic admin can manage project settings." }, { status: 403 }) };
  return { ok: true, token, user };
}

export async function requireManagedTaskEditor(request: NextRequest, taskId: string): Promise<{ ok: true; token: string } | { ok: false; response: NextResponse }> {
  const token = getTokenFromRequest(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: "ClickUp API Token not configured." }, { status: 401 }) };

  const taskResponse = await clickUpCalendarFetch(
    token,
    `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`,
    undefined,
    undefined,
    { skipCache: true },
  );
  const task = await taskResponse.json().catch(() => ({}));
  if (!taskResponse.ok) {
    return { ok: false, response: NextResponse.json({ error: "Unable to verify the task before editing." }, { status: taskResponse.status }) };
  }

  const listId = String(task.list?.id || "");
  if (!listId) return { ok: true, token };

  let config: ProjectPermissionConfig;
  try {
    config = await loadAdminConfig();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Project permissions could not be loaded." }, { status: 503 }) };
  }
  let folderId = String(task.folder?.id || "");
  if (!folderId) {
    const listResponse = await clickUpCalendarFetch(
      token,
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}`,
      undefined,
      undefined,
      { skipCache: true },
    );
    const list = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) {
      return { ok: false, response: NextResponse.json({ error: "Unable to verify the task's subproject." }, { status: listResponse.status }) };
    }
    folderId = String(list.folder?.id || "");
  }
  if (!folderId) return { ok: false, response: NextResponse.json({ error: "Unable to verify the task's project." }, { status: 403 }) };
  if (folderId !== PROJECT_FOLDER_ID && !Object.prototype.hasOwnProperty.call(config.projectDefaultAssignees || {}, listId)) {
    return { ok: true, token };
  }

  const access = await requireSubprojectEditor(request, folderId, listId);
  return access.ok ? { ok: true, token: access.token } : access;
}
