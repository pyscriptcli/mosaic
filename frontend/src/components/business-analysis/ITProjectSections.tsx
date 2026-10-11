"use client";

import { useState, type ReactNode } from "react";
import { LayoutGrid, List, Plus, Trash2 } from "lucide-react";
import type { BAProject, BARequirement, BAWorkItem } from "@/types/business-analysis";

type TabId = "dashboard" | "product-backlog" | "sprint-backlog" | "rtm" | "system-design" | "end-to-end" | "deployment" | "reports";
const tabs: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "product-backlog", label: "Product Backlog" },
  { id: "sprint-backlog", label: "Sprint Backlog" },
  { id: "rtm", label: "RTM" },
  { id: "system-design", label: "System Design and Architecture" },
  { id: "end-to-end", label: "End to End Process" },
  { id: "deployment", label: "Deployment" },
  { id: "reports", label: "Reports" },
];
const priorityOptions = ["Must Have", "Should Have", "Could Have", "Won't Have"];
const featureStatus = ["Not Started", "In Progress", "Implemented", "Blocked"];

type Field = { key: string; label: string; options?: string[]; multiline?: boolean };
type RecordRow = { id: string; [field: string]: string };

function SectionHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3"><div><h2 className="font-serif text-xl font-bold italic text-[#003366]">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>{actions}</header>;
}

function ViewToggle({ value, onChange, label }: { value: "list" | "cards"; onChange: (value: "list" | "cards") => void; label: string }) {
  return <div className="inline-flex border border-slate-300 bg-white" role="group" aria-label={`${label} view`}>
    <button type="button" aria-pressed={value === "list"} onClick={() => onChange("list")} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold ${value === "list" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-slate-50"}`}><List size={14} aria-hidden="true" />List</button>
    <button type="button" aria-pressed={value === "cards"} onClick={() => onChange("cards")} className={`inline-flex min-h-9 items-center gap-1.5 border-l border-slate-300 px-3 text-xs font-semibold ${value === "cards" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-slate-50"}`}><LayoutGrid size={14} aria-hidden="true" />Cards</button>
  </div>;
}

function EditableCollection({ title, description, idLabel, fields, rows, onAdd, onUpdate, onRemove }: {
  title: string; description: string; idLabel: string; fields: Field[]; rows: RecordRow[];
  onAdd: () => void; onUpdate: (id: string, field: string, value: string) => void; onRemove: (id: string) => void;
}) {
  const [view, setView] = useState<"list" | "cards">("list");
  const inputClass = "min-h-9 w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-[#C9A33B] focus:outline-none focus:ring-1 focus:ring-[#C9A33B]";
  const editor = (row: RecordRow, field: Field) => <label key={field.key} className="block min-w-0 text-[11px] font-semibold text-slate-600">{field.label}
    {field.options ? <select aria-label={`${row.id} ${field.label}`} className={`${inputClass} mt-1`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)}><option value="">Select</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
      : field.multiline ? <textarea aria-label={`${row.id} ${field.label}`} className={`${inputClass} mt-1 min-h-20 resize-y`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)} />
        : <input aria-label={`${row.id} ${field.label}`} className={`${inputClass} mt-1`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)} />}</label>;
  return <section className="space-y-4">
    <SectionHeading title={title} description={description} actions={<div className="flex flex-wrap gap-2"><ViewToggle label={title} value={view} onChange={setView} /><button type="button" onClick={onAdd} className="inline-flex min-h-9 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#174778]"><Plus size={14} />Add {title === "Product Backlog" ? "feature" : title === "Sprint Backlog" ? "task" : "row"}</button></div>} />
    {rows.length === 0 ? <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><p className="text-sm font-semibold text-[#003366]">No {title.toLowerCase()} items yet</p><p className="mt-1 text-xs text-slate-600">Add a row when you have project information to track.</p></div>
      : view === "list" ? <div className="overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[920px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><tr><th className="w-28 border border-slate-200 px-3 py-2">{idLabel}</th>{fields.map((field) => <th key={field.key} className="border border-slate-200 px-3 py-2">{field.label}</th>)}<th className="w-12 border border-slate-200 px-2 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={index % 2 ? "bg-slate-50/50" : "bg-white"}><th scope="row" className="border border-slate-200 px-3 py-2 align-top font-mono font-semibold text-[#003366]">{row.id}</th>{fields.map((field) => <td key={field.key} className="min-w-36 border border-slate-200 px-2 py-1 align-top">{field.options ? <select aria-label={`${row.id} ${field.label}`} className={`${inputClass} min-w-32`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)}><option value="">Select</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={`${row.id} ${field.label}`} className="min-h-9 w-full min-w-32 border border-transparent bg-transparent px-2 text-sm text-slate-800 hover:border-slate-200 focus:border-[#C9A33B] focus:bg-white focus:outline-none" value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)} />}</td>)}<td className="border border-slate-200 px-1 py-1 align-top"><button type="button" aria-label={`Remove ${row.id}`} onClick={() => onRemove(row.id)} className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-red-50 hover:text-[#9B3030]"><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
        : <div className="grid gap-3 md:grid-cols-2">{rows.map((row) => <article key={row.id} className="border border-slate-200 bg-white p-4"><header className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2"><h3 className="font-mono text-sm font-semibold text-[#003366]">{row.id}</h3><button type="button" aria-label={`Remove ${row.id}`} onClick={() => onRemove(row.id)} className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-red-50 hover:text-[#9B3030]"><Trash2 size={14} /></button></header><div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => editor(row, field))}</div></article>)}</div>}
  </section>;
}

function requirementRecord(item: BARequirement): RecordRow {
  return { ...item, id: item.id, feature: item.featureName || "", description: item.statement } as unknown as RecordRow;
}

export function ITProjectSections({ project, updateProject, updateRequirement, addRequirement, onRequestDeleteRequirement, reports }: {
  project: BAProject;
  updateProject: (updater: (current: BAProject) => BAProject) => void;
  updateRequirement: (id: string, changes: Partial<BARequirement>) => void;
  addRequirement: () => void;
  onRequestDeleteRequirement: (id: string, trigger: HTMLButtonElement) => void;
  reports: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [productView, setProductView] = useState<"list" | "cards">("list");
  const [rtmView, setRtmView] = useState<"list" | "cards">("list");
  const newRow = (key: "sprintBacklog" | "systemDesign" | "endToEndProcess" | "deployments", fields: Field[]): BAWorkItem => {
    const prefix = { sprintBacklog: "TASK", systemDesign: "COMP", endToEndProcess: "STEP", deployments: "DEP" }[key];
    const max = project[key].reduce((highest, row) => Math.max(highest, Number(row.id.match(/(\d+)$/)?.[1] || 0)), 0);
    return { id: `${prefix}-${String(max + 1).padStart(3, "0")}`, ...Object.fromEntries(fields.map((field) => [field.key, ""])) };
  };
  const updateRows = (key: "sprintBacklog" | "systemDesign" | "endToEndProcess" | "deployments", id: string, field: string, value: string) => updateProject((current) => ({ ...current, [key]: current[key].map((row) => row.id === id ? { ...row, [field]: value } : row) }));
  const addRow = (key: "sprintBacklog" | "systemDesign" | "endToEndProcess" | "deployments", fields: Field[]) => updateProject((current) => ({ ...current, [key]: [...current[key], newRow(key, fields)] }));
  const removeRow = (key: "sprintBacklog" | "systemDesign" | "endToEndProcess" | "deployments", id: string) => updateProject((current) => ({ ...current, [key]: current[key].filter((row) => row.id !== id) }));
  const sprintFields: Field[] = [{ key: "taskName", label: "Task Name" }, { key: "module", label: "Module" }, { key: "priority", label: "Priority", options: priorityOptions }, { key: "status", label: "Status", options: ["To Do", "In Progress", "Blocked", "Done"] }, { key: "estimatedHours", label: "Est. Hours" }, { key: "actualHours", label: "Actual Hours" }, { key: "blockers", label: "Blockers" }];
  const designFields: Field[] = [{ key: "component", label: "Component" }, { key: "function", label: "Function" }, { key: "technology", label: "Technology / Stack" }, { key: "dataSource", label: "Data Source" }, { key: "integrationPoint", label: "Integration Point" }, { key: "dependencies", label: "Dependencies" }];
  const processFields: Field[] = [{ key: "phase", label: "Process Phase" }, { key: "userAction", label: "User Action" }, { key: "systemLogic", label: "System / Logic" }, { key: "output", label: "Output / Result" }, { key: "tool", label: "Tool Involved" }];
  const deploymentFields: Field[] = [{ key: "phase", label: "Deployment Phase" }, { key: "actionItem", label: "Action Item" }, { key: "environment", label: "Environment" }, { key: "owner", label: "Owner" }, { key: "rollbackPlan", label: "Rollback Plan" }, { key: "status", label: "Status" }];
  const productFields: Field[] = [{ key: "category", label: "Category", options: ["Business", "Functional", "Non-Functional", "Technical", "Compliance"] }, { key: "feature", label: "Feature Name" }, { key: "description", label: "Business Requirement", multiline: true }, { key: "userStory", label: "User Story", multiline: true }, { key: "acceptanceCriteria", label: "Acceptance Criteria", multiline: true }, { key: "businessImpact", label: "Business Impact", multiline: true }, { key: "priority", label: "Priority (MoSCoW)", options: priorityOptions }, { key: "complexity", label: "Complexity", options: ["Low", "Medium", "High"] }, { key: "implementationStatus", label: "Status", options: featureStatus }];
  const rtmFields: Field[] = [{ key: "description", label: "Req Description", multiline: true }, { key: "technicalFeature", label: "Technical Feature" }, { key: "testCaseId", label: "Test Case ID" }, { key: "testCase", label: "Test Case Detail", multiline: true }, { key: "mappingStatus", label: "Mapping Status", options: ["Unmapped", "Partial", "Mapped"] }, { key: "implementationStatus", label: "Implementation Status", options: featureStatus }];
  const dashboard = <section className="space-y-5" aria-label="Project dashboard">
    <div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 md:grid-cols-4"><Metric label="Product features" value={String(project.requirements.length)} /><Metric label="Open sprint tasks" value={String(project.sprintBacklog.filter((item) => item.status !== "Done").length)} /><Metric label="Mapped requirements" value={String(project.requirements.filter((item) => item.mappingStatus === "Mapped").length)} /><Metric label="Implemented" value={String(project.requirements.filter((item) => item.implementationStatus === "Implemented").length)} /></div>
    <section className="space-y-3"><SectionHeading title="Project timeline" description="Set phase dates and track deliverables across the project." />{project.phases.map((phase, index) => { const done = phase.deliverables.filter((item) => item.done).length; const progress = phase.deliverables.length ? Math.round(done * 100 / phase.deliverables.length) : 0; return <article key={phase.name} className="grid gap-4 border border-slate-200 bg-white p-4 lg:grid-cols-[220px_minmax(0,1fr)]"><div><h3 className="font-semibold text-[#003366]">{phase.name}</h3><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[11px] font-semibold text-slate-600">Start date<input type="date" aria-label={`${phase.name} start date`} className="mt-1 min-h-9 w-full border border-slate-300 bg-white px-2 text-xs" value={phase.startDate} onChange={(event) => updateProject((current) => ({ ...current, phases: current.phases.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item) }))} /></label><label className="text-[11px] font-semibold text-slate-600">End date<input type="date" aria-label={`${phase.name} end date`} className="mt-1 min-h-9 w-full border border-slate-300 bg-white px-2 text-xs" value={phase.targetDate} onChange={(event) => updateProject((current) => ({ ...current, phases: current.phases.map((item, i) => i === index ? { ...item, targetDate: event.target.value } : item) }))} /></label></div></div><div><div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-slate-700">{done} of {phase.deliverables.length} deliverables</span><span className="font-mono text-[#003366]">{progress}%</span></div><div className="h-1.5 bg-slate-100"><div className="h-full bg-[#C9A84C]" style={{ width: `${progress}%` }} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{phase.deliverables.map((deliverable, deliveryIndex) => <label key={deliverable.label} className="flex min-h-10 items-start gap-2 border border-slate-200 px-2.5 py-2 text-sm"><input type="checkbox" aria-label={`${phase.name}: ${deliverable.label}`} checked={deliverable.done} onChange={(event) => updateProject((current) => ({ ...current, phases: current.phases.map((item, i) => i === index ? { ...item, deliverables: item.deliverables.map((entry, j) => j === deliveryIndex ? { ...entry, done: event.target.checked } : entry) } : item) }))} className="mt-0.5 accent-[#003366]" /><span>{deliverable.label}</span></label>)}</div></div></article>; })}</section>
  </section>;
  const productRows = project.requirements.map(requirementRecord);
  const updateProduct = (id: string, key: string, value: string) => {
    const item = project.requirements.find((requirement) => requirement.id === id);
    if (!item) return;
    if (key === "feature") updateRequirement(id, { featureName: value });
    else if (key === "description") updateRequirement(id, { statement: value });
    else if (key === "priority") updateRequirement(id, { priority: value as BARequirement["priority"] });
    else if (key === "category") updateRequirement(id, { category: value as BARequirement["category"] });
    else if (key === "userStory") updateRequirement(id, { userStory: value });
    else if (key === "acceptanceCriteria") updateRequirement(id, { acceptanceCriteria: value });
    else if (key === "businessImpact") updateRequirement(id, { businessImpact: value });
    else if (key === "complexity") updateRequirement(id, { complexity: value });
    else if (key === "implementationStatus") updateRequirement(id, { implementationStatus: value });
  };
  const rtmRows: RecordRow[] = project.requirements.map((item) => ({ ...requirementRecord(item), description: item.statement, technicalFeature: item.technicalFeature, testCaseId: item.testCaseId, testCase: item.testCase, mappingStatus: item.mappingStatus, implementationStatus: item.implementationStatus }));
  const updateRtm = (id: string, key: string, value: string) => {
    if (key === "description") updateRequirement(id, { statement: value });
    else if (key === "technicalFeature") updateRequirement(id, { technicalFeature: value });
    else if (key === "testCaseId") updateRequirement(id, { testCaseId: value });
    else if (key === "testCase") updateRequirement(id, { testCase: value });
    else if (key === "mappingStatus") updateRequirement(id, { mappingStatus: value });
    else if (key === "implementationStatus") updateRequirement(id, { implementationStatus: value });
  };
  const product = <section className="space-y-4"><SectionHeading title="Product Backlog" description="Shape business needs into prioritized product features." actions={<div className="flex flex-wrap gap-2"><ViewToggle label="Product Backlog" value={productView} onChange={setProductView} /><button type="button" onClick={addRequirement} className="inline-flex min-h-9 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#174778]"><Plus size={14} />Add feature</button></div>} />{project.requirements.length === 0 ? <EmptyState label="Product backlog" onAdd={addRequirement} /> : <EditableCollectionBody title="Product Backlog" idLabel="Feature ID" fields={productFields} rows={productRows} view={productView} onUpdate={updateProduct} onRemove={(id, trigger) => onRequestDeleteRequirement(id, trigger)} />}</section>;
  const rtm = <section className="space-y-4"><SectionHeading title="Requirement Traceability Matrix" description="Connect each requirement to a technical feature, test case, and implementation state." actions={<><ViewToggle label="RTM" value={rtmView} onChange={setRtmView} /><button type="button" onClick={addRequirement} className="inline-flex min-h-9 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#174778]"><Plus size={14} />Add requirement</button></>} />{project.requirements.length === 0 ? <EmptyState label="RTM" onAdd={addRequirement} /> : <EditableCollectionBody title="RTM" idLabel="Req ID" fields={rtmFields} rows={rtmRows} view={rtmView} onUpdate={updateRtm} onRemove={(id, trigger) => onRequestDeleteRequirement(id, trigger)} />}</section>;
  const content: Record<TabId, ReactNode> = {
    dashboard,
    "product-backlog": product,
    "sprint-backlog": <EditableCollection title="Sprint Backlog" description="Plan weekly execution, effort, and blockers." idLabel="Task ID" fields={sprintFields} rows={project.sprintBacklog} onAdd={() => addRow("sprintBacklog", sprintFields)} onUpdate={(id, field, value) => updateRows("sprintBacklog", id, field, value)} onRemove={(id) => removeRow("sprintBacklog", id)} />,
    rtm,
    "system-design": <EditableCollection title="System Design and Architecture" description="Record the components, integrations, and dependencies that make up the solution." idLabel="Component ID" fields={designFields} rows={project.systemDesign} onAdd={() => addRow("systemDesign", designFields)} onUpdate={(id, field, value) => updateRows("systemDesign", id, field, value)} onRemove={(id) => removeRow("systemDesign", id)} />,
    "end-to-end": <EditableCollection title="End to End Process" description="Map the user journey through system actions, outputs, and tools." idLabel="Process ID" fields={processFields} rows={project.endToEndProcess} onAdd={() => addRow("endToEndProcess", processFields)} onUpdate={(id, field, value) => updateRows("endToEndProcess", id, field, value)} onRemove={(id) => removeRow("endToEndProcess", id)} />,
    deployment: <EditableCollection title="Deployment" description="Keep release steps, owners, environments, and rollback actions together." idLabel="Deployment ID" fields={deploymentFields} rows={project.deployments} onAdd={() => addRow("deployments", deploymentFields)} onUpdate={(id, field, value) => updateRows("deployments", id, field, value)} onRemove={(id) => removeRow("deployments", id)} />,
    reports,
  };
  return <div className="space-y-4"><nav className="ba-no-print flex overflow-x-auto border-b border-[#31577D]" aria-label="IT Projects sections" role="tablist">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-10 shrink-0 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${tab === item.id ? "border-[#C9A84C] bg-[#FFFCFB] text-[#003366]" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-[#003366]"}`}>{item.label}</button>)}</nav><div role="tabpanel" aria-label={tabs.find((item) => item.id === tab)?.label}>{content[tab]}</div></div>;
}

function EmptyState({ label, onAdd }: { label: string; onAdd: () => void }) {
  return <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><p className="text-sm font-semibold text-[#003366]">No {label.toLowerCase()} items yet</p><button type="button" onClick={onAdd} className="mt-3 inline-flex min-h-9 items-center gap-2 border border-[#003366] px-3 text-xs font-semibold text-[#003366] hover:bg-slate-50"><Plus size={14} />Add item</button></div>;
}

function EditableCollectionBody({ title, idLabel, fields, rows, view, onUpdate, onRemove }: { title: string; idLabel: string; fields: Field[]; rows: RecordRow[]; view: "list" | "cards"; onUpdate: (id: string, field: string, value: string) => void; onRemove: (id: string, trigger: HTMLButtonElement) => void }) {
  const actualView = view;
  const inputClass = "min-h-9 w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-[#C9A33B] focus:outline-none focus:ring-1 focus:ring-[#C9A33B]";
  return <div>{actualView === "list" ? <div className="overflow-x-auto border border-slate-200 bg-white"><table className="w-full min-w-[920px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><tr><th className="w-28 border border-slate-200 px-3 py-2">{idLabel}</th>{fields.map((field) => <th key={field.key} className="border border-slate-200 px-3 py-2">{field.label}</th>)}<th className="w-12 border border-slate-200 px-2 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th scope="row" className="border border-slate-200 px-3 py-2 font-mono text-[#003366]">{row.id}</th>{fields.map((field) => <td key={field.key} className="border border-slate-200 px-2 py-1">{field.options ? <select aria-label={`${row.id} ${field.label}`} className={inputClass} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)}><option value="">Select</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={`${row.id} ${field.label}`} className="min-h-9 w-full min-w-32 border border-transparent bg-transparent px-2 text-sm hover:border-slate-200 focus:border-[#C9A33B] focus:bg-white focus:outline-none" value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)} />}</td>)}<td className="border border-slate-200 px-1"><button type="button" aria-label={`Remove ${row.id}`} onClick={(event) => onRemove(row.id, event.currentTarget)} className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:text-[#9B3030]"><Trash2 size={14} /></button></td></tr>)}</tbody></table></div> : <div className="grid gap-3 md:grid-cols-2">{rows.map((row) => <article key={row.id} className="border border-slate-200 bg-white p-4"><header className="mb-3 flex items-center justify-between"><h3 className="font-mono text-sm font-semibold text-[#003366]">{row.id}</h3><button type="button" aria-label={`Remove ${row.id}`} onClick={(event) => onRemove(row.id, event.currentTarget)} className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:text-[#9B3030]"><Trash2 size={14} /></button></header><div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className="text-[11px] font-semibold text-slate-600">{field.label}{field.options ? <select aria-label={`${row.id} ${field.label}`} className={`${inputClass} mt-1`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)}><option value="">Select</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input aria-label={`${row.id} ${field.label}`} className={`${inputClass} mt-1`} value={row[field.key] || ""} onChange={(event) => onUpdate(row.id, field.key, event.target.value)} />}</label>)}</div></article>)}</div>}<div className="sr-only" aria-live="polite">{title} shown in {actualView} view</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="bg-[#FFFCFB] px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-serif text-2xl font-bold text-[#003366]">{value}</p></article>;
}
