import type { BAProject, BAWorkspaceState } from "@/types/business-analysis";

export const BA_PHASES: Array<{ name: string; deliverables: string[] }> = [
  { name: "Discovery & Elicitation", deliverables: ["Problem statement", "As-Is process map", "Scope cutlines"] },
  { name: "Design & RTM Baseline", deliverables: ["BRD final", "FRD data specs", "Traceability baseline"] },
  { name: "Development & Sprints", deliverables: ["Core services", "Connectors", "API contracts"] },
  { name: "User Acceptance Testing", deliverables: ["Test scripts", "Defect triage", "Sign-off certificate"] },
  { name: "Deployment & Cutover", deliverables: ["Go-live runbook", "Data migration", "Release notes"] },
  { name: "Post-Go-Live & Hypercare", deliverables: ["PIR retrospective", "BAU handover"] },
];

export const BA_MIN_COLUMN_WIDTHS = [100, 220, 100, 115, 240, 280, 110, 140, 150, 220];
export const DEFAULT_BA_COLUMN_WIDTHS = [110, 240, 110, 125, 260, 300, 120, 160, 175, 240];
export const EMPTY_BA_STATE: BAWorkspaceState = { projects: [], tableColumnWidths: DEFAULT_BA_COLUMN_WIDTHS };

export function createBAProject(name = "New BA Project"): BAProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name, description: "", discoveryNotes: "", requirements: [], sprintBacklog: [], systemDesign: [], endToEndProcess: [], deployments: [],
    phases: BA_PHASES.map((phase) => ({
      name: phase.name,
      startDate: "",
      targetDate: "",
      deliverables: phase.deliverables.map((label) => ({ label, done: false })),
    })),
    documents: [], createdAt: now, updatedAt: now,
  };
}

export function normalizeBAState(value: unknown): BAWorkspaceState {
  if (!value || typeof value !== "object" || !Array.isArray((value as { projects?: unknown }).projects)) return EMPTY_BA_STATE;
  const rawState = value as { projects: unknown[]; tableColumnWidths?: unknown };
  const source = rawState.projects.slice(0, 50);
  const rawWidths = Array.isArray(rawState.tableColumnWidths) ? rawState.tableColumnWidths : null;
  const tableColumnWidths = rawWidths
    ? DEFAULT_BA_COLUMN_WIDTHS.map((fallback, index) => Math.max(BA_MIN_COLUMN_WIDTHS[index], Math.min(720, Number.isFinite(Number(rawWidths[index])) ? Number(rawWidths[index]) : fallback)))
    : [...DEFAULT_BA_COLUMN_WIDTHS];
  const text = (value: unknown, limit = 500) => typeof value === "string" ? value.slice(0, limit) : "";
  const categories = ["Functional", "Non-Functional", "Technical", "Compliance", "Business"];
  const priorities = ["Must Have", "Should Have", "Could Have", "Won't Have"];
  const statuses = ["Passed", "In Dev", "Not Tested", "Blocked"];
  const records = (value: unknown, fields: string[]) => Array.isArray(value) ? value.slice(0, 1000).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const id = text(record.id, 80) || `row-${index + 1}`;
    return [{ id, ...Object.fromEntries(fields.map((field) => [field, text(record[field], 5000)])) }];
  }) : [];
    const normalizedAt = new Date().toISOString();
  const projects = source.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.name !== "string") return [];
    const rawRequirements = Array.isArray(item.requirements) ? item.requirements.slice(0, 1000) : [];
    const requirements = rawRequirements.flatMap((rawRequirement) => {
      if (!rawRequirement || typeof rawRequirement !== "object") return [];
      const req = rawRequirement as Record<string, unknown>;
      if (typeof req.id !== "string") return [];
      const createdAt = text(req.createdAt, 40) || normalizedAt;
      const rawTasks = Array.isArray(req.tasks) ? req.tasks.slice(0, 100) : [];
      const tasks = rawTasks.flatMap((rawTask, index) => {
        if (!rawTask || typeof rawTask !== "object") return [];
        const task = rawTask as Record<string, unknown>;
        if (typeof task.title !== "string") return [];
        const rawClickUpTask = task.clickUpTask && typeof task.clickUpTask === "object" ? task.clickUpTask as Record<string, unknown> : null;
        const clickUpTask = rawClickUpTask && typeof rawClickUpTask.id === "string" && typeof rawClickUpTask.listId === "string"
          ? { id: text(rawClickUpTask.id, 80), url: text(rawClickUpTask.url, 500), listId: text(rawClickUpTask.listId, 80), listName: text(rawClickUpTask.listName, 200) }
          : undefined;
        return [{ id: text(task.id, 80) || `${text(req.id, 40)}-task-${index + 1}`, title: text(task.title, 500), done: task.done === true, ...(clickUpTask ? { clickUpTask } : {}) }];
      });
      const legacyMilestone = text(req.milestone, 300);
      if (!tasks.length && legacyMilestone) tasks.push({ id: `${text(req.id, 40)}-legacy-task`, title: legacyMilestone, done: false });
      return [{
        id: text(req.id, 40), createdAt, updatedAt: text(req.updatedAt, 40) || createdAt, statement: text(req.statement, 5000), featureName: text(req.featureName, 500), complexity: text(req.complexity, 100), implementationStatus: text(req.implementationStatus, 100) || "Not Started", technicalFeature: text(req.technicalFeature, 1000), testCaseId: text(req.testCaseId, 200), mappingStatus: text(req.mappingStatus, 100) || "Unmapped", businessImpact: text(req.businessImpact, 3000),
        category: categories.includes(String(req.category)) ? req.category as BAProject["requirements"][number]["category"] : "Business",
        priority: req.priority === "" ? "" : priorities.includes(String(req.priority)) ? req.priority as BAProject["requirements"][number]["priority"] : "Must Have",
        userStory: text(req.userStory, 5000), acceptanceCriteria: text(req.acceptanceCriteria, 10000),
        testCase: text(req.testCase, 500), verification: statuses.includes(String(req.verification)) ? req.verification as BAProject["requirements"][number]["verification"] : "Not Tested",
        tasks,
      }];
    });
    const rawPhases = Array.isArray(item.phases) ? item.phases : [];
    const phases = BA_PHASES.map((template) => {
      const phase = rawPhases.find((entry) => Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).name === template.name)) as Record<string, unknown> | undefined;
      const rawDeliverables = Array.isArray(phase?.deliverables) ? phase.deliverables : [];
      return {
        name: template.name, startDate: text(phase?.startDate, 20), targetDate: text(phase?.targetDate, 20),
        deliverables: template.deliverables.map((label) => {
          const saved = rawDeliverables.find((entry) => Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).label === label)) as Record<string, unknown> | undefined;
          return { label, done: saved?.done === true };
        }),
      };
    });
    const rawDocuments = Array.isArray(item.documents) ? item.documents.slice(0, 100) : [];
    const documents = rawDocuments.flatMap((rawDocument) => {
      if (!rawDocument || typeof rawDocument !== "object") return [];
      const doc = rawDocument as Record<string, unknown>;
      return typeof doc.id === "string" ? [{ id: text(doc.id, 40), title: text(doc.title, 200), kind: text(doc.kind, 100), content: text(doc.content, 100_000), updatedAt: text(doc.updatedAt, 40) }] : [];
    });
    return [{
      id: text(item.id, 40), name: text(item.name, 200), description: text(item.description, 5000),
      discoveryNotes: text(item.discoveryNotes, 100_000), requirements, phases, documents,
      sprintBacklog: records(item.sprintBacklog, ["taskName", "module", "priority", "status", "estimatedHours", "actualHours", "blockers"]),
      systemDesign: records(item.systemDesign, ["component", "function", "technology", "dataSource", "integrationPoint", "dependencies"]),
      endToEndProcess: records(item.endToEndProcess, ["step", "phase", "userAction", "systemLogic", "output", "tool"]),
      deployments: records(item.deployments, ["step", "phase", "actionItem", "environment", "owner", "rollbackPlan", "status"]),
      createdAt: text(item.createdAt, 40), updatedAt: text(item.updatedAt, 40),
    }];
  });
  return { projects, tableColumnWidths };
}

export function nextRequirementId(requirements: Array<{ id: string }>) {
  const max = requirements.reduce((value, requirement) => {
    const match = requirement.id.match(/^REQ-(\d+)$/i);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `REQ-${String(max + 1).padStart(3, "0")}`;
}

export function requirementsFromNotes(notes: string, existing: BAProject["requirements"]): BAProject["requirements"] {
  const next = [...existing];
  const now = new Date().toISOString();
  for (const line of notes.split(/\r?\n/)) {
    const match = line.match(/^\s*@((?:REQ|NFR)-\d+)\s*(?::|-)?\s+(.+?)\s*$/i);
    if (!match) continue;
    const id = match[1].toUpperCase();
    const statement = match[2].trim();
    const index = next.findIndex((requirement) => requirement.id.toUpperCase() === id);
    if (index >= 0) next[index] = { ...next[index], statement, updatedAt: now };
    else next.push({ id, createdAt: now, updatedAt: now, statement, featureName: "", complexity: "", implementationStatus: "Not Started", technicalFeature: "", testCaseId: "", mappingStatus: "Unmapped", businessImpact: "", category: "Business", priority: "", userStory: "", acceptanceCriteria: "", testCase: "", verification: "Not Tested", tasks: [] });
  }
  return next;
}
