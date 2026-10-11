// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { normalizeBAState } from "@/lib/business-analysis";
import { BusinessAnalysisView } from "./BusinessAnalysisView";

const workspace = normalizeBAState({
  projects: [{
    id: "project-1", name: "Mosaic Core", description: "Core platform", requirements: [{
      id: "REQ-001", statement: "Staff can sign in", category: "Functional", priority: "Must Have", userStory: "As a staff member, I can sign in.",
      featureName: "Staff access", complexity: "Medium", implementationStatus: "In Progress", technicalFeature: "Identity service", testCaseId: "TC-001", mappingStatus: "Partial", acceptanceCriteria: "A valid user reaches the workspace.", businessImpact: "Staff can begin work.",
      testCase: "Confirm valid credentials", verification: "Not Tested", tasks: [{ id: "task-1", title: "Wire identity provider", done: false }],
    }],
    sprintBacklog: [{ id: "TASK-001", taskName: "Build login", module: "Identity", priority: "Must Have", status: "In Progress", estimatedHours: "4", actualHours: "2", blockers: "Waiting on redirect URL" }],
    systemDesign: [{ id: "COMP-001", component: "Identity service", function: "Authenticate staff", technology: "Next.js", dataSource: "Supabase", integrationPoint: "OAuth callback", dependencies: "User profile" }],
    endToEndProcess: [{ id: "STEP-001", step: "Sign in", phase: "Access", userAction: "Enter credentials", systemLogic: "Validate session", output: "Workspace opens", tool: "Browser" }],
    deployments: [{ id: "DEP-001", step: "Preview", phase: "Release", actionItem: "Publish build", environment: "Preview", owner: "Dave", rollbackPlan: "Restore prior build", status: "In Progress" }],
    documents: [{ id: "doc-1", title: "Project Charter", kind: "Project Charter", content: "Scope and goals", updatedAt: "2026-10-10T00:00:00.000Z" }],
  }],
});

describe("IT Projects workspace", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let savedState: unknown;

  beforeEach(() => {
    savedState = workspace;
    fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        savedState = JSON.parse(String(init.body)).state;
        return { ok: true, json: async () => ({ saved: true }) };
      }
      return { ok: true, json: async () => ({ state: savedState }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("normalizes existing projects into the new workspace shape without losing their requirements", () => {
    const migrated = normalizeBAState({ projects: [{
      id: "legacy", name: "Legacy project", requirements: [{ id: "REQ-004", statement: "Keep existing data", userStory: "As a user", testCase: "Check it" }],
    }] });
    expect(migrated.projects[0].requirements[0]).toMatchObject({
      id: "REQ-004", statement: "Keep existing data", userStory: "As a user", testCase: "Check it",
      featureName: "", implementationStatus: "Not Started", mappingStatus: "Unmapped",
    });
    expect(migrated.projects[0]).toMatchObject({ sprintBacklog: [], systemDesign: [], endToEndProcess: [], deployments: [] });
  });

  async function openProject() {
    render(<BusinessAnalysisView userId="user-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mosaic Core/ }));
    return screen.findByRole("tablist", { name: "IT Projects sections" });
  }

  it("shows the eight requested sections and the Reports tab", async () => {
    const tablist = within(await openProject());
    expect(tablist.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Dashboard", "Product Backlog", "Sprint Backlog", "RTM", "System Design and Architecture", "End to End Process", "Deployment", "Reports",
    ]);
    expect(screen.getByRole("heading", { name: "Project timeline" })).toBeTruthy();
  });

  it("keeps a useful list and card view available across all eight sections", async () => {
    await openProject();
    for (const [section, cardField] of [
      ["Dashboard", "Project timeline"], ["Product Backlog", "REQ-001 business requirement"],
      ["Sprint Backlog", "TASK-001 Task Name"], ["RTM", "REQ-001 business requirement"],
      ["System Design and Architecture", "COMP-001 Component"], ["End to End Process", "STEP-001 Process Phase"],
      ["Deployment", "DEP-001 Deployment Phase"], ["Reports", "Draft title"],
    ]) {
      fireEvent.click(screen.getByRole("tab", { name: section }));
      const group = screen.getByRole("group", { name: `${section} view` });
      const cards = within(group).getByRole("button", { name: "Cards" });
      fireEvent.click(cards);
      expect(cards.getAttribute("aria-pressed")).toBe("true");
      expect(section === "Dashboard" ? screen.getByRole("heading", { name: cardField }) : section === "Reports" ? document.getElementById("doc-title-doc-1") : screen.getByLabelText(cardField)).toBeTruthy();
      const list = within(group).getByRole("button", { name: "List" });
      fireEvent.click(list);
      expect(list.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("table")).toBeTruthy();
    }
  });

  it("keeps Product and RTM edits on the same requirement and preserves traceability fields", async () => {
    await openProject();
    fireEvent.click(screen.getByRole("tab", { name: "Product Backlog" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Product Backlog view" })).getByRole("button", { name: "List" }));
    fireEvent.change(screen.getByLabelText(/REQ-001 feature name/i), { target: { value: "Staff sign-in" } });
    fireEvent.click(screen.getByRole("tab", { name: "RTM" }));
    fireEvent.click(within(screen.getByRole("group", { name: "RTM view" })).getByRole("button", { name: "List" }));
    expect((screen.getByLabelText("REQ-001 Technical feature") as HTMLInputElement).value).toBe("Identity service");
    fireEvent.change(screen.getByLabelText("REQ-001 Mapping status"), { target: { value: "Mapped" } });
    expect((screen.getByLabelText(/REQ-001 business requirement/i) as HTMLTextAreaElement).value).toBe("Staff can sign in");
    await waitFor(() => expect((savedState as typeof workspace).projects[0].requirements[0]).toMatchObject({ featureName: "Staff sign-in", mappingStatus: "Mapped", tasks: [{ title: "Wire identity provider" }] }), { timeout: 3000 });
  });

  it("switches Reports layout without creating another draft", async () => {
    await openProject();
    fireEvent.click(screen.getByRole("tab", { name: "Reports" }));
    const group = screen.getByRole("group", { name: "Reports view" });
    fireEvent.click(within(group).getByRole("button", { name: "List" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect((savedState as typeof workspace).projects[0].documents).toHaveLength(1);
    fireEvent.click(within(group).getByRole("button", { name: "Cards" }));
    expect(screen.getByLabelText("Document content")).toBeTruthy();
    expect((savedState as typeof workspace).projects[0].documents).toHaveLength(1);
  });

  it("keeps requirement tasks and rich text editable and asks before deleting from RTM", async () => {
    await openProject();
    fireEvent.click(screen.getByRole("tab", { name: "RTM" }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getAllByLabelText("REQ-001 task")).toHaveLength(2);

    const story = screen.getByRole("textbox", { name: "REQ-001 user story" });
    story.textContent = "As a staff member, I can access the portal.";
    fireEvent.input(story);
    await waitFor(() => expect((savedState as typeof workspace).projects[0].requirements[0].userStory).toContain("access the portal"), { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Delete requirement REQ-001" }));
    let dialog = screen.getByRole("alertdialog", { name: "Delete requirement?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("REQ-001 business requirement")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete requirement REQ-001" }));
    dialog = screen.getByRole("alertdialog", { name: "Delete requirement?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete requirement" }));
    await waitFor(() => expect((savedState as typeof workspace).projects[0].requirements).toHaveLength(0), { timeout: 3000 });
  });

  it("saves Product Backlog edits through the existing workspace API", async () => {
    await openProject();
    fireEvent.click(screen.getByRole("tab", { name: "Product Backlog" }));
    fireEvent.change(screen.getByLabelText(/REQ-001 feature name/i), { target: { value: "Staff access" } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
    }, { timeout: 2500 });
    expect((savedState as typeof workspace).projects[0].requirements[0].featureName).toBe("Staff access");
  });
});
