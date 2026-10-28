// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarView, type ProjectTask } from "@/components/ProjectWorkspace";

const today = new Date();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const movedTo = new Date(today);
movedTo.setDate(movedTo.getDate() + 1);

function CalendarHarness() {
  const [tasks, setTasks] = useState<ProjectTask[]>([{
    id: "task-1", name: "Launch milestone", url: null, parentId: null, listId: "123456",
    status: "to do", statusType: "open", startDate: null, dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
    assignees: [],
  }]);

  return <CalendarView
    folderId="111111"
    tasks={tasks}
    lists={[{ id: "123456", name: "Delivery", taskCount: 1, statuses: ["to do"] }]}
    members={[]}
    defaultAssignees={{}}
    onTaskChange={(task) => setTasks((current) => current.map((item) => item.id === task.id ? task : item))}
    canEdit
  />;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Projects Calendar", () => {
  it("coalesces rapid drops for one task into a single staged move to the latest date", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) => Response.json({ pendingSync: true }));
    vi.stubGlobal("fetch", request);
    render(<CalendarHarness />);
    const firstDate = new Date(today);
    firstDate.setDate(firstDate.getDate() + 1);
    const latestDate = new Date(today);
    latestDate.setDate(latestDate.getDate() + 2);

    fireEvent.drop(screen.getByRole("button", { name: `Create task on ${dateKey(firstDate)}` }), { dataTransfer: { getData: () => "task-1" } });
    fireEvent.drop(screen.getByRole("button", { name: `Create task on ${dateKey(latestDate)}` }), { dataTransfer: { getData: () => "task-1" } });
    expect(request).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(request).toHaveBeenCalledOnce();
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.dueDate).toBe(dateKey(latestDate));
    vi.useRealTimers();
  });

  it("moves a task immediately and rolls back when staging the move fails", async () => {
    let rejectRequest: (reason: Error) => void = () => undefined;
    const request = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectRequest = reject; }));
    vi.stubGlobal("fetch", request);
    render(<CalendarHarness />);

    expect(screen.getAllByText("Launch milestone").length).toBeGreaterThan(0);
    const targetCell = screen.getAllByRole("button", { name: `Create task on ${dateKey(movedTo)}` })[0];
    fireEvent.drop(targetCell, { dataTransfer: { getData: () => "task-1" } });

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(screen.getAllByRole("button", { name: `Create task on ${dateKey(movedTo)}` }).some((node) => node.textContent?.includes("Launch milestone"))).toBe(true);
    rejectRequest(new Error("Mosaic could not save this change."));
    expect((await screen.findByRole("alert")).textContent).toContain("Mosaic could not save this change.");
    expect(screen.getAllByText("Launch milestone").some((node) => node.closest("[aria-label^='Create task on']")?.getAttribute("aria-label") === `Create task on ${dateKey(today)}`)).toBe(true);
  });
});
