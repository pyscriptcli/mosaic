// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { normalizeBAState } from "@/lib/business-analysis";
import { BusinessAnalysisView } from "./BusinessAnalysisView";

const workspace = normalizeBAState({
  projects: [{
    id: "project-1", name: "Mosaic Core", description: "Core platform", requirements: [{
      id: "REQ-001", statement: "Staff can sign in", category: "Functional", priority: "Must Have", userStory: "As a staff member, I can sign in.",
      testCase: "Confirm valid credentials", verification: "Not Tested", tasks: [],
    }],
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

  it("shows the seven requested sections and the Reports tab", async () => {
    const tablist = within(await openProject());
    expect(tablist.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Dashboard", "Product Backlog", "Sprint Backlog", "RTM", "System Design and Architecture", "End to End Process", "Deployment", "Reports",
    ]);
    expect(screen.getByRole("heading", { name: "Project timeline" })).toBeTruthy();
  });

  it("offers list and card views in Product Backlog, Sprint Backlog, and RTM", async () => {
    await openProject();
    for (const section of ["Product Backlog", "Sprint Backlog", "RTM"]) {
      fireEvent.click(screen.getByRole("tab", { name: section }));
      const group = screen.getByRole("group", { name: `${section} view` });
      const cards = within(group).getByRole("button", { name: "Cards" });
      fireEvent.click(cards);
      expect(cards.getAttribute("aria-pressed")).toBe("true");
      const list = within(group).getByRole("button", { name: "List" });
      fireEvent.click(list);
      expect(list.getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("saves Product Backlog edits through the existing workspace API", async () => {
    await openProject();
    fireEvent.click(screen.getByRole("tab", { name: "Product Backlog" }));
    fireEvent.change(screen.getByLabelText("REQ-001 Feature Name"), { target: { value: "Staff access" } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
    }, { timeout: 2500 });
    expect((savedState as typeof workspace).projects[0].requirements[0].featureName).toBe("Staff access");
  });
});
