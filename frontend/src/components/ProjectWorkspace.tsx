"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DeltaReview, DeltaReviewList } from "@/components/DeltaReview";
import type { SavedDeltaReview } from "@/lib/delta/localStore";
import { calculateSiteAmount, sitesForSubproject } from "@/lib/projectSites";
import { getBrowserPageCache, readBrowserPageCache, refreshBrowserPageQuery, useBrowserPageQuery, writeBrowserPageCache } from "@/lib/browserPageCache";
import { requestCentralClickUpSync, trackClickUpLiveRefresh } from "@/lib/clickupSyncClient";
import { ClickUpLoadingPanel } from "@/components/ClickUpLoadingProvider";
import {
  ArrowLeft,
  ArrowUpRight,
  Activity,
  CalendarDays,
  ChevronDown,
  Download,
  FolderKanban,
  LoaderCircle,
  MapPin,
  RefreshCw,
  X,
} from "lucide-react";

const PROJECT_URL = "https://app.clickup.com/9014981136/v/o/f/901414174663";
const EmbeddedAtlasWorkspace = dynamic(() => import("@/components/EmbeddedAtlasWorkspace"), { ssr: false, loading: () => <section role="status" className="flex min-h-[560px] items-center justify-center border border-slate-200 bg-[#0a1628] text-xs text-white"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Loading map editor</section> });
type View = "overview" | "calendar" | "activity" | "map";

interface ProjectList {
  id: string;
  name: string;
  taskCount: number | null;
  url?: string | null;
  statuses?: string[];
}

function rememberProjectSyncListIds(lists: ProjectList[]) {
  if (typeof window === "undefined") return;
  try {
    const current: unknown = JSON.parse(localStorage.getItem("project_echo_project_list_ids") || "[]");
    const existing = Array.isArray(current) ? current.map(String) : [];
    const ids = lists.map((list) => String(list.id)).filter((id) => /^\d{4,24}$/.test(id));
    localStorage.setItem("project_echo_project_list_ids", JSON.stringify([...new Set([...existing, ...ids])].slice(-50)));
  } catch { /* The sync route can continue with the currently selected lists. */ }
}

interface ProjectTask {
  id: string;
  name: string;
  url: string | null;
  parentId: string | null;
  listId: string;
  status: string;
  statusType: string;
  statusColor?: string | null;
  description?: string;
  actionPlan?: string;
  actionPlanFieldAvailable?: boolean;
  dateCreated?: string | null;
  dateUpdated?: string | null;
  startDate: string | null;
  dueDate: string | null;
  assignees: Array<{ id: string; name: string; initials: string; profilePicture?: string | null }>;
}

interface ProjectMember {
  id: string;
  name: string;
  initials: string;
  profilePicture?: string | null;
}

interface ProjectData {
  folder: { id: string; name: string; url: string; spaceName: string };
  lists: ProjectList[];
  tasks: ProjectTask[];
  loadedTaskListIds?: string[];
  members: ProjectMember[];
  defaultAssignees: Record<string, string[]>;
  currentUserId?: string;
  isProjectAdmin?: boolean;
  accessByListId?: Record<string, { leadId: string; isAdmin: boolean; canEdit: boolean }>;
}

interface ProjectCardData {
  id: string;
  name: string;
  url: string;
  listCount: number;
  spaceName: string;
}

const PROJECT_STATUS_DEFINITIONS = [
  { label: "To Do", aliases: [/^to do$/, /^open$/, /^not started$/], fallback: "to do" },
  { label: "On going", aliases: [/^ongoing$/, /^in progress$/, /^active$/], fallback: "ongoing" },
  { label: "Completed", aliases: [/^(completed|complete|done|closed)(\b|$)/, /^delayed completion$/], fallback: "completed on-time" },
  { label: "Delayed", aliases: [/^delayed$/], fallback: "delayed" },
];

function projectStatusOptions(available: string[]) {
  return PROJECT_STATUS_DEFINITIONS.map((definition) => ({
    label: definition.label,
    value: available.find((status) => definition.aliases.some((alias) => alias.test(status.trim().toLowerCase()))) || definition.fallback,
  }));
}

function projectStatusValue(status: string, options: Array<{ label: string; value: string }>) {
  const normalized = status.trim().toLowerCase();
  return options.find((option) => option.value.toLowerCase() === normalized)?.value
    || (PROJECT_STATUS_DEFINITIONS.findIndex((definition) => definition.aliases.some((alias) => alias.test(normalized))) >= 0
      ? options[PROJECT_STATUS_DEFINITIONS.findIndex((definition) => definition.aliases.some((alias) => alias.test(normalized)))].value
      : options[0]?.value || "to do");
}

function projectStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  return PROJECT_STATUS_DEFINITIONS.find((definition) => definition.aliases.some((alias) => alias.test(normalized)))?.label || "To Do";
}

function projectStatusColor(label: string) {
  if (label === "On going") return "#C9A84C";
  if (label === "Completed") return "#22A06B";
  if (label === "Delayed") return "#C2413B";
  return "#9CA3AF";
}

function ProjectStatusSelect({ value, options, onChange, ariaLabel = "Task status", className = "mt-1", disabled = false }: { value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void; ariaLabel?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return <div ref={rootRef} className={`relative ${className}`}>
    <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} className="flex h-10 w-full items-center justify-between border border-slate-300 bg-white px-3 text-sm text-[#003366] focus:border-[#003366] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600">
      <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: projectStatusColor(selected?.label || "To Do") }} />{selected?.label || "Choose status"}</span><ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div role="listbox" aria-label="Task status options" className="absolute z-20 mt-1 w-full border border-slate-200 bg-white p-1 shadow-lg">
      {options.map((option) => {
        const color = projectStatusColor(option.label);
        const active = option.value === value;
        return <button key={option.value} type="button" role="option" aria-selected={active} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex min-h-9 w-full items-center gap-2 px-2 text-left text-sm transition-colors ${active ? "font-semibold" : "hover:bg-slate-50"}`} style={{ color, backgroundColor: active ? `${color}14` : undefined }}>
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{option.label}{active && <span className="ml-auto text-[10px]">Selected</span>}
        </button>;
      })}
    </div>}
  </div>;
}

function isComplete(task: ProjectTask) {
  return task.statusType.toLowerCase() === "closed" || /^(complete|completed|closed|done)$/.test(task.status.toLowerCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not scheduled" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function owners(task: ProjectTask) {
  return task.assignees.map((assignee) => assignee.name).join(", ") || "Unassigned";
}

function statusInlineStyle(task: ProjectTask): CSSProperties | undefined {
  const color = projectStatusColor(projectStatusLabel(task.status));
  return { borderColor: `${color}66`, backgroundColor: `${color}1A`, color };
}

interface ProjectActivityEvent {
  id: string;
  listId: string;
  listName: string;
  taskId: string | null;
  taskName: string | null;
  eventType: string;
  summary: string;
  actorName: string;
  taskUrl: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

function activityTypeLabel(type: string) {
  const labels: Record<string, string> = {
    "task-created": "Task created",
    "task-status-changed": "Status changed",
    "task-assignees-changed": "Assignees changed",
    "task-remarks-updated": "Remarks updated",
    "task-date-moved": "Task rescheduled",
    "task-file-link-added": "File or link added",
    "action-plan-updated": "Action plan updated",
    "subproject-lead-changed": "Lead assignee changed",
  };
  return labels[type] || type.replace(/-/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function ProjectActivityFeed({ folderId, lists, fixedListId, userId }: { folderId: string; lists: ProjectList[]; fixedListId?: string; userId?: string }) {
  const [filter, setFilter] = useState(fixedListId || "all");
  const [dateFilter, setDateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const selectedListId = fixedListId || (filter !== "all" ? filter : "");
  const queryKey = `project-activity:${folderId}:${selectedListId || "all"}`;
  const load = useCallback(async () => {
    const params = new URLSearchParams({ folderId });
    if (selectedListId) params.set("listId", selectedListId);
    const response = await fetch(`/api/projects/activity?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || "Project activity could not be loaded."), { status: response.status });
    return Array.isArray(payload.activities) ? payload.activities as ProjectActivityEvent[] : [];
  }, [folderId, selectedListId]);
  const { data: cachedActivities, loading, error, refresh } = useBrowserPageQuery<ProjectActivityEvent[]>(userId, queryKey, load);
  const activities = cachedActivities || [];
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const refreshAfterSync = () => { void refresh(); };
    const timer = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync); };
  }, [refresh]);

  const activityTypes = useMemo(() => Array.from(new Set(activities.map((event) => event.eventType))).sort(), [activities]);
  const filteredActivities = useMemo(() => activities.filter((event) => {
    if (typeFilter !== "all" && event.eventType !== typeFilter) return false;
    if (dateFilter && dateKey(new Date(event.createdAt)) !== dateFilter) return false;
    return true;
  }), [activities, dateFilter, typeFilter]);

  return <section aria-label="Project activity" className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-[#003366]"><Activity className="h-4 w-4" />Activity</h2><p className="mt-0.5 text-[10px] text-slate-500">Recent changes across project workspaces</p></div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!fixedListId && <select aria-label="Filter activity by subproject" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 w-[190px] max-w-full border border-slate-200 bg-white px-2 text-[11px] text-[#003366]"><option value="all">All subprojects</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>}
        <label className="relative inline-flex h-9 min-w-[190px] cursor-pointer items-center justify-between gap-3 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] hover:border-[#003366] focus-within:outline focus-within:outline-2 focus-within:outline-[#003366]">
          <span>{dateFilter ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${dateFilter}T12:00:00`)) : "All dates"}</span>
          <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" />
          <input aria-label="Filter activity by date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        <select aria-label="Filter activity by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-8 w-[155px] max-w-full border border-slate-200 bg-white px-2 text-[11px] text-[#003366]"><option value="all">All activity types</option>{activityTypes.map((type) => <option key={type} value={type}>{activityTypeLabel(type)}</option>)}</select>
      </div>
    </header>
    {error && activities.length === 0 ? <div role="alert" className="m-4 border border-amber-300 bg-[#FBF7E9] px-3 py-3 text-xs text-[#003366]">{error}<p className="mt-1 text-[10px]">Set up the activity table using <code>supabase/project_activity.sql</code>.</p></div>
      : loading && activities.length === 0 ? <div role="status" className="space-y-2 p-4">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse border border-slate-100 bg-slate-50" />)}</div>
        : <>{error && activities.length > 0 && <p role="status" className="border-b border-amber-200 bg-[#FBF7E9] px-4 py-2 text-[10px] text-[#854D0E]">Showing saved activity; the latest refresh failed.</p>}{filteredActivities.length ? <ol className="divide-y divide-slate-100">{filteredActivities.map((event) => <li key={event.id} className="flex gap-3 px-4 py-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF3F8] text-[#31577D]"><Activity aria-hidden="true" className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-1.5 text-xs"><span className="font-semibold text-[#003366]">{event.actorName}</span><span className="text-slate-600">{event.summary}</span>{event.taskName && <span className="font-medium text-slate-700">· {event.taskName}</span>}</div><div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500"><span>{event.listName}</span><span aria-hidden="true">·</span><time dateTime={event.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time><span aria-hidden="true">·</span><span>{activityTypeLabel(event.eventType)}</span>{event.taskUrl && <a href={event.taskUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#31577D] underline">Open task</a>}</div>{typeof event.details.remarks === "string" && event.details.remarks && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{event.details.remarks}</p>}{typeof event.details.current === "string" && event.details.current && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{event.details.current}</p>}{Array.isArray(event.details.links) && (event.details.links as string[]).map((href) => <a key={href} href={href} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[10px] text-[#31577D] underline">{href}</a>)}</div></li>)}</ol> : <div className="px-4 py-10 text-center"><Activity aria-hidden="true" className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-xs font-semibold text-[#003366]">{activities.length ? "No activity matches these filters" : "No activity yet"}</p><p className="mt-1 text-[10px] text-slate-500">{activities.length ? "Choose another date or activity type." : "Task and action-plan changes will appear here."}</p></div>}</>}
  </section>;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clickUpDateKey(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function routeSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function routeSegment(name: string, id: string) {
  const slug = routeSlug(name);
  return `${slug}-${id}`;
}

function routeId(segment: string) {
  return segment.match(/-(\d+)$/)?.[1] || null;
}

const projectClientCache = new Map<string, { data: ProjectData; updatedAt: number }>();
const galleryClientCache = new Map<string, { data: ProjectCardData[]; updatedAt: number }>();
const projectCacheId = (ownerId: string | undefined, folderId: string) => `${ownerId || "anonymous"}:${folderId}`;
const galleryCacheId = (ownerId: string | undefined) => `${ownerId || "anonymous"}:projects`;

function matchRouteSegment<T extends { name: string; id: string }>(items: T[], segment: string) {
  return items.find((item) => segment === routeSlug(item.name) || segment === `${routeSlug(item.name)}-${item.id}`);
}

function ProjectPageHeader({ eyebrow, title, subtitle, onBack, actions }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return <header className="flex min-h-[58px] flex-col justify-between gap-2 border-b border-[#003366]/15 pb-2 sm:flex-row sm:items-center">
    <div className="flex min-w-0 items-center gap-2">
      {onBack
        ? <button type="button" onClick={onBack} aria-label="Go back" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 text-[#003366] hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
        : <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#C9A84C]/60 bg-[#FBF7E9] text-[#003366]"><FolderKanban className="h-4 w-4" /></span>}
      <div className="min-w-0 border-l-2 border-[#C9A84C] py-0.5 pl-2.5">
        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#31577D]">{eyebrow}</p>
        <h1 className="truncate text-xl font-semibold tracking-tight text-[#003366]">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-600">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

function ProjectActionButton({ children, onClick, disabled = false, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">{children}</button>;
}

function ClickUpLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="inline-flex h-8 min-h-8 w-8 items-center justify-center border border-slate-300 bg-white p-0 text-[#003366] transition-colors hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]"><ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a>;
}

type CalendarScale = "Gantt" | "Day" | "Week" | "Month";

function CalendarView({ folderId, tasks, lists, members, defaultAssignees, onTaskChange, loadingTasks = false, canEdit }: { folderId: string; tasks: ProjectTask[]; lists: ProjectList[]; members: ProjectMember[]; defaultAssignees: Record<string, string[]>; onTaskChange: (task: ProjectTask) => void; loadingTasks?: boolean; canEdit: boolean }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [scale, setScale] = useState<CalendarScale>(lists.length > 1 ? "Gantt" : "Month");
  const [listFilter, setListFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<{ date: string; task?: ProjectTask } | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskListId, setTaskListId] = useState(lists[0]?.id || "");
  const [taskStatus, setTaskStatus] = useState("to do");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createStatusOptions = projectStatusOptions(lists.find((list) => list.id === taskListId)?.statuses || []);
  const editStatusOptions = projectStatusOptions(lists.find((list) => list.id === modal?.task?.listId)?.statuses || tasks.filter((task) => task.listId === modal?.task?.listId).map((task) => task.status));
  const editMembers = modal?.task
    ? [...members, ...modal.task.assignees.filter((assignee) => !members.some((member) => member.id === assignee.id))]
    : members;
  const filterStatusOptions = projectStatusOptions(tasks.map((task) => task.status));
  const filterStatusSelectOptions = [{ label: "All statuses", value: "all" }, ...filterStatusOptions];
  useEffect(() => {
    if (!modal) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [modal]);
  const start = useMemo(() => {
    const date = new Date(anchor); date.setHours(0, 0, 0, 0);
    if (scale === "Month") return new Date(date.getFullYear(), date.getMonth(), 1 - new Date(date.getFullYear(), date.getMonth(), 1).getDay());
    if (scale === "Gantt") date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    else if (scale === "Week") date.setDate(date.getDate() - date.getDay());
    return date;
  }, [anchor, scale]);
  const cellCount = scale === "Month" ? Math.ceil((new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() + new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay()) / 7) * 7 : scale === "Gantt" ? 14 : scale === "Week" ? 7 : 1;
  const days = Array.from({ length: cellCount }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const today = dateKey(new Date());
  const visibleTasks = tasks.filter((task) => !isComplete(task) && (listFilter === "all" || task.listId === listFilter) && (assigneeFilter === "all" || task.assignees.some((person) => person.id === assigneeFilter)) && (statusFilter === "all" || projectStatusValue(task.status, filterStatusOptions) === statusFilter));
  const calendarLists = [...lists].sort((left, right) => {
    const leftLead = members.find((member) => (defaultAssignees[left.id] || []).includes(member.id))?.name || "Unassigned";
    const rightLead = members.find((member) => (defaultAssignees[right.id] || []).includes(member.id))?.name || "Unassigned";
    return leftLead.localeCompare(rightLead) || left.name.localeCompare(right.name);
  });
  const filteredCalendarLists = calendarLists.filter((list) => listFilter === "all" || list.id === listFilter);
  const calendarGroups = Array.from(new Set(filteredCalendarLists.map((list) => defaultAssignees[list.id]?.[0] || "unassigned"))).map((assigneeId) => ({
    assigneeId,
    lead: members.find((member) => member.id === assigneeId),
    lists: filteredCalendarLists.filter((list) => (defaultAssignees[list.id]?.[0] || "unassigned") === assigneeId),
  }));
  const taskMap = new Map<string, ProjectTask[]>();
  visibleTasks.forEach((task) => { const key = clickUpDateKey(task.dueDate || task.startDate); if (key) taskMap.set(key, [...(taskMap.get(key) || []), task]); });
  const label = scale === "Month" ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(anchor) : days.length === 1 ? new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(days[0]) : `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(days[0])} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(days[days.length - 1])}`;
  const openCreate = (date: string, preferredListId?: string) => { if (!canEdit) return; const listId = preferredListId || (listFilter !== "all" ? listFilter : lists[0]?.id || ""); setTaskName(""); setTaskDescription(""); setTaskStatus(projectStatusOptions(lists.find((list) => list.id === listId)?.statuses || [])[0].value); setTaskPriority("normal"); setTaskListId(listId); setTaskAssignees(defaultAssignees[listId] || []); setError(""); setModal({ date }); };
  const openEditDate = (task: ProjectTask) => { const options = projectStatusOptions(lists.find((list) => list.id === task.listId)?.statuses || tasks.filter((item) => item.listId === task.listId).map((item) => item.status)); setError(""); setEditStatus(projectStatusValue(task.status, options)); setEditRemarks(task.description || ""); setEditAssignees(task.assignees.map((assignee) => assignee.id)); setModal({ date: clickUpDateKey(task.dueDate || task.startDate) || today, task }); };
  const submit = async () => {
    if (!canEdit) return;
    setBusy(true); setError("");
    try {
      const currentList = lists.find((list) => list.id === (modal?.task?.listId || taskListId));
      const result = await fetch(`/api/tasks?action=${modal?.task ? "project-task-update" : "project-task-create"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(modal?.task ? { folderId, listId: modal.task.listId, listName: currentList?.name, taskId: modal.task.id, taskName: modal.task.name, previous: { status: modal.task.status, description: modal.task.description || "", dueDate: modal.task.dueDate, assignees: modal.task.assignees.map((assignee) => assignee.id) }, dueDate: modal.date, status: editStatus, description: editRemarks, assignees: editAssignees } : { folderId, listId: taskListId, listName: currentList?.name, name: taskName, description: taskDescription, status: taskStatus, priority: taskPriority, assignees: taskAssignees, dueDate: modal?.date }) });
      const payload = await result.json(); if (!result.ok) throw new Error(payload.error || "Calendar change failed.");
      if (modal?.task) {
        const savedStatus = payload.task?.status as { color?: string; type?: string } | undefined;
        onTaskChange({ ...modal.task, dueDate: new Date(`${modal.date}T00:00:00`).toISOString(), status: editStatus, statusType: savedStatus?.type || (/^(complete|completed|closed|done)$/i.test(editStatus) ? "closed" : modal.task.statusType), statusColor: savedStatus?.color || modal.task.statusColor, description: editRemarks, assignees: editMembers.filter((member) => editAssignees.includes(member.id)) });
      } else if (payload.task) {
        const saved = payload.task as Record<string, unknown>;
        const savedStatus = saved.status as { status?: string; type?: string; color?: string } | null;
        const savedAssignees = Array.isArray(saved.assignees) ? saved.assignees as Array<{ id: string | number }> : [];
        onTaskChange({ id: String(saved.id), name: String(saved.name || taskName), url: typeof saved.url === "string" ? saved.url : null, parentId: null, listId: taskListId, status: savedStatus?.status || taskStatus, statusType: savedStatus?.type || "", statusColor: savedStatus?.color || null, startDate: null, dueDate: new Date(`${modal!.date}T00:00:00`).toISOString(), assignees: members.filter((member) => savedAssignees.some((assignee) => String(assignee.id) === member.id)) });
      }
      setModal(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Calendar change failed."); }
    finally { setBusy(false); }
  };
  const changeDate = async (task: ProjectTask, date: string) => {
    if (!canEdit) return;
    const currentList = lists.find((list) => list.id === task.listId);
    const response = await fetch("/api/tasks?action=project-task-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId, listId: task.listId, listName: currentList?.name, taskId: task.id, taskName: task.name, previous: { status: task.status, description: task.description || "", dueDate: task.dueDate }, dueDate: date }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to reschedule task."); onTaskChange({ ...task, dueDate: new Date(`${date}T00:00:00`).toISOString() });
  };

  return <section className="border border-slate-200 bg-white" aria-label="Project calendar">
    {loadingTasks && <div role="status" className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#003366]" />Loading calendar tasks</div>}
    <header className="border-b border-slate-200 px-4 py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] lg:items-center">
        <div><h2 className="text-sm font-semibold text-[#003366]">{scale === "Gantt" ? "Portfolio Gantt" : "Team schedule"}</h2><p className="mt-1 text-xs text-slate-500">{scale === "Gantt" ? "Compare subproject tasks, dates, and owners side by side." : canEdit ? "Click a date to create a task. Drag a task to reschedule it." : "Tasks arranged by due date."}</p></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select aria-label="Filter by subproject" value={listFilter} onChange={(event) => setListFilter(event.target.value)} className="h-10 w-full min-w-0 border border-slate-200 bg-white px-3 text-xs text-[#003366]"><option value="all">All subprojects</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
          <select aria-label="Filter by assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="h-10 w-full min-w-0 border border-slate-200 bg-white px-3 text-xs text-[#003366]"><option value="all">All assignees</option>{Array.from(new Map(tasks.flatMap((task) => task.assignees).map((person) => [person.id, person])).values()).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full min-w-0 border border-slate-200 bg-white px-3 text-xs text-[#003366]">{filterStatusSelectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>
      </div>
    </header>
    <div className="grid items-center gap-3 border-b border-slate-100 px-4 py-3 lg:grid-cols-[auto_1fr_auto]">
      <div role="tablist" aria-label="Calendar view" className="inline-flex w-fit flex-wrap border border-slate-200 bg-slate-50 p-0.5">{(["Gantt", "Day", "Week", "Month"] as const).map((option) => <button key={option} type="button" role="tab" aria-selected={scale === option} onClick={() => setScale(option)} className={`min-h-8 px-2.5 text-[11px] font-semibold ${scale === option ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-[#003366]"}`}>{option}</button>)}</div>
      <strong className="text-sm text-[#003366] lg:text-center">{label}</strong>
      <div className="flex flex-wrap items-center gap-1 lg:justify-end"><ProjectActionButton label="Previous date range" onClick={() => setAnchor((date) => { const next = new Date(date); if (scale === "Month") { next.setDate(1); next.setMonth(next.getMonth() - 1); } else next.setDate(next.getDate() - (scale === "Gantt" ? 14 : scale === "Day" ? 1 : 7)); return next; })}>&#8249;</ProjectActionButton><ProjectActionButton label="Go to today" onClick={() => setAnchor(new Date())}>Today</ProjectActionButton><ProjectActionButton label="Next date range" onClick={() => setAnchor((date) => { const next = new Date(date); if (scale === "Month") { next.setDate(1); next.setMonth(next.getMonth() + 1); } else next.setDate(next.getDate() + (scale === "Gantt" ? 14 : scale === "Day" ? 1 : 7)); return next; })}>&#8250;</ProjectActionButton><label className="relative inline-flex h-9 min-w-[155px] cursor-pointer items-center justify-between gap-3 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] hover:border-[#003366] focus-within:outline focus-within:outline-2 focus-within:outline-[#003366]"><span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(anchor)}</span><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0"/><input aria-label="Choose calendar date" type="date" value={dateKey(anchor)} onChange={(event) => { if (event.target.value) setAnchor(new Date(`${event.target.value}T12:00:00`)); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label></div>
    </div>
    {scale === "Gantt" ? <div className="calendar-timeline-scroll overflow-x-auto"><div role="grid" aria-label={`Portfolio timeline, ${label}`} style={{ minWidth: `${300 + days.length * 78}px` }}><div role="row" className="grid border-b border-slate-200 bg-[#F7FAFC]" style={{ gridTemplateColumns: `300px repeat(${days.length}, minmax(78px, 1fr))` }}><div role="columnheader" className="sticky left-0 z-20 flex items-center border-r border-slate-200 bg-[#F7FAFC] px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Assignee / Subproject</div>{days.map((date) => { const key = dateKey(date); return <div key={key} role="columnheader" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const task = tasks.find((item) => item.id === event.dataTransfer.getData("text/plain")); if (task) void changeDate(task, key).catch((caught) => setError(caught.message)); }} className={`border-r border-slate-200 px-1 py-2 text-center ${key === today ? "bg-[#EAF1F7]" : ""}`}><span className="block text-[9px] uppercase text-slate-500">{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span><span className={`mx-auto mt-0.5 inline-flex h-6 min-w-6 items-center justify-center text-[11px] ${key === today ? "bg-[#003366] font-semibold text-white" : "font-medium text-[#31577D]"}`}>{date.getDate()}</span></div>; })}</div>{calendarGroups.map((group) => <div key={group.assigneeId}><div role="row" className="grid border-b border-slate-200 bg-[#F2F6FA]" style={{ gridTemplateColumns: `300px repeat(${days.length}, minmax(78px, 1fr))` }}><div role="rowheader" className="flex min-w-0 items-center gap-2.5 px-3 py-2.5" style={{ gridColumn: "1 / -1" }}><MemberAvatars members={group.lead ? [group.lead] : []} emptyLabel="Unassigned"/><span className="truncate text-sm font-semibold text-[#003366]">{group.lead?.name || "Unassigned"}</span><span className="text-[10px] text-slate-500">{group.lists.length} {group.lists.length === 1 ? "subproject" : "subprojects"}</span></div></div>{group.lists.map((list) => { const laneTasks = visibleTasks.filter((task) => task.listId === list.id); const scheduled = laneTasks.filter((task) => clickUpDateKey(task.startDate || task.dueDate)); const unscheduled = laneTasks.filter((task) => !clickUpDateKey(task.startDate || task.dueDate)); return <div key={list.id} role="row" className="grid min-h-[72px] border-b border-slate-100" style={{ gridTemplateColumns: `300px repeat(${days.length}, minmax(78px, 1fr))` }}><div role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center justify-between gap-2 border-r border-slate-200 bg-white px-3 py-2"><span className="min-w-0 flex-1 whitespace-normal break-words text-xs font-semibold text-[#003366]">{list.name}</span><span className="shrink-0 text-[10px] text-slate-500">{laneTasks.length} tasks</span></div><div className="relative min-h-[72px]" style={{ gridColumn: `span ${days.length} / span ${days.length}` }}><div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>{days.map((date) => <span key={dateKey(date)} className={`border-r border-slate-100 ${dateKey(date) === today ? "bg-[#F7FAFC]" : ""}`} />)}</div><div className="relative space-y-1 px-1 py-1" onClick={(event) => { if (event.target === event.currentTarget && canEdit) { const rect = event.currentTarget.getBoundingClientRect(); const index = Math.min(days.length - 1, Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / days.length)))); openCreate(dateKey(days[index]), list.id); } }}>{scheduled.map((task) => { const rawStart = clickUpDateKey(task.startDate || task.dueDate)!; const rawEnd = clickUpDateKey(task.dueDate || task.startDate)!; const rangeStart = dateKey(days[0]); const rangeEnd = dateKey(days[days.length - 1]); if (rawEnd < rangeStart || rawStart > rangeEnd) return null; const visibleStart = rawStart < rangeStart ? rangeStart : rawStart; const visibleEnd = rawEnd > rangeEnd ? rangeEnd : rawEnd; const offset = Math.max(0, Math.round((new Date(`${visibleStart}T00:00:00`).getTime() - new Date(`${rangeStart}T00:00:00`).getTime()) / 86400000)); const span = Math.max(1, Math.round((new Date(`${visibleEnd}T00:00:00`).getTime() - new Date(`${visibleStart}T00:00:00`).getTime()) / 86400000) + 1); return <button key={task.id} type="button" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; }} onClick={() => openEditDate(task)} title={`${task.name} · ${owners(task)} · ${task.status}`} style={{ ...statusInlineStyle(task), marginLeft: `${offset / days.length * 100}%`, width: `calc(${span / days.length * 100}% - 4px)`, minWidth: "72px" }} className={`relative z-[1] flex min-h-8 items-center gap-1.5 overflow-hidden border-l-2 px-1.5 py-1 text-left text-[10px] ${isComplete(task) ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-[#C9A84C] bg-[#FBF7E9] text-[#003366]"}`}><span title={task.assignees[0]?.name || "Unassigned"} className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-[#E8EEF4] text-[7px] font-semibold text-[#003366]">{task.assignees[0]?.profilePicture ? <img src={task.assignees[0].profilePicture} alt="" className="h-full w-full object-cover" /> : task.assignees[0]?.initials || "—"}</span><span className="min-w-0 truncate font-semibold">{task.name}</span>{task.assignees.length > 1 && <span className="shrink-0 text-[9px]">+{task.assignees.length - 1}</span>}</button>; })}</div></div>{unscheduled.length > 0 && <details className="grid border-b border-slate-100 bg-slate-50/70" style={{ gridTemplateColumns: `300px repeat(${days.length}, minmax(78px, 1fr))` }}><summary className="cursor-pointer border-t border-dashed border-slate-200 px-3 py-2 text-[10px] text-slate-500 hover:text-[#003366]" style={{ gridColumn: `2 / span ${days.length}` }}>{unscheduled.length} tasks without dates | show tasks</summary><div className="flex flex-wrap gap-1 border-t border-slate-100 px-2 py-2" style={{ gridColumn: `2 / span ${days.length}` }}>{unscheduled.map((task) => <button key={task.id} type="button" onClick={() => openEditDate(task)} className="inline-flex min-h-7 max-w-64 items-center gap-1.5 border border-slate-200 bg-white px-2 text-left text-[10px] text-[#31577D]" title={`${task.name} | ${owners(task)}`}><span title={task.assignees[0]?.name || "Unassigned"} className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E8EEF4] text-[7px] font-semibold">{task.assignees[0]?.profilePicture ? <img src={task.assignees[0].profilePicture} alt="" className="h-full w-full object-cover" /> : task.assignees[0]?.initials || "--"}</span><span className="truncate">{task.name}</span></button>)}</div></details>}</div>; })}</div>)}</div></div> : <div role="grid" aria-label={label} className={`grid ${scale === "Day" ? "grid-cols-1" : scale === "Month" || scale === "Week" ? "grid-cols-7" : "grid-cols-5"}`}>
      {scale !== "Day" && (scale === "Month" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : days.map((day) => new Intl.DateTimeFormat("en", { weekday: "short" }).format(day))).map((day, index) => <div key={`${day}-${index}`} className="border-b border-r border-slate-200 bg-[#F7FAFC] px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500">{day}</div>)}
      {days.map((date) => { const key = dateKey(date); const dayTasks = taskMap.get(key) || []; return <div key={key} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? `Create task on ${key}` : undefined} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCreate(key); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const task = tasks.find((item) => item.id === event.dataTransfer.getData("text/plain")); if (task) void changeDate(task, key).catch((caught) => setError(caught.message)); }} onClick={canEdit ? () => openCreate(key) : undefined} className={`group min-h-28 cursor-pointer border-b border-r border-slate-100 p-2 hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#003366] ${key.slice(0, 7) !== dateKey(anchor).slice(0, 7) && scale === "Month" ? "bg-slate-50" : "bg-white"} ${scale === "Day" ? "min-h-64" : ""}`}><div className="mb-1 flex items-center justify-between"><span className={`inline-flex h-7 min-w-7 items-center justify-center px-1 text-xs ${key === today ? "bg-[#003366] font-semibold text-white" : "text-slate-600"}`}>{scale === "Month" ? date.getDate() : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}</span></div><div className="space-y-1">{dayTasks.slice(0, scale === "Month" ? 4 : 12).map((task) => <button key={task.id} type="button" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; }} onClick={(event) => { event.stopPropagation(); openEditDate(task); }} title={`${task.name} · ${owners(task)} · ${task.status}`} style={statusInlineStyle(task)} className={`block w-full border-l-2 px-1 py-1 text-left text-[10px] leading-4 ${isComplete(task) ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-[#C9A84C] bg-[#FBF7E9] text-[#003366]"}`}><span className="block truncate font-semibold">{task.name}</span><span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-normal"><span className="flex shrink-0 items-center -space-x-1">{task.assignees.slice(0, 3).map((assignee) => <span key={assignee.id} title={assignee.name} className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-white bg-[#E8EEF4] text-[7px] font-semibold text-[#003366]">{assignee.profilePicture ? <img src={assignee.profilePicture} alt="" className="h-full w-full object-cover" /> : assignee.initials}</span>)}</span><span className="min-w-0 truncate">{owners(task)}</span></span></button>)}{dayTasks.length > (scale === "Month" ? 4 : 12) && <p className="px-1 text-[10px] text-slate-500">+{dayTasks.length - (scale === "Month" ? 4 : 12)} more</p>}</div></div>; })}
    </div>}
    {error && <p role="alert" className="border-t border-red-100 px-4 py-2 text-xs text-red-700">{error}</p>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}><div role="dialog" aria-modal="true" aria-labelledby="calendar-task-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><h3 id="calendar-task-title" className="font-semibold text-[#003366]">{modal.task ? (canEdit ? "Edit task" : "Task details") : "Create task"}</h3><p className="mt-1 text-xs text-slate-500">{modal.task ? "Change this task’s calendar date." : "Add a task to this date and choose where it belongs."}</p></div><button type="button" onClick={() => setModal(null)} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><X className="h-4 w-4"/></button></div>{modal.task ? <><div className="mb-3 border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subproject</p><p className="mt-0.5 text-sm font-medium text-[#003366]">{lists.find((list) => list.id === modal.task?.listId)?.name || "Unknown subproject"}</p></div><div className="mb-3"><span className="block text-xs font-semibold text-slate-600">Status</span><ProjectStatusSelect value={editStatus} options={editStatusOptions} onChange={setEditStatus} disabled={!canEdit} /></div><AssigneePicker label="Assignees" members={editMembers} value={editAssignees} onChange={setEditAssignees} disabled={!canEdit} teamLeadIds={defaultAssignees[modal.task.listId] || []} /><label className="mb-3 block text-xs font-semibold text-slate-600">Remarks<textarea value={editRemarks} onChange={(event) => setEditRemarks(event.target.value)} readOnly={!canEdit} maxLength={10000} rows={5} placeholder="Add progress notes or task remarks" className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm font-normal leading-5" /></label><div className="mb-3 flex items-center justify-between gap-3 border border-slate-200 bg-[#F7FAFC] p-3"><div><p className="text-xs font-semibold text-[#003366]">Files</p><p className="mt-1 text-[11px] text-slate-500">Open this task in ClickUp to attach files.</p></div>{modal.task.url && <a href={modal.task.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 shrink-0 items-center gap-2 border border-slate-300 bg-white px-3 text-[10px] font-semibold text-[#003366]">Upload in ClickUp <ArrowUpRight className="h-3 w-3" /></a>}</div></> : <><input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="Task name" className="mb-3 h-10 w-full border border-slate-300 px-3 text-sm"/><select value={taskListId} onChange={(event) => { const nextId = event.target.value; setTaskListId(nextId); setTaskStatus(projectStatusOptions(lists.find((list) => list.id === nextId)?.statuses || [])[0].value); setTaskAssignees(defaultAssignees[nextId] || []); }} className="mb-3 h-10 w-full border border-slate-300 bg-white px-3 text-sm" aria-label="Task list">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Description (optional)" rows={3} className="mb-3 w-full border border-slate-300 px-3 py-2 text-sm"/><div className="mb-3 grid grid-cols-2 gap-2"><ProjectStatusSelect value={taskStatus} options={createStatusOptions} onChange={setTaskStatus} className="!mt-0" /><select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className="h-10 border border-slate-300 bg-white px-2 text-sm" aria-label="Task priority">{["urgent", "high", "normal", "low"].map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)} priority</option>)}</select></div><AssigneePicker label="Assignees" members={members} value={taskAssignees} onChange={setTaskAssignees} teamLeadIds={defaultAssignees[taskListId] || []} /></>}<label className="block text-xs font-semibold text-slate-600">Due date<input type="date" value={modal.date} onChange={(event) => setModal({ ...modal, date: event.target.value })} readOnly={!canEdit} className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm"/></label>{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="min-h-11 px-3 text-xs text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">Cancel</button>{canEdit && <button type="button" disabled={busy || (!modal.task && !taskName.trim())} onClick={() => void submit()} className="min-h-11 bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">{busy ? "Saving…" : modal.task ? "Save changes" : "Save to ClickUp"}</button>}</div></div></div>}
  </section>;
}

function EmptyState({ hasLists }: { hasLists: boolean }) {
  const message = [hasLists ? "No tasks in this project yet" : "No lists in this folder yet", "Add lists and tasks in ClickUp, then refresh this page to see them in the project workspace."];

  return (
    <div className="flex min-h-72 flex-col items-center justify-center border border-dashed border-[#9FB8CE] bg-white px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center border border-[#C9A84C]/60 bg-[#FBF7E9] text-[#003366]"><FolderKanban aria-hidden="true" className="h-5 w-5" /></div>
      <h2 className="text-base font-semibold text-[#003366]">{message[0]}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{message[1]}</p>
      <a href={PROJECT_URL} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">
        Open project in ClickUp <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
      </a>
    </div>
  );
}

interface TaskTreeNode { task: ProjectTask; children: TaskTreeNode[] }

function taskTree(tasks: ProjectTask[]): TaskTreeNode[] {
  const ids = new Set(tasks.map((task) => task.id));
  const order = new Map(tasks.map((task, index) => [task.id, index]));
  const children = new Map<string, ProjectTask[]>();
  const roots: ProjectTask[] = [];
  for (const task of tasks) {
    if (task.parentId && ids.has(task.parentId)) children.set(task.parentId, [...(children.get(task.parentId) || []), task]);
    else roots.push(task);
  }
  const visited = new Set<string>();
  const build = (task: ProjectTask): TaskTreeNode | null => {
    if (visited.has(task.id)) return null;
    visited.add(task.id);
    const orderedChildren = (children.get(task.id) || []).slice().sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0));
    return { task, children: orderedChildren.map(build).filter((node): node is TaskTreeNode => node !== null) };
  };
  const tree = roots.map(build).filter((node): node is TaskTreeNode => node !== null);
  for (const task of tasks) if (!visited.has(task.id)) { const node = build(task); if (node) tree.push(node); }
  const phaseOrder = (name: string) => {
    if (/project brief|site sourcing/i.test(name)) return 0;
    if (/site negotiation|due diligence/i.test(name)) return 1;
    if (/site documentation/i.test(name)) return 2;
    return 3;
  };
  const taskOrder = (name: string, phase: number) => {
    const normalized = name.toLowerCase();
    if (phase === 0) {
      if (/project brief/.test(normalized)) return 0;
      if (/site sourcing/.test(normalized)) return 1;
      if (/sourcing activity/.test(normalized)) return 2;
      if (/ssr submission\s*3p|3p.*ssr submission|3p to franchisee/.test(normalized)) return 3;
      if (/franchisee ssr review/.test(normalized)) return 4;
      if (/franchisee ssr submission/.test(normalized)) return 5;
      if (/bu.*cre.*ssr review|ssr review.*bu.*cre/.test(normalized)) return 6;
      if (/conditional milestone|test fit.*required/.test(normalized)) return 7;
      if (/test fit generation/.test(normalized)) return 8;
      if (/bu.*cre.*site approval/.test(normalized)) return 9;
    } else if (phase === 1) {
      if (/overall phase envelope/.test(normalized)) return 0;
      if (/conduct site nego|full due diligence/.test(normalized)) return 1;
      if (/reloc topo|as-found plans|property due dil/.test(normalized)) return 2;
      if (/risk assessment form|technical due diligence/.test(normalized)) return 3;
      if (/franchisee final approval.*nego|final approval of nego position/.test(normalized)) return 4;
      if (/negotiation.*acquisition/.test(normalized)) return 5;
    } else if (phase === 2) {
      if (/overall phase envelope/.test(normalized)) return 0;
      if (/negotiations? of col|col.*fla.*negotiat/.test(normalized)) return 1;
      if (/submission.*negotiated col|negotiated col.*fla/.test(normalized)) return 2;
      if (/conditional workflow|if with revisions/.test(normalized)) return 3;
      if (/franchisee col review|bu.*cre.*fla review/.test(normalized)) return 4;
      if (/3p endorsement/.test(normalized)) return 5;
      if (/franchisee final col approval|bu.*cre.*fla final approval/.test(normalized)) return 6;
      if (/col.*fla signing/.test(normalized)) return 7;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  const sortDescendants = (node: TaskTreeNode, phase: number): TaskTreeNode => ({
    ...node,
    children: node.children.map((child, index) => ({ child, index }))
      .sort((a, b) => taskOrder(a.child.task.name, phase) - taskOrder(b.child.task.name, phase) || a.index - b.index)
      .map(({ child }) => sortDescendants(child, phase)),
  });
  return tree
    .map((node, index) => ({ node, index }))
    .sort((a, b) => phaseOrder(a.node.task.name) - phaseOrder(b.node.task.name) || a.index - b.index)
    .map(({ node }) => sortDescendants(node, phaseOrder(node.task.name)));
}

function TaskRow({ task, depth = 0, onOpen, canEdit }: { task: ProjectTask; depth?: number; onOpen: (task: ProjectTask) => void; canEdit: boolean }) {
  const content = <>
    <span className="min-w-0 flex-1"><span className={`block truncate text-[13px] font-medium ${depth ? "text-slate-700" : "text-[#003366]"}`}>{task.name}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{owners(task)}</span></span>
    <span style={statusInlineStyle(task)} className="shrink-0 border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide">{projectStatusLabel(task.status)}</span>
    <span className="hidden w-28 shrink-0 text-right text-[11px] text-slate-600 sm:block">{formatDate(task.dueDate)}</span>
  </>;
  return <button type="button" onClick={() => onOpen(task)} className="flex min-h-12 w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 transition-colors hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">{content}<span className="shrink-0 text-[10px] font-medium text-[#31577D]">{canEdit ? "Edit" : "View"}</span></button>;
}

function TaskHierarchy({ folderId, listName, tasks, statuses, members, teamLeadIds, onTaskChange, canEdit }: { folderId: string; listName: string; tasks: ProjectTask[]; statuses: string[]; members: ProjectMember[]; teamLeadIds: string[]; onTaskChange: (task: ProjectTask) => void; canEdit: boolean }) {
  const tree = useMemo(() => taskTree(tasks), [tasks]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableMembers = editingTask
    ? [...members, ...editingTask.assignees.filter((assignee) => !members.some((member) => member.id === assignee.id))]
    : members;
  const assignmentChanged = Boolean(editingTask) && (assignees.length !== editingTask?.assignees.length || assignees.some((id) => !editingTask?.assignees.some((assignee) => assignee.id === id)));
  const openTask = (task: ProjectTask) => { setEditingTask(task); setStatus(projectStatusValue(task.status, projectStatusOptions(statuses))); setRemarks(task.description || ""); setActionPlan(task.actionPlan || ""); setStartDate(clickUpDateKey(task.startDate) || ""); setDueDate(clickUpDateKey(task.dueDate) || ""); setAssignees(task.assignees.map((assignee) => assignee.id)); setError(""); };
  const saveTask = async () => {
    if (!editingTask || !canEdit) return;
    if (startDate && dueDate && dueDate < startDate) { setError("Due date must be on or after the start date."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/tasks?action=project-task-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId, listId: editingTask.listId, listName, taskId: editingTask.id, taskName: editingTask.name, previous: { status: editingTask.status, description: editingTask.description || "", startDate: editingTask.startDate, dueDate: editingTask.dueDate, assignees: editingTask.assignees.map((assignee) => assignee.id) }, status, description: remarks, startDate: startDate || null, dueDate: dueDate || null, assignees }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Task changes could not be saved.");
      if (actionPlan.trim() !== (editingTask.actionPlan || "").trim()) {
        const planResponse = await fetch("/api/tasks?action=project-action-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId, listId: editingTask.listId, taskId: editingTask.id, taskName: editingTask.name, taskUrl: editingTask.url, actionPlan }) });
        const planPayload = await planResponse.json().catch(() => ({}));
        if (!planResponse.ok) throw new Error(planPayload.error || "Task fields were saved, but the action plan could not be saved.");
      }
      const savedStatus = payload.task?.status as { color?: string; type?: string } | undefined;
      onTaskChange({ ...editingTask, status, statusType: savedStatus?.type || (/^(complete|completed|closed|done)$/i.test(status) ? "closed" : editingTask.statusType), statusColor: savedStatus?.color || editingTask.statusColor, description: remarks, actionPlan: actionPlan.trim(), startDate: startDate ? `${startDate}T00:00:00.000Z` : null, dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null, assignees: availableMembers.filter((member) => assignees.includes(member.id)), dateUpdated: new Date().toISOString() });
      setEditingTask(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Task changes could not be saved."); }
    finally { setSaving(false); }
  };
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderNode = (node: TaskTreeNode, depth: number, phaseIndex: number): ReactNode => {
    const { task, children } = node;
    if (!children.length) return <TaskRow key={task.id} task={task} depth={depth} onOpen={openTask} canEdit={canEdit} />;
    const phase = depth === 0, isCollapsed = collapsed.has(task.id);
    const descendants: ProjectTask[] = [];
    const collect = (child: TaskTreeNode) => { descendants.push(child.task); child.children.forEach(collect); };
    children.forEach(collect);
    const complete = descendants.filter(isComplete).length;
    return <section key={task.id} className={phase ? "overflow-hidden border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,51,102,0.04)]" : "relative ml-3 border-l-2 border-[#D9E3EC] pl-3 sm:ml-5 sm:pl-4"}>
      <div className={`flex w-full items-center gap-2 ${phase ? "min-h-[66px] bg-[#F7FAFC] px-4 py-3 hover:bg-[#F2F6F9]" : "min-h-12 px-2 py-2 hover:bg-[#F7FAFC]"}`}><button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(task.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#003366]">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${phase ? "bg-[#003366] text-white" : "bg-white text-[#31577D] ring-1 ring-slate-200"}`}><ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} /></span>
        <span className="min-w-0 flex-1">{phase && <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.16em] text-[#A98611]">Phase {phaseIndex + 1}</span>}<span className={`block truncate ${phase ? "text-[19px] font-bold text-[#003366] sm:text-[21px]" : "text-[13px] font-semibold text-[#21486D]"}`}>{task.name}</span></span>
        {/conditional/i.test(task.name) && <span className="hidden border border-[#E6D49A] bg-[#FBF7E9] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#725900] sm:inline">Conditional</span>}
        <span className="shrink-0 text-right text-[10px] text-slate-500"><span className="block font-semibold tabular-nums text-[#31577D]">{complete} / {descendants.length}</span><span className="hidden sm:block">complete</span></span>
      </button><button type="button" onClick={() => openTask(task)} className="shrink-0 px-2 py-1 text-[10px] font-semibold text-[#31577D] hover:text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">{canEdit ? "Edit" : "View"}</button></div>
      {phase && <div className="flex h-1 bg-slate-100"><div className="bg-[#C9A84C]" style={{ width: `${descendants.length ? Math.round(complete / descendants.length * 100) : 0}%` }} /></div>}
      {!isCollapsed && <div className={phase ? "space-y-1 px-3 py-3 sm:px-5 sm:py-4" : "pb-2"}>{children.map((child, index) => renderNode(child, depth + 1, index))}</div>}
    </section>;
  };
  return <div className="space-y-3">{tree.map((node, index) => renderNode(node, 0, index))}{editingTask && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!saving) setEditingTask(null); }}><section role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">{canEdit ? "Task details" : "Task details · View only"}</p><h2 id="task-editor-title" className="mt-1 text-lg font-semibold text-[#003366]">{editingTask.name}</h2></div><button type="button" aria-label="Close task editor" onClick={() => setEditingTask(null)} className="flex h-8 w-8 items-center justify-center text-[#003366] hover:bg-slate-50"><X className="h-4 w-4" /></button></header><div className="mt-5"><span className="block text-xs font-semibold text-slate-600">Status</span><ProjectStatusSelect value={status} options={projectStatusOptions(statuses)} onChange={setStatus} disabled={!canEdit} /></div><AssigneePicker label="Assignees" members={availableMembers} value={assignees} onChange={setAssignees} teamLeadIds={teamLeadIds} disabled={!canEdit} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-600">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} readOnly={!canEdit} className="mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm font-normal text-[#003366] focus:border-[#003366] focus:outline-none read-only:bg-slate-50" /></label><label className="block text-xs font-semibold text-slate-600">Due date<input type="date" min={startDate || undefined} value={dueDate} onChange={(event) => setDueDate(event.target.value)} readOnly={!canEdit} className="mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm font-normal text-[#003366] focus:border-[#003366] focus:outline-none read-only:bg-slate-50" /></label></div><label className="mt-4 block text-xs font-semibold text-slate-600">Action plan<textarea value={actionPlan} onChange={(event) => setActionPlan(event.target.value)} readOnly={!canEdit} maxLength={2000} rows={3} placeholder="Current status and next step" className="mt-1 w-full resize-y border border-slate-300 px-3 py-2 text-sm font-normal leading-5 text-[#003366] placeholder:text-slate-400 focus:border-[#003366] focus:outline-none read-only:bg-slate-50" /></label><label className="mt-4 block text-xs font-semibold text-slate-600">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} readOnly={!canEdit} maxLength={10000} rows={5} placeholder="Add progress notes or other task remarks" className="mt-1 w-full resize-y border border-slate-300 px-3 py-2 text-sm font-normal leading-5 text-[#003366] placeholder:text-slate-400 focus:border-[#003366] focus:outline-none read-only:bg-slate-50" /></label><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-[#F7FAFC] p-3"><div><p className="text-xs font-semibold text-[#003366]">Files</p><p className="mt-1 text-[11px] text-slate-500">Open this task in ClickUp to attach or manage files.</p></div>{editingTask.url && <a href={editingTask.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] hover:border-[#003366]">Open in ClickUp <ArrowUpRight className="h-3.5 w-3.5" /></a>}</div>{error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}<footer className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditingTask(null)} className="min-h-10 px-3 text-xs text-slate-600">Close</button>{canEdit && <button type="button" disabled={saving || (status === editingTask.status && remarks === (editingTask.description || "") && actionPlan.trim() === (editingTask.actionPlan || "").trim() && startDate === (clickUpDateKey(editingTask.startDate) || "") && dueDate === (clickUpDateKey(editingTask.dueDate) || "") && !assignmentChanged)} onClick={() => void saveTask()} className="min-h-10 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>}</footer></section></div>}</div>;
}
function LoadingSkeleton({ variant }: { variant: "gallery" | "project" | "subproject" }) {
  const label = variant === "gallery" ? "Loading projects" : variant === "subproject" ? "Loading subproject" : "Loading project";
  return <ClickUpLoadingPanel label={label} />;
}
function ProjectGallery({ projects, selectedProjectIds, selectionLoaded, selectionError, loading, error, savingSelection, onRefresh, onOpen, onSaveSelection }: {
  projects: ProjectCardData[];
  selectedProjectIds: string[];
  selectionLoaded: boolean;
  selectionError: string | null;
  loading: boolean;
  error: string | null;
  savingSelection: boolean;
  onRefresh: () => void;
  onOpen: (project: ProjectCardData) => void;
  onSaveSelection: (folderIds: string[]) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(selectedProjectIds);
  const [search, setSearch] = useState("");
  const [pickerError, setPickerError] = useState("");
  const pickerRef = useRef<HTMLElement | null>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const spaceName = projects[0]?.spaceName || "ClickUp Space";
  const includedProjects = projects.filter((project) => selectedProjectIds.includes(project.id));
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPickerOpen(false);
        pickerTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !pickerRef.current) return;
      const focusable = Array.from(pickerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    pickerRef.current?.querySelector<HTMLElement>("button[aria-label='Close']")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen]);

  const openPicker = () => {
    setDraftIds(selectedProjectIds);
    setPickerError("");
    setPickerOpen(true);
  };
  const closePicker = () => {
    setPickerOpen(false);
    pickerTriggerRef.current?.focus();
  };
  const saveSelection = async () => {
    setPickerError("");
    try {
      await onSaveSelection(draftIds);
      closePicker();
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : "Could not save the project selection.");
    }
  };

  return <section className="mx-auto w-full max-w-[1440px] space-y-5 pb-8">
    <ProjectPageHeader eyebrow="Project portfolio" title="Projects" subtitle={`Choose ClickUp folders to include · ${spaceName}`} actions={<>
      <button ref={pickerTriggerRef} type="button" onClick={openPicker} disabled={!selectionLoaded || Boolean(selectionError)} className="inline-flex min-h-8 items-center justify-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] disabled:cursor-wait disabled:opacity-50"><FolderKanban aria-hidden="true" className="h-3.5 w-3.5" />Choose folders</button>
      <ProjectActionButton onClick={onRefresh} disabled={loading}><RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ProjectActionButton>
    </>} />
    {!selectionLoaded ? <LoadingSkeleton variant="gallery" />
      : selectionError ? <div role="alert" className="border border-amber-300 bg-white p-5"><p className="text-sm font-semibold text-[#003366]">Project selection could not be loaded</p><p className="mt-1 text-sm text-slate-600">{selectionError}</p><button type="button" onClick={onRefresh} className="mt-3 min-h-11 border border-[#003366] px-3 text-xs font-semibold text-[#003366]">Try again</button></div>
      : loading && !projects.length ? <LoadingSkeleton variant="gallery" />
      : error && !projects.length ? <div role="alert" className="border border-amber-300 bg-white p-5"><p className="text-sm font-semibold text-[#003366]">Project folders could not be loaded</p><p className="mt-1 text-sm text-slate-600">{error}</p><button type="button" onClick={onRefresh} className="mt-3 min-h-11 border border-[#003366] px-3 text-xs font-semibold text-[#003366]">Try again</button></div>
        : includedProjects.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{includedProjects.map((project) => <button key={project.id} type="button" onClick={() => onOpen(project)} className="group min-h-40 border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#C9A84C] hover:bg-[#FFFCFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><div className="flex h-full flex-col"><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center border border-[#C9A84C]/60 bg-[#FBF7E9] text-[#003366]"><FolderKanban aria-hidden="true" className="h-4 w-4" /></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 text-slate-400 transition-colors group-hover:text-[#003366]" /></div><span className="mt-4 text-base font-semibold text-[#003366]">{project.name}</span><span className="mt-1 text-xs text-slate-500">{project.listCount} subproject{project.listCount === 1 ? "" : "s"}</span><span className="mt-auto pt-4 text-[10px] font-semibold uppercase tracking-wide text-[#31577D]">Open project</span></div></button>)}</div>
          : <div className="border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><FolderKanban aria-hidden="true" className="mx-auto h-6 w-6 text-[#31577D]" /><h2 className="mt-3 text-base font-semibold text-[#003366]">Choose which folders are projects</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Only folders you select will appear in this shared project gallery.</p><button type="button" onClick={openPicker} className="mt-4 inline-flex min-h-10 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">Choose folders</button></div>}
    {error && projects.length > 0 && <p role="status" className="border border-amber-300 bg-[#FBF7E9] px-3 py-2 text-xs text-[#003366]">Showing loaded folders. Refresh failed: {error}</p>}
    {pickerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePicker}><section ref={pickerRef} role="dialog" aria-modal="true" aria-labelledby="project-picker-title" className="flex max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-xl flex-col border border-slate-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
      <header className="border-b border-slate-200 px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Shared project list</p><h2 id="project-picker-title" className="mt-1 text-lg font-semibold text-[#003366]">Choose project folders</h2><p className="mt-1 text-xs text-slate-600">Selected folders appear for the whole team.</p></div><button type="button" aria-label="Close" onClick={closePicker} className="inline-flex h-10 w-10 items-center justify-center text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><X className="h-4 w-4" /></button></div><input aria-label="Search folders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ClickUp folders" className="mt-4 h-10 w-full border border-slate-300 px-3 text-sm focus:border-[#003366] focus:outline-none" /></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">{filteredProjects.map((project) => { const checked = draftIds.includes(project.id); return <label key={project.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-slate-100 text-sm text-[#003366]"><input type="checkbox" checked={checked} onChange={() => setDraftIds((current) => checked ? current.filter((id) => id !== project.id) : [...current, project.id])} className="h-4 w-4 accent-[#003366]" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{project.name}</span><span className="mt-0.5 block text-[11px] text-slate-500">{project.listCount} subproject{project.listCount === 1 ? "" : "s"}</span></span></label>; })}{!filteredProjects.length && <p className="py-8 text-center text-sm text-slate-500">No folders match this search.</p>}</div>
      {pickerError && <p role="alert" className="px-5 pt-2 text-xs text-red-700">{pickerError}</p>}
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3"><span className="text-xs text-slate-500">{draftIds.length} selected</span><div className="flex gap-2"><button type="button" onClick={closePicker} className="min-h-10 px-3 text-xs text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">Cancel</button><button type="button" onClick={() => void saveSelection()} disabled={savingSelection} className="min-h-10 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">{savingSelection ? "Saving…" : "Save selection"}</button></div></footer>
    </section></div>}
  </section>;
}

function projectStage(name: string) {
  if (/site sourcing|project brief/i.test(name)) return "Site Sourcing";
  if (/site negotiation|due diligence/i.test(name)) return "Site Negotiation";
  if (/site documentation/i.test(name)) return "Site Documentation";
  return null;
}

function SubprojectStatusCards({ folderId, listId, tasks, tasksLoading, onTaskChange, canEdit }: { folderId: string; listId: string; tasks: ProjectTask[]; tasksLoading: boolean; onTaskChange: (task: ProjectTask) => void; canEdit: boolean }) {
  const [actionPlan, setActionPlan] = useState("");
  const [savedPlan, setSavedPlan] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const stages = useMemo(() => taskTree(tasks).map((node) => {
    const leaves = (item: TaskTreeNode): ProjectTask[] => item.children.length ? item.children.flatMap(leaves) : [item.task];
    return { name: projectStage(node.task.name), tasks: leaves(node) };
  }).filter((stage): stage is { name: string; tasks: ProjectTask[] } => Boolean(stage.name)), [tasks]);
  const unfinishedStage = stages.findIndex((stage) => stage.tasks.some((task) => !isComplete(task)));
  const currentStageIndex = unfinishedStage < 0 ? Math.max(0, stages.length - 1) : unfinishedStage;
  const currentStage = stages[currentStageIndex];
  const completedCount = currentStage?.tasks.filter(isComplete).length || 0;
  const ongoingPlanTasks = useMemo(() => tasks
    .filter((task) => projectStatusLabel(task.status) === "On going" && task.actionPlanFieldAvailable)
    .sort((left, right) => (Date.parse(right.dateUpdated || right.dateCreated || "") || 0) - (Date.parse(left.dateUpdated || left.dateCreated || "") || 0) || left.name.localeCompare(right.name)), [tasks]);
  const selectedPlanTask = ongoingPlanTasks[0] || null;

  useEffect(() => {
    setActionPlan(selectedPlanTask?.actionPlan || "");
    setSavedPlan(selectedPlanTask?.actionPlan || "");
    setUpdatedAt(null);
    setPlanError("");
  }, [selectedPlanTask?.id]);

  const saveActionPlan = async () => {
    if (!selectedPlanTask) {
      setPlanError("Set a task to On going to add an action plan.");
      return;
    }
    setSavingPlan(true); setPlanError("");
    try {
      const response = await fetch("/api/tasks?action=project-action-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId, listId, taskId: selectedPlanTask.id, taskName: selectedPlanTask.name, taskUrl: selectedPlanTask.url, actionPlan }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save the action plan.");
      setActionPlan(actionPlan.trim()); setSavedPlan(actionPlan.trim()); setUpdatedAt(new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
      onTaskChange({ ...selectedPlanTask, actionPlan: actionPlan.trim(), dateUpdated: new Date().toISOString() });
    } catch (error) { setPlanError(error instanceof Error ? error.message : "Could not save the action plan."); }
    finally { setSavingPlan(false); }
  };

  return <section aria-label="Subproject status" className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
    <article className="border border-slate-200 bg-white px-4 py-4 sm:px-5"><div className="min-h-[42px]"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31577D]">Current stage</p></div><h2 className="mt-1 text-2xl font-semibold text-[#003366]">{currentStage?.name || "Not started"}</h2><div className="mt-4 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tabular-nums text-[#003366]">{completedCount}</span><span className="text-sm tabular-nums text-slate-500">/ {currentStage?.tasks.length || 0} tasks completed</span></div><div className="mt-3 h-1.5 bg-slate-100"><div className="h-full bg-[#C9A84C]" style={{ width: `${currentStage?.tasks.length ? Math.round(completedCount / currentStage.tasks.length * 100) : 0}%` }} /></div></article>
    <article className="border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31577D]">Action plan</p>{selectedPlanTask ? <><h3 className="mt-1 truncate text-sm font-semibold text-[#003366]" title={selectedPlanTask.name}>{selectedPlanTask.name}</h3><p className="mt-0.5 text-[10px] text-slate-500">Latest ongoing task</p></> : <p className="mt-1 text-[11px] text-slate-500">Set a task to On going to add an action plan.</p>}</div><div className="flex shrink-0 items-center gap-3">{updatedAt && savedPlan === actionPlan.trim() && <span role="status" className="text-[10px] text-slate-500">Updated as of {updatedAt}</span>}{canEdit && <button type="button" onClick={() => void saveActionPlan()} disabled={tasksLoading || savingPlan || !selectedPlanTask || actionPlan.trim() === savedPlan.trim()} className="min-h-8 border border-[#003366] bg-[#003366] px-3 text-[10px] font-semibold text-white hover:bg-[#174778] disabled:cursor-not-allowed disabled:opacity-50">{savingPlan ? "Saving…" : "Save action plan"}</button>}</div></div>
      <textarea aria-label="Action plan" value={actionPlan} onChange={(event) => { setActionPlan(event.target.value); }} readOnly={!canEdit} disabled={tasksLoading || !selectedPlanTask} maxLength={2000} rows={4} placeholder={!selectedPlanTask ? "An action plan will be available when a task is On going" : "Current status and next step"} className="mt-3 min-h-28 w-full resize-y border border-slate-200 px-3 py-2 text-xs leading-5 text-[#003366] placeholder:text-slate-400 focus:border-[#003366] focus:outline-none read-only:bg-slate-50 disabled:bg-slate-50" />{planError && <p role="alert" className="mt-1 text-[10px] text-red-700">{planError}</p>}
    </article>
  </section>;
}

function SubprojectWorkspace({ folderId, folderUrl, list, tasks, members, defaultAssignees, canEdit, canManageLead, onAssign, savingAssignees, assigneeSyncMessage, onBack, onRefresh, tasksLoading, onTaskChange, basePath, initialView, initialReviewId, userId }: {
  folderId: string;
  folderUrl: string;
  list: ProjectList;
  tasks: ProjectTask[];
  members: ProjectMember[];
  defaultAssignees: string[];
  canEdit: boolean;
  canManageLead: boolean;
  onAssign: (assigneeIds: string[]) => void;
  savingAssignees: boolean;
  assigneeSyncMessage: string;
  onBack: () => void;
  onRefresh: () => void;
  tasksLoading: boolean;
  onTaskChange: (task: ProjectTask) => void;
  basePath: string;
  initialView: "dashboard" | "tasks" | "calendar" | "contract-review" | "sites" | "documentation";
  initialReviewId?: string;
  userId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"dashboard" | "tasks" | "calendar" | "contract-review" | "sites" | "documentation">(initialView);
  const [showDelta, setShowDelta] = useState(initialReviewId === "new");
  const [selectedReview, setSelectedReview] = useState<SavedDeltaReview | null>(null);
  const tabs = [{ id: "dashboard", label: "Dashboard" }, { id: "sites", label: "Sites" }, { id: "calendar", label: "Calendar" }, { id: "tasks", label: "Timeline" }, { id: "contract-review", label: "Contracts" }, { id: "documentation", label: "Documentation" }] as const;

  useEffect(() => {
    setView(initialView);
    if (initialView !== "contract-review" || !initialReviewId) {
      setShowDelta(false); setSelectedReview(null);
    } else if (initialReviewId === "new") {
      setShowDelta(true); setSelectedReview(null);
    } else {
      setShowDelta(false); setSelectedReview(null);
    }
  }, [initialReviewId, initialView]);

  const selectTab = (tabId: typeof tabs[number]["id"]) => {
    setView(tabId); setShowDelta(false); setSelectedReview(null);
    router.push(`${basePath}/${tabId}`);
  };
  const startComparison = () => {
    setSelectedReview(null); setShowDelta(true);
    router.push(`${basePath}/contract-review/new`);
  };
  const openComparison = (review: SavedDeltaReview) => {
    setSelectedReview(review); setShowDelta(true);
    router.push(`${basePath}/contract-review/${review.id}`);
  };
  const backToContractReviews = () => {
    setShowDelta(false); setSelectedReview(null);
    router.push(`${basePath}/contract-review`);
  };
  const contractReviewContent = showDelta
    ? <DeltaReview key={selectedReview?.id || "new-review"} contextName={list.name} contextId={list.id} initialReview={selectedReview || undefined} onBack={backToContractReviews} readOnly={!canEdit} />
    : <DeltaReviewList contextName={list.name} contextId={list.id} initialReviewId={initialReviewId !== "new" ? initialReviewId : undefined} onStart={startComparison} onOpen={openComparison} readOnly={!canEdit} />;

  const assignedMembers = defaultAssignees.map((id) => members.find((member) => member.id === id)).filter((member): member is ProjectMember => Boolean(member));

  return <section className="mx-auto w-full max-w-[1440px] space-y-4 pb-8">
    <ProjectPageHeader eyebrow="Subproject workspace" title={list.name} onBack={onBack} actions={<>
      <div className="inline-flex min-h-9 items-center gap-2 border border-slate-300 bg-white px-2 text-[11px] font-semibold text-[#003366]" aria-label="Subproject lead"><MemberAvatars members={assignedMembers} emptyLabel="No lead"/>{canManageLead ? <select aria-label="Assign subproject lead" value={defaultAssignees[0] || ""} onChange={(event) => onAssign(event.target.value ? [event.target.value] : [])} disabled={savingAssignees} className="h-full max-w-36 bg-transparent text-[11px] font-semibold text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><option value="">{savingAssignees ? "Saving…" : "Set lead"}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select> : <span className="max-w-36 truncate">{assignedMembers[0]?.name || "Lead not assigned"}</span>}</div>
      <ProjectActionButton onClick={onRefresh} disabled={savingAssignees} label="Refresh subproject"><RefreshCw aria-hidden="true" className="h-4 w-4" /></ProjectActionButton>
      <ClickUpLink href={list.url || folderUrl} label="Open subproject in ClickUp" />    </>} />
    {assigneeSyncMessage && <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{assigneeSyncMessage}</p>}
    {!canEdit && <p role="note" className="border-l-2 border-[#C9A84C] bg-[#F7FAFC] px-3 py-2 text-xs text-slate-700">View only. The assigned subproject lead or Mosaic admin can make changes.</p>}
    <div role="tablist" aria-label={`${list.name} workspace views`} className="flex border-b border-slate-200">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => selectTab(tab.id)} className={`min-h-11 border-b-2 px-4 text-xs font-semibold ${view === tab.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]"}`}>{tab.label}</button>)}</div>
    {view === "dashboard" ? <div className="space-y-5"><SubprojectStatusCards folderId={folderId} listId={list.id} tasks={tasks} tasksLoading={tasksLoading} onTaskChange={onTaskChange} canEdit={canEdit} /><ProjectActivityFeed folderId={folderId} lists={[list]} fixedListId={list.id} userId={userId} /></div>
      : view === "tasks" ? tasksLoading ? <section className="space-y-2 border border-slate-200 bg-white p-4" role="status"><span className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#003366]" />Loading timeline tasks</span>{[0, 1, 2].map((row) => <div key={row} className="h-11 animate-pulse border border-slate-100 bg-slate-50" />)}</section> : tasks.length ? <section className="border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-[#003366]">Timeline</h2><p className="mt-0.5 text-[10px] text-slate-500">Phases, workstreams, and activities</p></div><span className="text-[10px] text-slate-500">{tasks.length} items</span></header><div className="p-3 sm:p-4"><TaskHierarchy folderId={folderId} listName={list.name} tasks={tasks} statuses={list.statuses || Array.from(new Set(tasks.map((task) => task.status)))} members={members} teamLeadIds={defaultAssignees} onTaskChange={onTaskChange} canEdit={canEdit} /></div></section> : <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><h2 className="text-sm font-semibold text-[#003366]">No tasks in this subproject</h2><p className="mt-1 text-xs text-slate-600">Create tasks in ClickUp, then refresh this workspace.</p><button type="button" onClick={onRefresh} className="mt-3 min-h-10 border border-slate-300 px-3 text-xs font-semibold text-[#003366]">Refresh</button></div>
      : view === "calendar" ? <CalendarView folderId={folderId} tasks={tasks} lists={[list]} members={members} defaultAssignees={{ [list.id]: defaultAssignees }} onTaskChange={onTaskChange} canEdit={canEdit} />
      : view === "sites" ? <SubprojectSites folderId={folderId} listId={list.id} listName={list.name} userId={userId} canEdit={canEdit} canManageAllSites={canManageLead} />
        : view === "contract-review" ? contractReviewContent : null}
  </section>;
}

const siteColumns = ["Site No", "Site Name", "P/S", "Lessor", "Status", "Monthly Rate (Php)", "PF Structure (months)", "Amount (Php)"] as const;
type SiteRow = ReturnType<typeof sitesForSubproject>[number] & {
  taskId?: string | null;
  taskPending?: boolean;
  taskFailed?: boolean;
  lessor?: string;
  status?: string;
  monthlyRate?: string;
  pfStructure?: string;
  amount?: string;
};
type EditableSiteField = "lessor" | "status" | "monthlyRate" | "pfStructure" | "amount";
const editableSiteFieldLabels: Record<EditableSiteField, string> = {
  lessor: "Lessor",
  status: "Status",
  monthlyRate: "Monthly Rate (Php)",
  pfStructure: "PF Structure (months)",
  amount: "Amount (Php)",
};

function numericSiteValue(value: string | undefined, field: "php" | "months") {
  if (!value) return "";
  let normalized = value.trim().replace(/,/g, "");
  if (field === "php") {
    normalized = normalized
      .replace(/^(?:php|₱)\s*/i, "")
      .replace(/\s*(?:per\s+month|\/\s*(?:month|mo\.?)|monthly)$/i, "");
  } else {
    normalized = normalized
      .replace(/\s+(?:rent|pf)$/i, "")
      .replace(/\s*(?:x|months?|mos?\.?|mo\.?)$/i, "");
  }
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : "";
}

const sitePhpFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatSitePhp(value: string | undefined) {
  const numericValue = numericSiteValue(value, "php");
  return numericValue ? sitePhpFormatter.format(Number(numericValue)) : "";
}

function sanitizeSiteNumber(value: string) {
  const numericValue = value.replace(/[^\d.]/g, "");
  const decimalIndex = numericValue.indexOf(".");
  return decimalIndex < 0 ? numericValue : `${numericValue.slice(0, decimalIndex + 1)}${numericValue.slice(decimalIndex + 1).replace(/\./g, "")}`;
}

function SubprojectSites({ folderId, listId, listName, userId, canEdit, canManageAllSites }: { folderId: string; listId: string; listName: string; userId?: string; canEdit: boolean; canManageAllSites: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message: string }>({ kind: "idle", message: "" });
  const [focusedCurrencyField, setFocusedCurrencyField] = useState<string | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSaves = useRef(new Map<string, () => Promise<void>>());
  const saveVersions = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const sourceSites = useMemo(() => sitesForSubproject(listName), [listName]);
  const siteQueryKey = `project-sites:${folderId}:${listId}`;
  const loadSiteRows = useCallback(async () => {
    const params = new URLSearchParams({ folderId, listId, listName });
    const response = await fetch(`/api/projects/sites?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || "Site data could not be loaded."), { status: response.status });
    return Array.isArray(payload.sites) ? payload.sites as SiteRow[] : [];
  }, [folderId, listId, listName]);
  const { data: cachedSiteRows, loading: siteLoading, refreshing: siteRefreshing, error: siteError, refresh: refreshSiteRows, update: updateCachedSiteRows } = useBrowserPageQuery<SiteRow[]>(userId, siteQueryKey, loadSiteRows);
  const loading = siteLoading || siteRefreshing;
  const sites = useMemo<SiteRow[]>(() => cachedSiteRows || sourceSites.map((site) => ({ ...site, status: "" })), [cachedSiteRows, sourceSites]);
  const hasPendingSiteRows = sites.some((site) => site.taskPending);
  const hasFailedSiteRows = sites.some((site) => site.taskFailed);
  const [columnWidths, setColumnWidths] = useState([110, 280, 72, 170, 140, 150, 170, 140]);
  const resizingColumn = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>("textarea.site-cell-editor").forEach((textarea) => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.max(textarea.scrollHeight, 28)}px`;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [columnWidths, sites]);

  const resizeColumn = (index: number, width: number) => {
    setColumnWidths((current) => current.map((value, columnIndex) => columnIndex === index ? Math.max(72, width) : value));
  };

  const startColumnResize = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingColumn.current = { index, startX: event.clientX, startWidth: columnWidths[index] };
  };

  const moveColumnResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const resize = resizingColumn.current;
    if (resize) resizeColumn(resize.index, resize.startWidth + event.clientX - resize.startX);
  };

  const stopColumnResize = () => { resizingColumn.current = null; };

  useEffect(() => {
    const refreshAfterSync = () => { void refreshSiteRows(); };
    const refreshVisible = () => { if (document.visibilityState === "visible") void refreshSiteRows(); };
    const timer = window.setInterval(refreshVisible, 60_000);
    const pendingTimer = hasPendingSiteRows ? window.setInterval(refreshVisible, 2_000) : null;
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    window.addEventListener("focus", refreshVisible);
    return () => { window.clearInterval(timer); if (pendingTimer) window.clearInterval(pendingTimer); window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync); window.removeEventListener("focus", refreshVisible); };
  }, [hasPendingSiteRows, refreshSiteRows]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveTimers.current.forEach(clearTimeout);
      for (const save of pendingSaves.current.values()) void save();
    };
  }, []);
  const updateSiteField = (site: SiteRow, field: EditableSiteField, value: string) => {
    if (!canEdit) return;
    updateCachedSiteRows((rows) => (rows || sites).map((row) => {
      if (row.taskId !== site.taskId) return row;
      const updated = { ...row, [field]: value };
      if (field === "monthlyRate" || field === "pfStructure") {
        updated.amount = calculateSiteAmount(updated.monthlyRate, updated.pfStructure) || "";
      }
      return updated;
    }));
    if (!site.taskId) {
      setSaveState({ kind: "error", message: "Set up the site tasks before editing these fields." });
      return;
    }
    const key = `${site.taskId}:${field}`;
    const version = (saveVersions.current.get(key) || 0) + 1;
    saveVersions.current.set(key, version);
    const previousTimer = saveTimers.current.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    setSaveState({ kind: "saving", message: "Saving edits…" });
    const persist = async () => {
      saveTimers.current.delete(key);
      if (pendingSaves.current.get(key) !== persist) return;
      pendingSaves.current.delete(key);
      try {
        const response = await fetch("/api/projects/sites", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId, listId, taskId: site.taskId, field, value }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "This site field could not be saved.");
        if (mounted.current && saveVersions.current.get(key) === version) setSaveState({ kind: "saved", message: "Saved" });
      } catch (error) {
        if (mounted.current && saveVersions.current.get(key) === version) setSaveState({ kind: "error", message: error instanceof Error ? error.message : "This site field could not be saved." });
      }
    };
    pendingSaves.current.set(key, persist);
    const timer = setTimeout(() => void persist(), 600);
    saveTimers.current.set(key, timer);
  };

  const flushSiteField = (site: SiteRow, field: EditableSiteField) => {
    if (!site.taskId) return;
    const key = `${site.taskId}:${field}`;
    const timer = saveTimers.current.get(key);
    if (timer) clearTimeout(timer);
    void pendingSaves.current.get(key)?.();
  };

  const exportSites = () => {
    const csvValue = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+@]/.test(text) || /^-/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      [...siteColumns],
      ...sites.map((site) => [site.siteNo, site.siteName, site.priority, site.lessor, site.status, site.monthlyRate, site.pfStructure, site.amount]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${listName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "sites"}-sites.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const createClosedTasks = async (mode: "list" | "all") => {
    setSyncing(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const response = await fetch("/api/projects/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "all" ? { folderId, mode } : { folderId, listId, mode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Site tasks could not be created.");
      const parts = [`${payload.createdSites || 0} closed site task${payload.createdSites === 1 ? "" : "s"} created`];
      if (payload.existingSites) parts.push(`${payload.existingSites} already present`);
      if (payload.totalFailures) parts.push(`${payload.totalFailures} failed`);
      if (Array.isArray(payload.missingFields) && payload.missingFields.length) parts.push(`ClickUp fields not set up: ${payload.missingFields.join(", ")}`);
      setSyncMessage(`${parts.join(" · ")}.`);
      void refreshSiteRows();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Site tasks could not be created.");
    } finally {
      setSyncing(false);
    }
  };

  return <section className="border border-slate-200 bg-white">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-[#003366]">Sites</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">{sites.length} site records{loading ? " · refreshing from ClickUp" : ""} · fields not included in the source are left blank.</p>
        <p className="mt-0.5 text-[10px] text-slate-500">Amount calculates as Monthly Rate × PF months. Enter PF Structure as a month count, such as 2.</p>
        {siteError && <p role="status" className="mt-1 text-[10px] text-amber-700">Latest ClickUp data could not be refreshed; showing the available site list.</p>}
        {saveState.message && <p className={`mt-1 text-[10px] ${saveState.kind === "error" ? "text-red-700" : saveState.kind === "saving" ? "text-amber-700" : "text-slate-500"}`} aria-live="polite">{saveState.message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {sites.length > 0 && <button type="button" onClick={exportSites} className="inline-flex min-h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] hover:border-[#003366]"><Download aria-hidden="true" className="h-3.5 w-3.5" />Export CSV</button>}
        {sites.length > 0 && !sites.every((site) => Boolean(site.taskId)) && canEdit && (
          <button type="button" onClick={() => void createClosedTasks("list")} disabled={syncing || hasPendingSiteRows} className="min-h-9 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white hover:bg-[#174778] disabled:cursor-wait disabled:opacity-60">{syncing ? "Setting up this subproject…" : hasPendingSiteRows ? "Site rows syncing…" : "Set up site rows for this subproject"}</button>
        )}
        {sites.length > 0 && !sites.every((site) => Boolean(site.taskId)) && canManageAllSites && <button type="button" onClick={() => void createClosedTasks("all")} disabled={syncing || hasPendingSiteRows} className="min-h-9 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] hover:border-[#003366] disabled:cursor-wait disabled:opacity-60">Set up all subprojects</button>}
      </div>
    </header>
    {syncMessage && <p role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">{syncMessage}</p>}
    {syncError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{syncError}</p>}
    {hasPendingSiteRows && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">Site rows are syncing to ClickUp. Editing unlocks as each row finishes syncing.</p>}
    {hasFailedSiteRows && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">Some site rows could not sync to ClickUp. Retry setup for this subproject to try those rows again.</p>}
    {sites.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-xs"><colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead className="bg-slate-50 text-[10px] font-semibold text-slate-600"><tr>{siteColumns.map((column, index) => <th key={column} scope="col" className="relative border border-slate-200/70 px-3 py-2.5">{column}<span
        role="separator"
        aria-label={`Resize ${column} column`}
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={(event) => startColumnResize(event, index)}
        onPointerMove={moveColumnResize}
        onPointerUp={stopColumnResize}
        onPointerCancel={stopColumnResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); resizeColumn(index, columnWidths[index] - 16); }
          if (event.key === "ArrowRight") { event.preventDefault(); resizeColumn(index, columnWidths[index] + 16); }
        }}
        className="absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#C9A33B]"
      ><span className="mx-auto block h-full w-px bg-slate-300/60 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100" /></span></th>)}</tr></thead><tbody>{sites.map((site, index) => <tr key={`${site.tradeArea}-${site.siteNo}`} className={index % 2 ? "bg-slate-50/50" : "bg-white"}>
      <td className="whitespace-normal break-words border border-slate-200/60 px-3 py-2.5 font-medium tabular-nums text-[#003366]">{site.siteNo}</td>
      <td className="whitespace-normal break-words [overflow-wrap:anywhere] border border-slate-200/60 px-3 py-2.5 text-slate-800" title={site.siteName}>{site.siteName}</td>
      <td className={`whitespace-normal break-words border border-slate-200/60 px-3 py-2.5 font-semibold ${site.priority.toLowerCase() === "priority" ? "text-[#14532D]" : site.priority.toLowerCase() === "secondary" ? "text-[#854D0E]" : "text-slate-600"}`}>{site.priority}</td>
      {(["lessor", "status", "monthlyRate", "pfStructure", "amount"] as const).map((field) => <td key={field} className="border border-slate-200/60 px-2 py-1.5">
        {field === "lessor" || field === "status" ? <textarea
          aria-label={`${editableSiteFieldLabels[field]} for site ${site.siteNo}`}
          value={site[field] || ""}
          maxLength={2_000}
          readOnly={!canEdit}
          disabled={!site.taskId}
          onChange={(event) => updateSiteField(site, field, event.currentTarget.value)}
          onBlur={() => flushSiteField(site, field)}
          rows={1}
          className="site-cell-editor block min-h-7 w-full resize-none overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] border border-transparent bg-transparent px-1.5 py-1 text-xs leading-5 text-slate-700 hover:border-slate-200/70 focus:border-[#C9A33B] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A33B] read-only:cursor-default read-only:hover:border-transparent disabled:cursor-not-allowed disabled:text-slate-500"
        /> : <div className="relative"><input
          type={field === "pfStructure" ? "number" : "text"}
          min={field === "pfStructure" ? "0" : undefined}
          step={field === "pfStructure" ? "any" : undefined}
          inputMode="decimal"
          aria-label={`${editableSiteFieldLabels[field]} for site ${site.siteNo}`}
          value={field === "pfStructure"
            ? numericSiteValue(site[field], "months")
            : field === "amount" || focusedCurrencyField !== `${site.taskId}:${field}`
              ? formatSitePhp(site[field])
              : numericSiteValue(site[field], "php")}
          readOnly={!canEdit || field === "amount"}
          title={field === "amount" ? "Calculated from Monthly Rate (Php) × PF months" : undefined}
          disabled={!site.taskId}
          onFocus={field === "monthlyRate" ? (event) => { setFocusedCurrencyField(`${site.taskId}:${field}`); event.currentTarget.select(); } : undefined}
          onChange={(event) => updateSiteField(site, field, field === "monthlyRate" ? sanitizeSiteNumber(event.currentTarget.value) : event.currentTarget.value)}
          onBlur={() => { flushSiteField(site, field); if (field === "monthlyRate") setFocusedCurrencyField(null); }}
          className={`block min-h-7 w-full min-w-0 border border-transparent bg-transparent px-1.5 py-1 text-xs leading-5 tabular-nums text-slate-700 hover:border-slate-200/70 focus:border-[#C9A33B] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A33B] read-only:cursor-default read-only:hover:border-transparent disabled:cursor-not-allowed disabled:text-slate-500 ${field === "pfStructure" ? "pr-14" : ""}`}
        />{field === "pfStructure" && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-6 flex items-center text-[10px] text-slate-500">months</span>}</div>}
      </td>)}
    </tr>)}</tbody></table></div> : <div className="px-4 py-8 text-center"><h3 className="text-sm font-semibold text-[#003366]">No site records mapped to this subproject</h3><p className="mt-1 text-xs text-slate-500">The imported file currently covers Commonwealth, Katipunan, North Harbour, Mandaluyong D. Guevara, and Buendia Filmore.</p></div>}
  </section>;
}

function AssigneePicker({ label, members, value, onChange, teamLeadIds = [], disabled = false }: { label: string; members: ProjectMember[]; value: string[]; onChange: (ids: string[]) => void; teamLeadIds?: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = members.filter((member) => value.includes(member.id));
  return <fieldset className="mb-3">
    <legend className="mb-1 text-xs font-semibold text-slate-600">{label}</legend>
    <div className="relative">
      <button type="button" aria-label="Choose assignees" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} className="flex min-h-10 w-full items-center gap-2 border border-slate-300 bg-white px-2 py-1.5 text-left text-xs text-[#003366] hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] disabled:cursor-not-allowed disabled:bg-slate-50">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.length ? selected.map((member) => <span key={member.id} className="inline-flex max-w-full items-center gap-1.5 border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E8EEF4] text-[8px] font-semibold text-[#003366]">{member.profilePicture ? <img src={member.profilePicture} alt="" className="h-full w-full object-cover" /> : member.initials}</span>
            <span className="truncate">{member.name}</span>
          </span>) : <span className="px-1 text-slate-400">Unassigned</span>}
        </span>
        {!disabled && <><span className="shrink-0 text-[10px] font-semibold text-[#31577D]">Assign</span><ChevronDown aria-hidden="true" className={open ? "h-4 w-4 shrink-0 rotate-180 transition-transform" : "h-4 w-4 shrink-0 transition-transform"} /></>}
      </button>
      {open && !disabled && <div role="group" aria-label="Available assignees" className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto border border-slate-200 bg-white p-1 shadow-lg">
        {members.length ? members.map((member) => {
          const checked = value.includes(member.id);
          return <button key={member.id} type="button" aria-pressed={checked} onClick={() => onChange(checked ? value.filter((id) => id !== member.id) : [...value, member.id])} className="flex min-h-9 w-full items-center gap-2 px-2 text-left text-xs text-[#003366] hover:bg-slate-50">
            <span aria-hidden="true" className={checked ? "flex h-4 w-4 shrink-0 items-center justify-center border border-[#003366] bg-[#003366] text-white" : "flex h-4 w-4 shrink-0 items-center justify-center border border-slate-300"}>{checked ? "✓" : ""}</span>
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E8EEF4] text-[8px] font-semibold text-[#003366]">{member.profilePicture ? <img src={member.profilePicture} alt="" className="h-full w-full object-cover" /> : member.initials}</span>
            <span className="min-w-0 flex-1 truncate">{member.name}</span>
            {teamLeadIds.includes(member.id) && <span className="shrink-0 text-[9px] text-slate-500">Team Lead</span>}
          </button>;
        }) : <p className="px-2 py-2 text-[11px] text-slate-500">No project members available.</p>}
      </div>}
    </div>
  </fieldset>;
}

function MemberAvatars({ members, emptyLabel }: { members: ProjectMember[]; emptyLabel: string }) {
  if (members.length === 0) return <span className="truncate text-[10px] text-slate-400">{emptyLabel}</span>;
  return <span className="flex items-center -space-x-2" aria-label={members.map((member) => member.name).join(", ")}>
    {members.slice(0, 5).map((member) => <span key={member.id} title={member.name} className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#E8EEF4] text-[9px] font-semibold text-[#003366] ring-1 ring-slate-200">{member.profilePicture ? <img src={member.profilePicture} alt={member.name} className="h-full w-full object-cover" /> : member.initials}</span>)}
    {members.length > 5 && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-semibold text-slate-600 ring-1 ring-slate-200">+{members.length - 5}</span>}
  </span>;
}

export function ProjectWorkspace({ userId }: { userId?: string }) {
  const pathname = usePathname() || "/projects";
  const router = useRouter();
  const [data, setData] = useState<ProjectData | null>(null);
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);
  const [screen, setScreen] = useState<"gallery" | "project" | "subproject">("gallery");
  const [activeFolderId, setActiveFolderId] = useState("");
  const [activeListId, setActiveListId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingAssigneeListId, setSavingAssigneeListId] = useState<string | null>(null);
  const [assigneeSyncMessage, setAssigneeSyncMessage] = useState("");
  const selectionRequestId = useRef(0);
  const syncRefreshRef = useRef<() => void>(() => undefined);

  const loadProjectSelection = useCallback(async () => {
    const requestId = ++selectionRequestId.current;
    setSelectionError(null);
    const applySelection = (folderIds: string[]) => {
      setSelectedProjectIds(folderIds);
      setSelectionLoaded(true);
    };
    const memorySelection = getBrowserPageCache<{ folderIds: string[] }>(userId, "projects:selection");
    if (memorySelection) applySelection(memorySelection.folderIds || []);
    else setSelectionLoaded(false);
    try {
      const persistedSelection = memorySelection || (userId ? await readBrowserPageCache<{ folderIds: string[] }>(userId, "projects:selection") : undefined);
      if (persistedSelection && !memorySelection && requestId === selectionRequestId.current) applySelection(persistedSelection.folderIds || []);
      const response = await fetch("/api/projects/selection", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Project selection could not be loaded.");
      if (requestId !== selectionRequestId.current) return;
      const folderIds = Array.isArray(payload.folderIds) ? payload.folderIds.map(String) : [];
      applySelection(folderIds);
      if (userId) void writeBrowserPageCache(userId, "projects:selection", { folderIds });
    } catch (loadError) {
      if (requestId !== selectionRequestId.current) return;
      setSelectionError(loadError instanceof Error ? loadError.message : "Project selection could not be loaded.");
      if (!memorySelection) setSelectionLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    void loadProjectSelection();
    return () => { selectionRequestId.current += 1; };
  }, [loadProjectSelection]);

  const fetchGallery = useCallback(async (force = false) => {
    const ownerId = userId || "anonymous";
    const key = "projects:gallery";
    const cacheId = galleryCacheId(ownerId);
    const load = async () => {
      const response = await fetch("/api/tasks?action=project-gallery", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "Unable to load projects."), { status: response.status });
      return { projects: (Array.isArray(payload.projects) ? payload.projects : []) as ProjectCardData[] };
    };
    const cached = galleryClientCache.get(cacheId)?.data ? { projects: galleryClientCache.get(cacheId)!.data } : getBrowserPageCache<{ projects: ProjectCardData[] }>(ownerId, key) || (userId ? await readBrowserPageCache<{ projects: ProjectCardData[] }>(ownerId, key) : undefined);
    if (!force && cached) {
      setProjects(cached.projects);
      galleryClientCache.set(cacheId, { data: cached.projects, updatedAt: Date.now() });
      void refreshBrowserPageQuery(ownerId, key, load).then((fresh) => { if (fresh) { setProjects(fresh.projects); galleryClientCache.set(cacheId, { data: fresh.projects, updatedAt: Date.now() }); } }).catch(() => undefined);
      return cached.projects;
    }
    const fresh = await refreshBrowserPageQuery(ownerId, key, load);
    if (!fresh) throw new Error("Unable to load projects.");
    setProjects(fresh.projects);
    galleryClientCache.set(cacheId, { data: fresh.projects, updatedAt: Date.now() });
    return fresh.projects;
  }, [userId]);

  useEffect(() => {
    if (pathname !== "/projects") return;
    let active = true;
    fetchGallery().then(() => { if (active) setError(null); })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [pathname, fetchGallery]);

  const fetchProject = useCallback(async (folderId: string, force = false): Promise<ProjectData> => {
    const ownerId = userId || "anonymous";
    const queryKey = `project:${folderId}`;
    const cacheId = projectCacheId(ownerId, folderId);
    const load = async () => {
      const response = await fetch(`/api/tasks?action=project-workspace&folderId=${encodeURIComponent(folderId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "Unable to load this project."), { status: response.status });
      return payload as ProjectData;
    };
    let cached = projectClientCache.get(cacheId)?.data || getBrowserPageCache<ProjectData>(ownerId, queryKey);
    if (!cached && userId) cached = await readBrowserPageCache<ProjectData>(ownerId, queryKey);
    if (!force && cached) {
      rememberProjectSyncListIds(cached.lists || []);
      projectClientCache.set(cacheId, { data: cached, updatedAt: Date.now() });
      void refreshBrowserPageQuery(ownerId, queryKey, load).then((fresh) => {
        if (!fresh) return;
        projectClientCache.set(cacheId, { data: fresh, updatedAt: Date.now() });
        void writeBrowserPageCache(ownerId, queryKey, fresh);
        setData((current) => current?.folder.id === folderId ? fresh : current);
      }).catch(() => undefined);
      return cached;
    }
    const projectData = await refreshBrowserPageQuery(ownerId, queryKey, load);
    if (!projectData) throw new Error("Unable to load this project.");
    rememberProjectSyncListIds(projectData.lists || []);
    projectClientCache.set(cacheId, { data: projectData, updatedAt: Date.now() });
    void writeBrowserPageCache(ownerId, queryKey, projectData);
    return projectData;
  }, [userId]);

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean).slice(1);
    if (pathname !== "/projects" && !pathname.startsWith("/projects/")) return;
    if (!selectionLoaded) return;
    if (segments.length === 0) {
      setScreen("gallery");
      setActiveFolderId("");
      setActiveListId("");
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const targetScreen = segments.length > 1 ? "subproject" : "project";
    setScreen(targetScreen);
    setView("overview");
    setError(null);
    const folderFromPath = routeId(segments[0]);
    const cachedEntry = folderFromPath ? projectClientCache.get(projectCacheId(userId, folderFromPath)) : null;
    const cachedData = cachedEntry?.data || null;
    const cachedIsFresh = Boolean(cachedEntry);
    const routeListId = segments.length > 1 ? routeId(segments[1]) : null;
    setTasksLoading(Boolean(segments.length > 1 && (!cachedData?.loadedTaskListIds?.includes(routeListId || "") || !cachedIsFresh)));
    if (cachedData && selectedProjectIds.includes(folderFromPath!)) {
      setData(cachedData);
      setActiveFolderId(folderFromPath!);
      if (routeListId) setActiveListId(routeListId);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    void (async () => {
      try {
        let folderId = folderFromPath;
        if (!folderId) {
          const allProjects = await fetchGallery();
          folderId = matchRouteSegment(allProjects, segments[0])?.id || null;
        }
        if (!folderId || !selectedProjectIds.includes(folderId)) throw new Error("This folder is not included in the shared Projects list.");
        setActiveFolderId(folderId);
        let projectData = await fetchProject(folderId, Boolean(cachedData && !cachedIsFresh));
        if (!active) return;
        if (cachedIsFresh && cachedData) projectData = { ...projectData, tasks: cachedData.tasks, loadedTaskListIds: cachedData.loadedTaskListIds };
        if (segments.length > 1) {
          const listIdFromPath = routeId(segments[1]);
          const subproject = listIdFromPath
            ? projectData.lists.find((list) => list.id === listIdFromPath)
            : matchRouteSegment(projectData.lists, segments[1]);
          if (!subproject) throw new Error("This subproject could not be found in the selected project.");
          setActiveListId(subproject.id);
          setScreen("subproject");
          if (!projectData.loadedTaskListIds?.includes(subproject.id)) {
            const response = await fetch(`/api/tasks?action=project-list-tasks&folderId=${encodeURIComponent(folderId)}&listId=${encodeURIComponent(subproject.id)}`, { cache: "no-store" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Unable to load subproject tasks.");
            projectData = { ...projectData, tasks: [...projectData.tasks.filter((task) => task.listId !== subproject.id), ...(payload.tasks as ProjectTask[])], loadedTaskListIds: [...(projectData.loadedTaskListIds || []), subproject.id] };
            projectClientCache.set(projectCacheId(userId, folderId), { data: projectData, updatedAt: Date.now() });
            if (userId) void writeBrowserPageCache(userId, `project:${folderId}`, projectData);
          }
          setTasksLoading(false);
        } else {
          setActiveListId("");
          setScreen("project");
          setTasksLoading(false);
        }
        if (active) setData(projectData);
      } catch (loadError) {
        if (!active) return;
        if (!cachedData) setError(loadError instanceof Error ? loadError.message : "Unable to load this project.");
        setTasksLoading(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [pathname, selectionLoaded, selectedProjectIds, fetchGallery, fetchProject, userId]);

  useEffect(() => {
    if (screen !== "project" || view !== "calendar" || !data || data.lists.length === 0) return;
    const listIds = data.lists.map((list) => list.id);
    if (listIds.every((id) => data.loadedTaskListIds?.includes(id))) return;
    let active = true;
    void fetch(`/api/tasks?action=project-tasks&folderId=${encodeURIComponent(data.folder.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load project calendar tasks.");
        if (!active) return;
        const nextData = { ...data, tasks: payload.tasks as ProjectTask[], loadedTaskListIds: listIds };
        setData(nextData);
        projectClientCache.set(projectCacheId(userId, data.folder.id), { data: nextData, updatedAt: Date.now() });
        if (userId) void writeBrowserPageCache(userId, `project:${data.folder.id}`, nextData);
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load project calendar tasks."); });
    return () => { active = false; };
  }, [screen, view, data]);

  useEffect(() => {
    if (data) {
      projectClientCache.set(projectCacheId(userId, data.folder.id), { data, updatedAt: Date.now() });
      if (userId) void writeBrowserPageCache(userId, `project:${data.folder.id}`, data);
    }
  }, [data, userId]);

  const updateProjectTask = (changedTask: ProjectTask) => {
    setData((current) => {
      if (!current) return current;
      const exists = current.tasks.some((task) => task.id === changedTask.id);
      return { ...current, tasks: exists ? current.tasks.map((task) => task.id === changedTask.id ? changedTask : task) : [...current.tasks, changedTask] };
    });
  };
  const reloadGalleryData = () => {
    setLoading(true);
    setError(null);
    void loadProjectSelection();
    fetchGallery(true)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load projects."))
      .finally(() => setLoading(false));
  };

  const refreshGallery = () => {
    setLoading(true);
    setError(null);
    void requestCentralClickUpSync().catch((syncError) => {
      setError(syncError instanceof Error ? syncError.message : "Unable to start ClickUp sync.");
      setLoading(false);
    });
  };

  const saveProjectSelection = async (folderIds: string[]) => {
    setSavingSelection(true);
    try {
      const response = await fetch("/api/projects/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Project selection could not be saved.");
      const savedIds = Array.isArray(payload.folderIds) ? payload.folderIds.map(String) : [];
      setSelectedProjectIds(savedIds);
      if (userId) void writeBrowserPageCache(userId, "projects:selection", { folderIds: savedIds });
      setSelectionError(null);
      setSelectionLoaded(true);
      if (activeFolderId && !savedIds.includes(activeFolderId)) router.replace("/projects");
    } finally {
      setSavingSelection(false);
    }
  };

  const openProject = (project: ProjectCardData) => {
    router.push(`/projects/${routeSegment(project.name, project.id)}`);
  };

  const reloadProjectData = () => {
    if (!activeFolderId) return reloadGalleryData();
    setLoading(true);
    setError(null);
    const loadedListIds = data?.loadedTaskListIds || [];
    fetchProject(activeFolderId, true)
      .then(async (freshData) => {
        if (!loadedListIds.length) return freshData;
        let freshTasks: ProjectTask[] = [];
        if (loadedListIds.length >= freshData.lists.length) {
          const response = await fetch(`/api/tasks?action=project-tasks&folderId=${encodeURIComponent(activeFolderId)}`, { cache: "no-store" });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Unable to refresh project tasks.");
          freshTasks = payload.tasks as ProjectTask[];
        } else {
          const responses = await Promise.all(loadedListIds.map(async (listId) => {
            const response = await fetch(`/api/tasks?action=project-list-tasks&folderId=${encodeURIComponent(activeFolderId)}&listId=${encodeURIComponent(listId)}`, { cache: "no-store" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "Unable to refresh subproject tasks.");
            return payload.tasks as ProjectTask[];
          }));
          freshTasks = responses.flat();
        }
        return { ...freshData, tasks: freshTasks, loadedTaskListIds: loadedListIds };
      })
      .then((freshData) => { setData(freshData); projectClientCache.set(projectCacheId(userId, activeFolderId), { data: freshData, updatedAt: Date.now() }); if (userId) void writeBrowserPageCache(userId, `project:${activeFolderId}`, freshData); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load this project."))
      .finally(() => setLoading(false));
  };

  const refreshProject = () => {
    if (!activeFolderId) return refreshGallery();
    setLoading(true);
    setError(null);
    void requestCentralClickUpSync().catch((syncError) => {
      setError(syncError instanceof Error ? syncError.message : "Unable to start ClickUp sync.");
      setLoading(false);
    });
  };

  syncRefreshRef.current = () => {
    if (pathname === "/projects") reloadGalleryData();
    else if (activeFolderId) reloadProjectData();
  };
  useEffect(() => {
    const refreshAfterSync = (event: Event) => { trackClickUpLiveRefresh(event, async () => { await syncRefreshRef.current(); }, "Projects"); };
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
  }, []);

  const saveDefaultAssignees = async (listId: string, assigneeIds: string[]) => {
    if (!data) return;
    setSavingAssigneeListId(listId);
    setError(null);
    setAssigneeSyncMessage("");
    try {
      const response = await fetch("/api/projects/assignees", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: data.folder.id, listId, listName: data.lists.find((list) => list.id === listId)?.name, leadName: data.members.find((member) => member.id === assigneeIds[0])?.name, assigneeIds }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Default assignee could not be saved.");
      const taskIds = new Set<string>(Array.isArray(payload.taskIds) ? payload.taskIds.map(String) : []);
      const lead = data.members.find((member) => member.id === assigneeIds[0]);
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          defaultAssignees: { ...current.defaultAssignees, [listId]: assigneeIds },
          accessByListId: { ...current.accessByListId, [listId]: { leadId: assigneeIds[0] || "", isAdmin: Boolean(current.isProjectAdmin), canEdit: Boolean(current.isProjectAdmin || current.currentUserId === assigneeIds[0]) } },
          tasks: lead ? current.tasks.map((task) => task.listId === listId && taskIds.has(task.id) && !task.assignees.some((person) => person.id === lead.id)
            ? { ...task, assignees: [...task.assignees, lead] }
            : task) : current.tasks,
        };
      });
      if (assigneeIds.length) setAssigneeSyncMessage(payload.failedCount ? `Lead saved. Assigned to ${payload.assignedCount} existing tasks; ${payload.alreadyAssignedCount} already had this lead, and ${payload.failedCount} could not be updated.` : `Lead assigned to ${payload.assignedCount} existing tasks. ${payload.alreadyAssignedCount} already had this lead.`);
      else setAssigneeSyncMessage("Default lead cleared. Existing task assignments were kept.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Default assignee could not be saved.");
    } finally {
      setSavingAssigneeListId(null);
    }
  };

  const returnToProjects = () => {
    router.push("/projects");
  };

  const openSubproject = (listId: string) => {
    const project = data?.folder;
    const list = data?.lists.find((item) => item.id === listId);
    if (!project || !list) return;
    router.push(`/projects/${routeSegment(project.name, project.id)}/${routeSegment(list.name, list.id)}`);
  };

  const tasksByList = useMemo(() => {
    const groups = new Map<string, ProjectTask[]>();
    for (const list of data?.lists || []) groups.set(list.id, []);
    for (const task of data?.tasks || []) groups.get(task.listId)?.push(task);
    return groups;
  }, [data]);

  const tasks = data?.tasks || [];
  const subprojectGroups = new Map<string, { assignee: ProjectMember | null; lists: ProjectList[] }>();
  for (const list of data?.lists || []) {
    const assigneeId = data?.defaultAssignees[list.id]?.[0];
    const assignee = data?.members.find((member) => member.id === assigneeId) || null;
    const key = assignee?.id || "unassigned";
    const group = subprojectGroups.get(key) || { assignee, lists: [] };
    group.lists.push(list);
    subprojectGroups.set(key, group);
  }
  const orderedSubprojectGroups = [...subprojectGroups.entries()].sort(([keyA, groupA], [keyB, groupB]) => {
    if (keyA === "unassigned") return 1;
    if (keyB === "unassigned") return -1;
    return (groupA.assignee?.name || "").localeCompare(groupB.assignee?.name || "") || keyA.localeCompare(keyB);
  });
  if (screen === "gallery") return <ProjectGallery projects={projects} selectedProjectIds={selectedProjectIds} selectionLoaded={selectionLoaded} selectionError={selectionError} loading={loading} error={error} savingSelection={savingSelection} onRefresh={refreshGallery} onOpen={openProject} onSaveSelection={saveProjectSelection} />;

  const activeList = data?.lists.find((list) => list.id === activeListId);
  if (screen === "subproject") {
    const routeSegments = pathname.split("/").filter(Boolean).slice(1);
    const routedTab = routeSegments[2];
    const initialView = routedTab === "tasks" || routedTab === "calendar" || routedTab === "contract-review" || routedTab === "sites" || routedTab === "documentation" ? routedTab : "dashboard";
    const initialReviewId = routedTab === "contract-review" ? routeSegments[3] : undefined;
    const basePath = data && activeList ? `/projects/${routeSegment(data.folder.name, data.folder.id)}/${routeSegment(activeList.name, activeList.id)}` : "";
    const access = data?.accessByListId?.[activeListId];
    const canManageLead = Boolean(data?.isProjectAdmin);
    const canEdit = Boolean(access?.canEdit);
    if (data && activeList) return <SubprojectWorkspace folderId={data.folder.id} folderUrl={data.folder.url} list={activeList} tasks={tasksByList.get(activeList.id) || []} members={data.members} defaultAssignees={data.defaultAssignees[activeList.id] || []} canEdit={canEdit} canManageLead={canManageLead} onAssign={(ids) => void saveDefaultAssignees(activeList.id, ids)} savingAssignees={savingAssigneeListId === activeList.id} assigneeSyncMessage={assigneeSyncMessage} onBack={() => router.push(`/projects/${routeSegment(data.folder.name, data.folder.id)}`)} onRefresh={refreshProject} tasksLoading={tasksLoading} onTaskChange={updateProjectTask} basePath={basePath} initialView={initialView} initialReviewId={initialReviewId} userId={userId} />;
    return <section className="mx-auto w-full max-w-[1440px] space-y-3 pb-8"><LoadingSkeleton variant="subproject" /></section>;
  }

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-3 pb-8">
      <ProjectPageHeader eyebrow="Project workspace" title={data?.folder.name || "Project"} onBack={returnToProjects} actions={<>
        <ProjectActionButton onClick={refreshProject} disabled={loading} label="Refresh project"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></ProjectActionButton>
        <ClickUpLink href={data?.folder.url || PROJECT_URL} label="Open project in ClickUp" />
    </>} />
    {assigneeSyncMessage && <p role="status" className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{assigneeSyncMessage}</p>}
      <div role="tablist" aria-label={`${data?.folder.name || "Project"} workspace views`} className="flex border-b border-slate-200">
    {([{ id: "overview", label: "Overview" }, { id: "calendar", label: "Calendar" }, { id: "activity", label: "Activity" }, { id: "map", label: "Map" }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={`inline-flex min-h-9 items-center gap-2 border-b-2 px-3 text-xs font-semibold ${view === tab.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]"}`}>{tab.id === "calendar" ? <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" /> : tab.id === "map" ? <MapPin aria-hidden="true" className="h-3.5 w-3.5" /> : tab.id === "activity" ? <Activity aria-hidden="true" className="h-3.5 w-3.5" /> : null}{tab.label}</button>)}
      </div>
      {loading && !data ? <LoadingSkeleton variant="project" />
        : error ? <div role="alert" className="border border-amber-300 bg-[#FFFCFB] p-6"><h2 className="text-sm font-semibold text-[#003366]">Project data could not be loaded</h2><p className="mt-2 text-sm leading-6 text-slate-700">{error}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={refreshProject} className="inline-flex min-h-11 items-center gap-2 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-white hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">Try again <RefreshCw aria-hidden="true" className="h-4 w-4" /></button><a href="/api/auth/login" className="inline-flex min-h-11 items-center gap-2 border border-slate-300 bg-white px-4 text-xs font-semibold text-[#003366] hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">Sign in with ClickUp <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a></div></div>
        : data && view === "overview" ? <section aria-label="Subprojects" className="border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-[#003366]">Subprojects</h2><p className="mt-0.5 text-[11px] text-slate-500">Open a subproject workspace to see its tasks and team schedule.</p></div>
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[1040px] grid-cols-4 items-start gap-3">
              {orderedSubprojectGroups.map(([key, group]) => <section key={key} aria-labelledby={`subproject-group-${key}`}>
              <header className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                <h3 id={`subproject-group-${key}`} className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#003366]">
                  {group.assignee && <MemberAvatars members={[group.assignee]} emptyLabel="" />}
                  <span className="truncate text-lg">{group.assignee?.name || "Unassigned"}</span>
                </h3>
                <span className="shrink-0 text-[10px] text-slate-500">{group.lists.length} subproject{group.lists.length === 1 ? "" : "s"}</span>
              </header>
              <div className="flex flex-col gap-2">
                {group.lists.map((list) => {
                  const listTasks = tasksByList.get(list.id) || [];
                  const listTasksLoaded = Boolean(data.loadedTaskListIds?.includes(list.id));
                  const listDone = listTasks.filter(isComplete).length;
                  const listProgress = listTasks.length ? Math.round((listDone / listTasks.length) * 100) : 0;
                  const taskCount = listTasksLoaded ? listTasks.filter((task) => !isComplete(task)).length : list.taskCount;
                  return <article key={list.id} className="border border-slate-200 bg-white p-3 transition-colors hover:border-[#C9A84C]">
                    <button type="button" onClick={() => openSubproject(list.id)} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">
                      <span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold text-[#003366]">{list.name}</span><span className="shrink-0 text-[10px] text-slate-500">{taskCount === null ? "Open to load tasks" : `${taskCount} open tasks`}</span></span>
                      <span className="mt-2 block h-1.5 bg-slate-100"><span className="block h-full bg-[#C9A84C]" style={{ width: `${listTasksLoaded ? listProgress : 0}%` }} /></span>
                      <span className="mt-2 block text-[10px] text-slate-500">{listTasksLoaded ? `${listProgress}% complete` : "Progress loads when opened"}</span>
                    </button>
                    <div className="mt-3 flex justify-end border-t border-slate-100 pt-2"><button type="button" onClick={() => openSubproject(list.id)} className="inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-[#31577D] hover:text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">Open workspace <ArrowUpRight className="h-3 w-3" /></button></div>
                  </article>;
                })}
              </div>
              </section>)}
            </div>
          </div>
          {data.lists.length === 0 && <p className="p-5 text-sm text-slate-600">No subprojects are included in this project yet.</p>}
        </section>
          : data && view === "calendar" ? <CalendarView folderId={data.folder.id} tasks={tasks} lists={data.lists} members={data.members} defaultAssignees={data.defaultAssignees} onTaskChange={updateProjectTask} loadingTasks={data.lists.some((list) => !data.loadedTaskListIds?.includes(list.id))} canEdit />
          : data && view === "activity" ? <ProjectActivityFeed folderId={data.folder.id} lists={data.lists} userId={userId} />
            : data && view === "map" ? <div className="h-[min(76vh,900px)] min-h-[560px] overflow-hidden border border-slate-200"><EmbeddedAtlasWorkspace workspaceType="mosaic_project" mosaicProjectId={data.folder.id} workspaceName={data.folder.name} /></div> : null}
    </section>
  );
}

function Metric({ label, value, icon, progress }: { label: string; value: string; icon: ReactNode; progress?: number | null }) {
  return <div className="border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div><p className="mt-3 text-2xl font-semibold tabular-nums text-[#003366]">{value}</p>{progress !== undefined && <div className="mt-3 h-1.5 bg-slate-100"><div className="h-full bg-[#C9A84C] transition-[width]" style={{ width: `${progress}%` }} /></div>}</div>;
}
