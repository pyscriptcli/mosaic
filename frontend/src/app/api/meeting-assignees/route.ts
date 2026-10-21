import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpCalendarFetch } from "@/lib/clickupCalendarApi";

type Member = { id: string; username: string; email: string; initials: string; spaces: string[] };
type RawMember = { id: string | number; username?: string; name?: string; email?: string; initials?: string; user?: RawMember };

function unwrapMembers(payload: { members?: RawMember[] } | null): RawMember[] {
  return (payload?.members || []).map((entry) => entry.user || entry);
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });

  const fetchJson = async (path: string) => {
    const response = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2${path}`);
    if (!response.ok) throw new Error(`ClickUp request failed (${response.status}).`);
    return response.json();
  };

  try {
    const teamsPayload = await fetchJson("/team") as { teams?: Array<{ id: string | number; name?: string; members?: RawMember[] }> };
    const teams = teamsPayload.teams || [];
    if (!teams.length) return NextResponse.json({ members: [], workspace: "" });

    const workspaceOptions = await Promise.all(teams.map(async (team) => {
      try {
        const payload = await fetchJson(`/team/${encodeURIComponent(String(team.id))}/space`) as { spaces?: Array<{ id: string | number; name?: string }> };
        const spaces = payload.spaces || [];
        const priorityCount = ["crd", "it"].filter((name) => spaces.some((space) => String(space.name || "").trim().toLowerCase() === name)).length;
        return { team, spaces, priorityCount };
      } catch {
        return { team, spaces: [], priorityCount: 0 };
      }
    }));
    const selected = [...workspaceOptions].sort((a, b) => b.priorityCount - a.priorityCount)[0];

    const workspaceMembersPromise = selected.team.members?.length
      ? Promise.resolve(unwrapMembers({ members: selected.team.members }))
      : fetchJson(`/team/${encodeURIComponent(String(selected.team.id))}/member`)
        .then((payload) => unwrapMembers(payload as { members?: RawMember[] }))
        .catch(() => [] as RawMember[]);
    const crdAndIt = selected.spaces.filter((space) => ["crd", "it"].includes(String(space.name || "").trim().toLowerCase()));
    const spaceMembers = await Promise.all(crdAndIt.map(async (space) => {
      try {
        const payload = await fetchJson(`/space/${encodeURIComponent(String(space.id))}/member`) as { members?: RawMember[] };
        return { name: String(space.name || "").trim().toUpperCase(), members: unwrapMembers(payload) };
      } catch {
        return { name: String(space.name || "").trim().toUpperCase(), members: [] as RawMember[] };
      }
    }));
    const [workspaceMembers] = await Promise.all([workspaceMembersPromise]);

    const memberMap = new Map<string, Member>();
    const normalize = (member: RawMember, space?: string): Member => {
      const id = String(member.id);
      const username = String(member.username || member.name || member.email || "Team member");
      return {
        id,
        username,
        email: String(member.email || ""),
        initials: String(member.initials || username[0] || "?").slice(0, 2).toUpperCase(),
        spaces: space ? [space] : [],
      };
    };

    for (const member of workspaceMembers) memberMap.set(String(member.id), normalize(member));
    for (const space of spaceMembers) {
      for (const raw of space.members) {
        const id = String(raw.id);
        const existing = memberMap.get(id) || normalize(raw);
        const spaces = existing.spaces.includes(space.name) ? existing.spaces : [...existing.spaces, space.name];
        memberMap.set(id, { ...existing, ...normalize({ ...raw, username: existing.username || raw.username, email: existing.email || raw.email }), spaces });
      }
    }

    const priority = (member: Member) => member.spaces.includes("CRD") ? 0 : member.spaces.includes("IT") ? 1 : 2;
    const members = Array.from(memberMap.values()).sort((a, b) => priority(a) - priority(b) || a.username.localeCompare(b.username));
    return NextResponse.json({ workspace: String(selected.team.name || "ClickUp Workspace"), members }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load ClickUp members." }, { status: 502 });
  }
}
