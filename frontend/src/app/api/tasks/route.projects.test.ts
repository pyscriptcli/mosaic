import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  fetchAllTasks: vi.fn(),
  readSnapshot: vi.fn(),
  queueSync: vi.fn(),
  readStaged: vi.fn(),
  findStaged: vi.fn(),
  stageWrite: vi.fn(),
  requireEditor: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after,
}));

vi.mock("@/lib/auth", () => ({
  getTokenFromRequest: () => "clickup-token",
  getUserFromRequest: () => ({ id: "42", email: "user@example.com" }),
}));
vi.mock("@/lib/clickupCalendarApi", () => ({
  clickUpCalendarFetch: mocks.fetch,
  clickUpFetch: mocks.fetch,
  fetchAllClickUpListTasks: mocks.fetchAllTasks,
}));
vi.mock("@/lib/clickupReadStore", () => ({
  clickUpScope: () => "scope",
  readClickUpTaskSnapshot: mocks.readSnapshot,
  queueClickUpSync: mocks.queueSync,
}));
vi.mock("@/lib/mosaicWriteStore", () => ({
  findStagedMosaicRecord: mocks.findStaged,
  mergeStagedClickUpTasks: (tasks: unknown[]) => tasks,
  readStagedMosaicRecords: mocks.readStaged,
  scheduleMosaicWriteSync: vi.fn(),
  stageMosaicWrite: mocks.stageWrite,
}));
vi.mock("@/lib/admin-config/store", () => ({ loadAdminConfig: vi.fn(), saveAdminConfig: vi.fn() }));
vi.mock("@/lib/projectActivity", () => ({ recordProjectActivity: vi.fn() }));
vi.mock("@/lib/telemetry", () => ({ recordTelemetry: vi.fn() }));
vi.mock("@/lib/project-permissions", () => ({
  getSubprojectAccess: vi.fn(),
  getVerifiedClickUpUser: vi.fn(),
  isSubprojectAdmin: vi.fn(),
  requireManagedTaskEditor: vi.fn(),
  requireSubprojectEditor: mocks.requireEditor,
}));

import { GET, POST } from "@/app/api/tasks/route";

function request() {
  return new NextRequest("http://localhost/api/tasks?action=project-list-tasks&folderId=111111&listId=123456", {
    headers: { cookie: "echo_clickup_token=clickup-token" },
  });
}

describe("Projects task reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(Response.json({ lists: [{ id: "123456" }] }));
    mocks.fetchAllTasks.mockResolvedValue([]);
    mocks.readSnapshot.mockResolvedValue({
      tasks: [{ id: "task-1", name: "Cached milestone", list: { id: "123456" }, status: { status: "to do" } }],
      syncedAt: new Date().toISOString(),
      syncState: "ready",
    });
    mocks.readStaged.mockResolvedValue([]);
  });

  it("serves a fresh durable task snapshot without fetching the ClickUp task list", async () => {
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toMatchObject([{ id: "task-1", name: "Cached milestone", listId: "123456" }]);
    expect(payload.source).toBe("snapshot");
    expect(mocks.fetchAllTasks).not.toHaveBeenCalled();
    expect(mocks.queueSync).not.toHaveBeenCalled();
  });

  it("stages a task move from the fresh snapshot without reading the task from ClickUp", async () => {
    mocks.requireEditor.mockResolvedValue({ ok: true, token: "clickup-token", user: { id: "42", email: "user@example.com" } });
    mocks.findStaged.mockResolvedValue(null);
    const response = await POST(new NextRequest("http://localhost/api/tasks?action=project-task-update", {
      method: "POST",
      headers: { cookie: "echo_clickup_token=clickup-token", "content-type": "application/json" },
      body: JSON.stringify({
        folderId: "111111", listId: "123456", taskId: "task-1", taskName: "Cached milestone",
        previous: { dueDate: "2026-10-01T00:00:00.000Z" }, dueDate: "2026-10-09",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.pendingSync).toBe(true);
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes("/task/task-1"))).toBe(false);
    expect(mocks.stageWrite).toHaveBeenCalledWith(expect.objectContaining({
      recordId: "task-1",
      listId: "123456",
      requestBody: expect.objectContaining({ due_date: new Date("2026-10-09T00:00:00.000Z").getTime() }),
    }));
  });

  it("uses one live task verification when the snapshot is older than five minutes", async () => {
    mocks.requireEditor.mockResolvedValue({ ok: true, token: "clickup-token", user: { id: "42", email: "user@example.com" } });
    mocks.findStaged.mockResolvedValue(null);
    mocks.readSnapshot.mockResolvedValue({
      tasks: [{ id: "task-1", name: "Old cached milestone", list: { id: "123456" } }],
      syncedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      syncState: "ready",
    });
    mocks.fetch.mockImplementation((url: string) => String(url).includes("/folder/")
      ? Promise.resolve(Response.json({ lists: [{ id: "123456" }] }))
      : Promise.resolve(Response.json({ id: "task-1", name: "Live milestone", list: { id: "123456" }, due_date: null })));

    const response = await POST(new NextRequest("http://localhost/api/tasks?action=project-task-update", {
      method: "POST",
      headers: { cookie: "echo_clickup_token=clickup-token", "content-type": "application/json" },
      body: JSON.stringify({ folderId: "111111", listId: "123456", taskId: "task-1", dueDate: "2026-10-09" }),
    }));

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.task.name).toBe("Live milestone");
    expect(mocks.fetch.mock.calls.filter(([, url]) => String(url).includes("/task/task-1"))).toHaveLength(1);
    expect(mocks.stageWrite).toHaveBeenCalledWith(expect.objectContaining({ recordData: expect.objectContaining({ name: "Live milestone" }) }));
  });
});
