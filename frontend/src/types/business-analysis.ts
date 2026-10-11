export type RequirementCategory = "Functional" | "Non-Functional" | "Technical" | "Compliance" | "Business";
export type MoscowPriority = "Must Have" | "Should Have" | "Could Have" | "Won't Have";
export type VerificationStatus = "Passed" | "In Dev" | "Not Tested" | "Blocked";

export interface BARequirementTask {
  id: string;
  title: string;
  done: boolean;
  clickUpTask?: {
    id: string;
    url: string;
    listId: string;
    listName: string;
  };
}

export interface BARequirement {
  id: string;
  createdAt: string;
  updatedAt: string;
  statement: string;
  featureName: string;
  complexity: string;
  implementationStatus: string;
  technicalFeature: string;
  testCaseId: string;
  mappingStatus: string;
  businessImpact: string;
  category: RequirementCategory;
  priority: MoscowPriority | "";
  userStory: string;
  acceptanceCriteria: string;
  testCase: string;
  verification: VerificationStatus;
  tasks: BARequirementTask[];
}

export interface BAWorkItem {
  id: string;
  [field: string]: string;
}

export interface BAPhase {
  name: string;
  startDate: string;
  targetDate: string;
  deliverables: Array<{ label: string; done: boolean }>;
}

export interface BADocument {
  id: string;
  title: string;
  kind: string;
  content: string;
  updatedAt: string;
}

export interface BAProject {
  id: string;
  name: string;
  description: string;
  discoveryNotes: string;
  requirements: BARequirement[];
  sprintBacklog: BAWorkItem[];
  systemDesign: BAWorkItem[];
  endToEndProcess: BAWorkItem[];
  deployments: BAWorkItem[];
  phases: BAPhase[];
  documents: BADocument[];
  createdAt: string;
  updatedAt: string;
}

export interface BAWorkspaceState {
  projects: BAProject[];
  tableColumnWidths: number[];
}
