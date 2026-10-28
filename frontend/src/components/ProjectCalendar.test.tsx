// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => vi.restoreAllMocks());

describe("Projects Calendar", () => {
  it("moves a task immediately and rolls back when staging the move fails", async () => {
    let rejectRequest: (reason: Error) => void = () => undefined;
    const request = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectRequest = reject; }));
    vi.stubGlobal("fetch", request);
    render(<CalendarHarness />);

    expect(screen.getAllByText("Launch milestone").length).toBeGreaterThan(0);
    const targetCell = screen.getByRole("button", { name: `Create task on ${dateKey(movedTo)}` });
    fireEvent.drop(targetCell, { dataTransfer: { getData: () => "task-1" } });

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: `Create task on ${dateKey(movedTo)}` }).textContent).toContain("Launch milestone");
    rejectRequest(new Error("Mosaic could not save this change."));
    expect((await screen.findByRole("alert")).textContent).toContain("Mosaic could not save this change.");
    expect(screen.getAllByText("Launch milestone").some((node) => node.closest("[aria-label^='Create task on']")?.getAttribute("aria-label") === `Create task on ${dateKey(today)}`)).toBe(true);
  });
});
