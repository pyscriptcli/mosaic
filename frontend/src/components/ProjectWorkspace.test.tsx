// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

const { refreshProject } = vi.hoisted(() => ({ refreshProject: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-111111/subproject-222222/tasks",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/browserPageCache", () => ({
  getBrowserPageCache: (_owner: string, key: string) => key === "projects:selection" ? { folderIds: ["111111"] } : key === "project:111111" ? cachedWorkspace : undefined,
  readBrowserPageCache: async () => undefined,
  refreshBrowserPageQuery: (owner: string, key: string, load: () => Promise<unknown>) => key === "project:111111" || key === "user-1:111111" ? refreshProject() : load(),
  useBrowserPageQuery: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
  writeBrowserPageCache: async () => undefined,
}));
vi.mock("@/components/ClickUpLoadingProvider", () => ({ ClickUpLoadingPanel: () => null }));
vi.mock("@/lib/clickupSyncClient", () => ({ requestCentralClickUpSync: vi.fn(), trackClickUpLiveRefresh: vi.fn() }));

const cachedWorkspace = {
  folder: { id: "111111", name: "Project", url: "", spaceName: "" },
  lists: [{ id: "222222", name: "Subproject", taskCount: 1, statuses: ["to do"] }],
  tasks: [{ id: "task-1", name: "Loaded milestone", url: null, parentId: null, listId: "222222", status: "to do", statusType: "open", startDate: null, dueDate: null, assignees: [] }],
  loadedTaskListIds: ["222222"], taskSyncByList: {}, members: [], defaultAssignees: {},
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); refreshProject.mockReset(); });

describe("Projects subproject Timeline", () => {
  it("keeps loaded tasks visible when background metadata refresh returns no tasks", async () => {
    let resolveRefresh: (value: typeof cachedWorkspace) => void = () => undefined;
    refreshProject.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/selection")) return Response.json({ folderIds: ["111111"] });
      if (url.includes("project-list-tasks")) return Response.json({ tasks: cachedWorkspace.tasks, syncState: "synced" });
      return Response.json({});
    }));

    render(<ProjectWorkspace userId="user-1" />);
    await waitFor(() => expect(screen.getByText("Subproject")).toBeTruthy());
    expect(await screen.findByText("Loaded milestone")).toBeTruthy();
    expect(refreshProject).toHaveBeenCalled();

    await act(async () => {
      resolveRefresh({ ...cachedWorkspace, tasks: [], loadedTaskListIds: [], taskSyncByList: {} });
    });

    expect(screen.getByText("Loaded milestone")).toBeTruthy();
    expect(screen.queryByText("No tasks in this subproject")).toBeNull();
  });
});
