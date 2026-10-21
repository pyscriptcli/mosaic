import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const token = vi.hoisted(() => vi.fn(() => "clickup-token"));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getTokenFromRequest: token }));
vi.mock("@/lib/clickupCalendarApi", () => ({ clickUpCalendarFetch: apiFetch }));

describe("GET /api/meeting-assignees", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (_token: string, url: string) => {
      if (url.endsWith("/team")) return Response.json({ teams: [{ id: 10, name: "Collaborate @ PRIME" }] });
      if (url.endsWith("/team/10/space")) return Response.json({ spaces: [
        { id: 101, name: "CRD" }, { id: 102, name: "IT" }, { id: 103, name: "Operations" },
      ] });
      if (url.endsWith("/team/10/member")) return Response.json({ members: [
        { user: { id: 1, username: "Alex Cruz", email: "alex@primephilippines.com" } },
        { user: { id: 2, username: "Bea Santos", email: "bea@primephilippines.com" } },
        { user: { id: 3, username: "Cam Reyes", email: "cam@primephilippines.com" } },
        { user: { id: 4, username: "Drew Lim", email: "drew@primephilippines.com" } },
      ] });
      if (url.endsWith("/space/101/member")) return Response.json({ members: [{ user: { id: 2 } }, { user: { id: 1 } }] });
      if (url.endsWith("/space/102/member")) return Response.json({ members: [{ user: { id: 3 } }, { user: { id: 2 } }] });
      return Response.json({ members: [] });
    });
  });

  it("puts CRD and IT members first, deduplicates, then lists remaining Workspace members", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/meeting-assignees"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.members.map((member: { id: string }) => member.id)).toEqual(["1", "2", "3", "4"]);
    expect(json.members[0].spaces).toEqual(["CRD"]);
    expect(json.members[1].spaces).toEqual(["CRD", "IT"]);
    expect(json.members[2].spaces).toEqual(["IT"]);
  });
});
