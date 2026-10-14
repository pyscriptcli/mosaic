"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearBrowserPageCache, readBrowserPageCache, writeBrowserPageCache } from "@/lib/browserPageCache";
import { requestCentralClickUpSync, trackClickUpLiveRefresh } from "@/lib/clickupSyncClient";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";

type CategoryKey = "client" | "admin" | "adhoc" | "meetings";

export interface NotebookActivityHistoryEntry {
  id: string;
  name: string;
  date: string;
  url: string;
  member: { id: string; name: string };
  categories: Record<CategoryKey, string>;
}

export interface NotebookActivityHistory {
  start: string;
  end: string;
  isCurrentUser: boolean;
  entries: NotebookActivityHistoryEntry[];
}

interface NotebookMember {
  id: string;
  name: string;
  email: string;
  initials: string;
  profilePicture: string | null;
  months?: string[];
}

interface NotebookEntry extends NotebookActivityHistoryEntry {
  status: string;
  member: NotebookMember;
  hasContent: boolean;
  dailyTasks?: Array<{ id: string; name: string; status: string; completed: boolean; dueDate: string; url: string }>;
}

interface NotebookPayload {
  listId: string;
  entries: NotebookEntry[];
  members: NotebookMember[];
  fetchedAt: string;
  warning?: string;
}

const CATEGORY_META: Array<{ key: CategoryKey; label: string }> = [
  { key: "client", label: "Client" },
  { key: "admin", label: "Admin" },
  { key: "adhoc", label: "Ad hoc" },
  { key: "meetings", label: "Meetings" },
];

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return fromIso(value).toLocaleDateString("en-US", options || {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function shiftDate(value: string, days: number) {
  const date = fromIso(value);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function startOfWeek(value: string) {
  const date = fromIso(value);
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + offset);
  return localIso(date);
}

function itemsFromText(value: string) {
  const cleaned = value.replace(/\r/g, "").trim();
  if (!cleaned) return [];
  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => line.replace(/^[•●▪◦*-]\s*/, "").replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
}

function formatTaskList(value: string) {
  return itemsFromText(value).map((item) => `• ${item}`).join("\n");
}

function weekdaysInRange(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const today = localIso(new Date());
  if (start > today) return [];
  const finalDate = end > today ? today : end;
  const days: string[] = [];
  for (let date = start; date <= finalDate; date = shiftDate(date, 1)) {
    const day = fromIso(date).getDay();
    if (day !== 0 && day !== 6) days.push(date);
  }
  return days;
}

function presetRange(preset: "this-week" | "last-week" | "this-month" | "last-month") {
  const today = localIso(new Date());
  if (preset === "this-week") return { start: startOfWeek(today), end: today };
  if (preset === "last-week") {
    const lastWeekEnd = shiftDate(startOfWeek(today), -1);
    return { start: startOfWeek(lastWeekEnd), end: lastWeekEnd };
  }
  const current = fromIso(today);
  if (preset === "this-month") return { start: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`, end: today };
  const lastMonth = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  const end = new Date(current.getFullYear(), current.getMonth(), 0);
  return { start: localIso(lastMonth), end: localIso(end) };
}

function MemberAvatar({ member }: { member: NotebookMember }) {
  if (member.profilePicture) {
    return <img src={member.profilePicture} alt="" className="w-8 h-8 object-cover border border-[#C9AB4C]/60 shrink-0" />;
  }
  return (
    <span className="w-8 h-8 bg-[#003366] text-white flex items-center justify-center text-xs font-bold shrink-0">
      {member.initials || member.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function NotebookView({ currentUserName, userId, initialDate, initialTab = "today", hideViewTabs = false, hidePageTitle = false, onOpenDay, onActivityHistoryLoad }: {
  currentUserName?: string;
  userId?: string;
  initialDate?: string;
  initialTab?: "today" | "week" | "insights";
  hideViewTabs?: boolean;
  hidePageTitle?: boolean;
  onOpenDay?: (date: string) => void;
  onActivityHistoryLoad?: (history: NotebookActivityHistory | null) => void;
}) {
  const today = localIso(new Date());
  const [activeTab, setActiveTab] = useState<"today" | "week" | "insights">(initialTab);
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [insightMemberId, setInsightMemberId] = useState("all");
  const [rangePreset, setRangePreset] = useState<"this-week" | "last-week" | "this-month" | "last-month" | "custom">("this-month");
  const initialRange = presetRange("this-month");
  const [rangeStart, setRangeStart] = useState(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState(initialRange.end);
  const [draftCategories, setDraftCategories] = useState<Record<CategoryKey, string>>({ client: "", admin: "", adhoc: "", meetings: "" });
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [payload, setPayload] = useState<NotebookPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetGenMonth, setTargetGenMonth] = useState(() => today.slice(0, 7));
  const [generatingMonth, setGeneratingMonth] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState("");
  const [generateFeedback, setGenerateFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const notebookRequestVersion = useRef(0);
  const loadedCurrentUserRange = useRef("");
  const onActivityHistoryLoadRef = useRef(onActivityHistoryLoad);
  onActivityHistoryLoadRef.current = onActivityHistoryLoad;

  useEffect(() => {
    setTargetGenMonth(selectedDate.slice(0, 7));
  }, [selectedDate]);

  const requestedMemberId = activeTab === "insights"
    ? insightMemberId === "all" ? "" : insightMemberId
    : selectedMemberId;
  const requestCurrentUser = activeTab !== "insights" && !requestedMemberId;
  const loadNotebook = async (background = Boolean(payload)) => {
    const requestVersion = ++notebookRequestVersion.current;
    const cacheKey = `notebook:${rangeStart}:${rangeEnd}:${requestedMemberId || (requestCurrentUser ? "current" : "all")}`;
    if (!background) setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ start: rangeStart, end: rangeEnd });
      if (background) query.set("liveRefresh", "1");
      if (requestedMemberId) query.set("memberId", requestedMemberId);
      else if (requestCurrentUser) query.set("currentUser", "1");
      const response = await fetch(`/api/notebook?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || "Unable to load the daily log."), { status: response.status });
      if (requestVersion !== notebookRequestVersion.current) return;
      setPayload(body);
      if (requestCurrentUser) loadedCurrentUserRange.current = `${rangeStart}:${rangeEnd}`;
      onActivityHistoryLoadRef.current?.({
        start: rangeStart,
        end: rangeEnd,
        isCurrentUser: requestCurrentUser || Boolean(userId && requestedMemberId === userId),
        entries: body.entries || [],
      });
      if (userId) void writeBrowserPageCache(userId, cacheKey, body as NotebookPayload);
    } catch (loadError) {
      if (requestVersion !== notebookRequestVersion.current) return;
      if (!payload) onActivityHistoryLoadRef.current?.(null);
      if (userId && loadError && typeof loadError === "object" && "status" in loadError && [401, 403].includes(Number(loadError.status))) await clearBrowserPageCache(userId);
      setError(loadError instanceof Error ? loadError.message : "Unable to load the daily log.");
      if (background) throw loadError;
    } finally {
      if (requestVersion === notebookRequestVersion.current) setLoading(false);
    }
  };
  const loadNotebookRef = useRef(loadNotebook);
  useEffect(() => { loadNotebookRef.current = loadNotebook; });

  const requestNotebookRefresh = async () => {
    setError("");
    try {
      await requestCentralClickUpSync();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to start ClickUp refresh.");
    }
  };

  useEffect(() => {
    let active = true;
    if (requestedMemberId && userId && requestedMemberId === userId && loadedCurrentUserRange.current === `${rangeStart}:${rangeEnd}`) return;
    void (async () => {
      const cacheKey = `notebook:${rangeStart}:${rangeEnd}:${requestedMemberId || (requestCurrentUser ? "current" : "all")}`;
      const cached = userId ? await readBrowserPageCache<NotebookPayload>(userId, cacheKey) : undefined;
      if (cached && active) { setPayload(cached); setLoading(false); }
      if (active) await loadNotebook(Boolean(cached));
    })();
    return () => { active = false; };
  }, [userId, rangeStart, rangeEnd, requestedMemberId, requestCurrentUser]);

  useEffect(() => {
    const refreshAfterSync = (event: Event) => { trackClickUpLiveRefresh(event, () => loadNotebookRef.current(true), "Daily Log"); };
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
  }, []);

  useEffect(() => {
    if (!payload?.members.length || selectedMemberId) return;
    const current = currentUserName?.toLowerCase().trim();
    const matched = payload.members.find((member) => member.name.toLowerCase().trim() === current);
    setSelectedMemberId((matched || payload.members[0]).id);
  }, [payload, selectedMemberId, currentUserName]);

  const member = payload?.members.find((item) => item.id === selectedMemberId) || payload?.members[0];
  const entries = payload?.entries || [];

  const selectedDayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate && entry.member.id === member?.id),
    [entries, selectedDate, member?.id],
  );
  const selectedDayEntry = selectedDayEntries[0];

  useEffect(() => {
    const source = selectedDayEntry?.categories || { client: "", admin: "", adhoc: "", meetings: "" };
    setDraftCategories({
      client: formatTaskList(source.client),
      admin: formatTaskList(source.admin),
      adhoc: formatTaskList(source.adhoc),
      meetings: formatTaskList(source.meetings),
    });
    setIsDirty(false);
    setLastSaved(null);
    setSaveWarning("");
  }, [selectedDayEntry?.id, selectedDate, member?.id]);

  const workdays = useMemo(() => weekdaysInRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  const completenessRows = useMemo(() => (payload?.members || []).map((person) => {
    const personEntries = entries.filter((entry) => entry.member.id === person.id && entry.date >= rangeStart && entry.date <= rangeEnd);
    const byDate = new Map<string, NotebookEntry[]>();
    personEntries.forEach((entry) => byDate.set(entry.date, [...(byDate.get(entry.date) || []), entry]));
    const submittedDates = workdays.filter((date) => (byDate.get(date) || []).some((entry) => entry.hasContent));
    const emptyDates = workdays.filter((date) => byDate.has(date) && !(byDate.get(date) || []).some((entry) => entry.hasContent));
    const emptyDays = workdays.filter((date) => !byDate.has(date));
    return {
      member: person,
      submittedDates,
      emptyDates,
      emptyDays,
      percent: workdays.length ? Math.round((submittedDates.length / workdays.length) * 100) : 0,
      byDate,
    };
  }), [payload?.members, entries, rangeStart, rangeEnd, workdays]);

  const activeRows = completenessRows.filter((row) => row.byDate.size > 0 || row.member.months?.some((month) => month >= rangeStart.slice(0, 7) && month <= rangeEnd.slice(0, 7)));
  const displayedRows = activeRows.length ? activeRows : completenessRows;
  const filteredRows = (insightMemberId === "all" ? displayedRows : displayedRows.filter((row) => row.member.id === insightMemberId)).slice().sort((left, right) => right.percent - left.percent || left.member.name.localeCompare(right.member.name));
  const expectedLogs = workdays.length * filteredRows.length;
  const submittedLogs = filteredRows.reduce((sum, row) => sum + row.submittedDates.length, 0);
  const emptyDayLogs = filteredRows.reduce((sum, row) => sum + row.emptyDays.length, 0);
  const averageCompleteness = expectedLogs ? Math.round((submittedLogs / expectedLogs) * 100) : 0;

  const monthCategoryTotals = CATEGORY_META.map((category) => ({
    ...category,
    count: entries
      .filter((entry) => entry.date >= rangeStart && entry.date <= rangeEnd && (insightMemberId === "all" || entry.member.id === insightMemberId))
      .reduce((sum, entry) => sum + itemsFromText(entry.categories[category.key]).length, 0),
  }));
  const maxCategoryTotal = Math.max(1, ...monthCategoryTotals.map((category) => category.count));

  const previousDay = () => setSelectedDate((value) => shiftDate(value, -1));
  const nextDay = () => setSelectedDate((value) => shiftDate(value, 1));

  const applyPreset = (preset: "this-week" | "last-week" | "this-month" | "last-month" | "custom") => {
    setRangePreset(preset);
    if (preset === "custom") return;
    const range = presetRange(preset);
    setRangeStart(range.start);
    setRangeEnd(range.end);
  };

  const saveDailyLog = useCallback(async () => {
    if (!member) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/notebook", {
        method: selectedDayEntry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedDayEntry ? { taskId: selectedDayEntry.id, currentStatus: selectedDayEntry.status, categories: draftCategories } : { date: selectedDate, member: { id: member.id, name: member.name }, categories: draftCategories }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to save the daily log.");
      setSaveWarning(typeof body.warning === "string" ? body.warning : "");
      setIsDirty(false);
      setLastSaved(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      await loadNotebook();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the daily log.");
    } finally {
      setSaving(false);
    }
  }, [draftCategories, member, selectedDate, selectedDayEntry]);

  useEffect(() => {
    if (!isDirty || saving || deleting) return;
    const timer = window.setTimeout(() => { void saveDailyLog(); }, 850);
    return () => window.clearTimeout(timer);
  }, [draftCategories, isDirty, saving, deleting, saveDailyLog]);

  const updateCategory = (key: CategoryKey, value: string) => {
    setDraftCategories((current) => ({ ...current, [key]: value }));
    setSaveWarning("");
    setIsDirty(true);
  };

  const handleTaskListKeyDown = (key: CategoryKey, event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const field = event.currentTarget;
    const value = draftCategories[key];
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = `${value.slice(0, start)}\n• ${value.slice(end)}`;
    updateCategory(key, next);
    requestAnimationFrame(() => {
      const cursor = start + 3;
      field.setSelectionRange(cursor, cursor);
    });
  };

  const normalizeCategory = (key: CategoryKey) => {
    const normalized = formatTaskList(draftCategories[key]);
    if (normalized !== draftCategories[key]) updateCategory(key, normalized);
  };

  const deleteDailyLog = async () => {
    if (!selectedDayEntry || !confirm(`Delete ${formatDate(selectedDate)} from the Daily Log?`)) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/notebook?taskId=${encodeURIComponent(selectedDayEntry.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to delete the daily log.");
      await loadNotebook();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the daily log.");
    } finally {
      setDeleting(false);
    }
  };

  const availableMonths = useMemo(() => {
    const list: Array<{ value: string; label: string }> = [];
    const base = new Date();
    for (let i = -6; i <= 2; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      list.push({ value: val, label });
    }
    if (targetGenMonth && !list.some((item) => item.value === targetGenMonth)) {
      const [y, m] = targetGenMonth.split("-").map(Number);
      if (y && m) {
        const d = new Date(y, m - 1, 1);
        list.push({
          value: targetGenMonth,
          label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        });
        list.sort((a, b) => a.value.localeCompare(b.value));
      }
    }
    return list;
  }, [targetGenMonth]);

  const monthStats = useMemo(() => {
    if (!targetGenMonth || !member) return { totalWeekdays: 0, existingCount: 0, missingCount: 0, monthName: "" };
    const [year, month] = targetGenMonth.split("-").map(Number);
    if (!year || !month) return { totalWeekdays: 0, existingCount: 0, missingCount: 0, monthName: "" };

    const totalDays = new Date(year, month, 0).getDate();
    let weekdays = 0;
    const weekdaySet = new Set<string>();
    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month - 1, d, 12, 0, 0);
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        weekdays++;
        weekdaySet.add(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      }
    }

    const memberMonthEntries = entries.filter(
      (e) => e.member.id === member.id && weekdaySet.has(e.date),
    );
    const existingDates = new Set(memberMonthEntries.map((e) => e.date));
    const existingCount = existingDates.size;
    const missingCount = Math.max(0, weekdays - existingCount);
    const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    return { totalWeekdays: weekdays, existingCount, missingCount, monthName };
  }, [targetGenMonth, member, entries]);

  const handleGenerateMonthTasks = async () => {
    if (!member || generatingMonth) return;
    setGeneratingMonth(true);
    setGenerateFeedback(null);
    setGeneratingProgress("Preparing ClickUp tasks…");
    let totalCreated = 0;
    let iterations = 0;
    const maxIterations = 15;
    try {
      while (iterations < maxIterations) {
        iterations++;
        const response = await fetch("/api/notebook/generate-month", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: targetGenMonth,
            member: { id: member.id, name: member.name },
            limit: 5,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate monthly tasks.");
        }
        totalCreated += data.createdCount || 0;
        const remaining = data.remainingCount ?? 0;

        if (remaining > 0 && data.createdCount > 0) {
          setGeneratingProgress(`Created ${totalCreated} tasks… (${remaining} remaining)`);
          // Brief pause between batches
          await new Promise((r) => setTimeout(r, 600));
        } else {
          break;
        }
      }

      if (totalCreated === 0) {
        setGenerateFeedback({
          type: "success",
          text: `All weekday tasks already exist in ClickUp for ${monthStats.monthName}.`,
        });
      } else {
        setGenerateFeedback({
          type: "success",
          text: `Successfully created ${totalCreated} weekday placeholder task${totalCreated === 1 ? "" : "s"} for ${monthStats.monthName}!`,
        });
      }
      await loadNotebook();
    } catch (genErr) {
      setGenerateFeedback({
        type: "error",
        text: genErr instanceof Error ? genErr.message : "Unable to generate tasks.",
      });
    } finally {
      setGeneratingMonth(false);
      setGeneratingProgress("");
    }
  };

  if (loading && !payload) {
    return (
      <div className="min-h-[460px] flex items-center justify-center text-[#003366]">
        <div className="flex items-center gap-3 text-sm font-semibold"><Loader2 className="animate-spin" size={20} /> Loading team notebook…</div>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-[#FFFCFB] border border-red-200 p-7 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={26} />
        <h1 className="text-xl">Notebook unavailable</h1>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
        <button type="button" onClick={() => void requestNotebookRefresh()} className="btn-outline mt-5 inline-flex items-center gap-2"><RefreshCw size={14} /> Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-4 border-b border-gray-200/90">
        {!hidePageTitle && <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-serif font-bold text-[#003366] italic">Notebook</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Review your daily activity and team logging progress.</p>
        </div>}
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab !== "insights" && payload && payload.members.length > 0 && (
            <select
              value={member?.id || ""}
              onChange={(event) => setSelectedMemberId(event.target.value)}
              aria-label="Team member"
              className="h-10 min-w-52 bg-[#FFFCFB] border border-gray-300 px-3 text-sm text-[#1b1d1e] focus:outline-none focus:border-[#C9AB4C]"
            >
              {payload.members.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={() => void requestNotebookRefresh()}
            disabled={loading}
            className="h-10 px-3 bg-[#FFFCFB] border border-gray-300 text-[#003366] text-sm font-semibold flex items-center gap-2 hover:border-[#C9AB4C] disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-[#FFFCFB] border border-gray-200 shadow-2xs p-2 flex items-center justify-between gap-3 flex-wrap">
        {!hideViewTabs && <div className="inline-flex border border-gray-200 bg-[#FFFCFB]" role="tablist" aria-label="Notebook views">
          {([
            ["today", "Today"],
            ["week", "Daily activity"],
            ["insights", "Dashboard"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`h-10 px-5 text-sm font-semibold border-r last:border-r-0 border-gray-200 transition-colors ${
                activeTab === id ? "bg-[#003366] text-white shadow-[inset_0_-2px_0_#C9AB4C]" : "bg-[#FFFCFB] text-gray-500 hover:text-[#003366] hover:bg-[#FFFCFB]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>}

        {activeTab === "insights" ? (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500"><span className="hidden 2xl:inline">View</span><select value={insightMemberId} onChange={(event) => setInsightMemberId(event.target.value)} aria-label="Insight team member" className="h-10 min-w-52 bg-[#FFFCFB] border border-gray-300 px-3 text-sm font-medium normal-case tracking-normal text-[#1b1d1e] focus:outline-none focus:border-[#C9AB4C]">
              <option value="all">All team members</option>
              {(payload?.members || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></label>
            <select value={rangePreset} onChange={(event) => applyPreset(event.target.value as "this-week" | "last-week" | "this-month" | "last-month" | "custom")} aria-label="Reporting range preset" className="h-10 bg-[#003366] border border-[#003366] px-3 text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-[#C9AB4C]">
              <option value="this-week">This week</option>
              <option value="last-week">Last week</option>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="custom">Custom range</option>
            </select>
            <input type="date" value={rangeStart} onChange={(event) => { setRangePreset("custom"); setRangeStart(event.target.value); }} aria-label="Reporting range start" className="h-10 bg-[#FFFCFB] border border-gray-300 px-3 text-sm focus:outline-none focus:border-[#C9AB4C]" />
            <span className="text-sm text-gray-500">to</span>
            <input type="date" value={rangeEnd} onChange={(event) => { setRangePreset("custom"); setRangeEnd(event.target.value); }} aria-label="Reporting range end" className="h-10 bg-[#FFFCFB] border border-gray-300 px-3 text-sm focus:outline-none focus:border-[#C9AB4C]" />
          </div>
        ) : activeTab === "week" ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select value={rangePreset} onChange={(event) => applyPreset(event.target.value as "this-week" | "last-week" | "this-month" | "last-month" | "custom")} aria-label="Activity period" className="h-10 bg-[#003366] border border-[#003366] px-3 text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-[#C9A84C]">
              <option value="this-week">This week</option><option value="last-week">Last week</option><option value="this-month">This month</option><option value="last-month">Last month</option><option value="custom">Custom range</option>
            </select>
            <input type="date" value={rangeStart} onChange={(event) => { setRangePreset("custom"); setRangeStart(event.target.value); }} aria-label="Activity start date" className="h-10 bg-[#FFFCFB] border border-gray-300 px-3 text-sm focus:outline-none focus:border-[#C9AB4C]" />
            <span className="text-sm text-gray-500">to</span>
            <input type="date" value={rangeEnd} onChange={(event) => { setRangePreset("custom"); setRangeEnd(event.target.value); }} aria-label="Activity end date" className="h-10 bg-[#FFFCFB] border border-gray-300 px-3 text-sm focus:outline-none focus:border-[#C9AB4C]" />
          </div>
        ) : (
          <div className="flex items-center bg-[#FFFCFB] border border-gray-300">
            <button type="button" onClick={previousDay} aria-label="Previous day" className="w-10 h-10 grid place-items-center text-gray-500 hover:text-[#003366] hover:bg-[#FFFCFB]"><ChevronLeft size={17} /></button>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-10 border-x border-y-0 border-gray-300 px-3 text-sm text-[#1b1d1e] focus:outline-none" />
            <button type="button" onClick={nextDay} aria-label="Next day" className="w-10 h-10 grid place-items-center text-gray-500 hover:text-[#003366] hover:bg-[#FFFCFB]"><ChevronRight size={17} /></button>
          </div>
        )}
      </div>

      {error && <div className="border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">Showing the last loaded data. Refresh failed: {error}</div>}
      {payload?.warning && <div role="status" className="border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">{payload.warning}</div>}

      {activeTab === "today" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {CATEGORY_META.map((category) => {
              const count = itemsFromText(draftCategories[category.key]).length;
              return (
                <div key={category.key} className="bg-[#FFFCFB] border border-gray-200 p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{category.label}</div>
                  <div className="text-3xl font-serif font-bold text-[#003366] mt-2">{count}</div>
                  <div className="text-xs text-gray-500 mt-1">recorded item{count === 1 ? "" : "s"}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-8">
              <div className="flex items-end justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-xl">{formatDate(selectedDate)}</h2>
                  <p className="text-sm text-gray-500 mt-1">{member?.name || "Team member"}</p>
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 border ${selectedDayEntries.some((entry) => entry.hasContent) ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                  {selectedDayEntries.some((entry) => entry.hasContent) ? "Log submitted" : "No completed log"}
                </span>
              </div>

              <div className="bg-[#FFFCFB] border border-gray-200 divide-y divide-gray-200">
                {CATEGORY_META.map((category) => {
                  return (
                    <div key={category.key} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 p-4 sm:p-5">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#003366] pt-0.5">{category.label}</div>
                      <textarea
                        value={draftCategories[category.key]}
                        onChange={(event) => updateCategory(category.key, event.target.value)}
                        onKeyDown={(event) => handleTaskListKeyDown(category.key, event)}
                        onBlur={() => normalizeCategory(category.key)}
                        placeholder={`• Log ${category.label.toLowerCase()} work`}
                        rows={3}
                        className="w-full border border-gray-200 bg-[#FFFCFB]/70 px-3 py-2 text-sm text-gray-700 leading-relaxed resize-y focus:outline-none focus:border-[#C9AB4C] focus:bg-[#FFFCFB]"
                      />
                    </div>
                  );
                })}
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3 bg-[#FFFCFB]/70">
                  <div><p className="text-xs text-gray-500">Press Enter for another bullet. Changes save automatically after you pause typing.</p>{saveWarning && <p role="status" className="mt-1 text-xs text-amber-700">{saveWarning}</p>}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedDayEntry && <button type="button" onClick={deleteDailyLog} disabled={deleting || saving} className="h-10 px-3 border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-2"><Trash2 size={15} /> Delete</button>}
                    <span className={`text-xs font-semibold ${saving || isDirty ? "text-[#003366]" : "text-emerald-700"}`}>{saving ? "Saving…" : isDirty ? "Autosave pending" : lastSaved ? `Saved ${lastSaved}` : "Autosave on"}</span>
                    <button type="button" onClick={saveDailyLog} disabled={saving || deleting || !isDirty} className="h-10 px-4 bg-[#003366] text-white text-sm font-semibold hover:bg-[#002244] disabled:opacity-50 inline-flex items-center gap-2"><Save size={15} /> Save now</button>
                  </div>
                </div>
              </div>
              <section className="mt-4 border border-gray-200 bg-[#FFFCFB] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-serif italic text-[#003366]">My Day tasks</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{selectedDayEntry?.dailyTasks?.length || 0} item{(selectedDayEntry?.dailyTasks?.length || 0) === 1 ? "" : "s"}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Tasks created in My Day appear in that day’s daily log.</p>
                {selectedDayEntry?.dailyTasks?.length ? (
                  <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                    {selectedDayEntry.dailyTasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className={`text-xs ${task.completed ? "text-gray-500 line-through" : "text-gray-700"}`}>{task.name}</span>
                      <div className="flex shrink-0 items-center gap-2 text-[10px] text-gray-500">
                        {task.dueDate && <span>Due {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                        <a href={task.url} target="_blank" rel="noreferrer" aria-label={`Open ${task.name} in ClickUp`} className="text-[#31577D] hover:text-[#003366]"><ExternalLink size={12} /></a>
                      </div>
                    </li>)}
                  </ul>
                ) : <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">No My Day tasks are linked to this date yet.</p>}
              </section>
            </section>

            <aside className="lg:col-span-4 space-y-4">
              <div className="bg-[#FFFCFB] border border-gray-200 p-5">
                <h3 className="text-lg flex items-center gap-2"><FileText size={17} className="text-[#C9AB4C]" /> Source record</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">Edit directly here. Mosaic keeps the same month parent and daily subtask structure your team already uses in ClickUp.</p>
                {selectedDayEntries[0]?.url ? (
                  <a href={selectedDayEntries[0].url} target="_blank" rel="noreferrer" className="mt-4 btn-outline !px-4 !py-2 inline-flex items-center gap-2">
                    Open daily log <ExternalLink size={14} />
                  </a>
                ) : <p className="text-xs text-gray-500 mt-4">Save an entry to create this date in ClickUp.</p>}
              </div>
              <div className="bg-[#FFFCFB] border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg flex items-center gap-2">
                    <CalendarPlus size={17} className="text-[#C9AB4C]" /> Month Placeholders
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#003366] bg-[#003366]/5 px-2 py-0.5 border border-[#003366]/15">
                    ClickUp
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  Generate placeholder daily tasks in ClickUp for all weekdays of a month under {member?.name || "the member"}&apos;s parent task.
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Target Month
                    </label>
                    <select
                      value={targetGenMonth}
                      onChange={(e) => {
                        setTargetGenMonth(e.target.value);
                        setGenerateFeedback(null);
                      }}
                      disabled={generatingMonth}
                      className="w-full h-9 bg-[#FFFCFB] border border-gray-300 px-2.5 text-xs text-[#1b1d1e] focus:outline-none focus:border-[#C9AB4C]"
                    >
                      {availableMonths.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 border border-gray-200">
                    <span className="text-gray-600">Existing weekdays:</span>
                    <span className="font-semibold text-[#003366]">
                      {monthStats.existingCount} / {monthStats.totalWeekdays} tasks
                    </span>
                  </div>

                  {generateFeedback && (
                    <div
                      className={`text-xs p-2.5 border flex items-start gap-1.5 ${
                        generateFeedback.type === "success"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-red-50 border-red-200 text-red-800"
                      }`}
                    >
                      {generateFeedback.type === "success" ? (
                        <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                      ) : (
                        <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-600" />
                      )}
                      <span>{generateFeedback.text}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateMonthTasks}
                    disabled={generatingMonth || !member}
                    className="w-full h-10 bg-[#003366] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#002244] disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {generatingMonth ? (
                      <>
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        <span className="truncate">{generatingProgress || "Generating ClickUp Tasks…"}</span>
                      </>
                    ) : (
                      <>
                        <CalendarPlus size={14} />
                        {monthStats.missingCount > 0
                          ? `Generate ${monthStats.missingCount} Missing Tasks`
                          : `Sync ${monthStats.monthName} Tasks`}
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="bg-[#1b1d1e] border border-[#C9AB4C]/50 p-5 text-white">
                <div className="text-xs uppercase tracking-widest text-[#C9AB4C] font-bold">Daily completeness</div>
                <div className="text-3xl font-serif mt-3">{selectedDayEntries.some((entry) => entry.hasContent) ? "Complete" : "Empty"}</div>
                <p className="text-sm text-gray-300 mt-2">A day is complete when at least one existing work category contains an entry.</p>
              </div>
            </aside>
          </div>
        </div>
      )}

      {activeTab === "week" && (
        <section className="border border-gray-200 bg-[#FFFCFB]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 p-4">
            <div><h2 className="text-xl">Daily activity</h2><p className="mt-1 text-sm text-gray-500">{formatDate(rangeStart, { month: "long", day: "numeric", year: "numeric" })}–{formatDate(rangeEnd, { month: "long", day: "numeric", year: "numeric" })} · {member?.name || "Team member"}</p></div>
            <span className="text-xs text-gray-500">{entries.filter((entry) => entry.member.id === member?.id && entry.date >= rangeStart && entry.date <= rangeEnd && entry.hasContent).length} days with activity</span>
          </div>
          <div className="divide-y divide-gray-100">
            {entries.filter((entry) => entry.member.id === member?.id && entry.date >= rangeStart && entry.date <= rangeEnd && entry.hasContent).sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
              <article key={entry.id} className="grid gap-3 p-4 md:grid-cols-[180px_1fr]">
                <div><h3 className="font-semibold text-sm text-[#003366]">{formatDate(entry.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</h3><button type="button" onClick={() => { if (hideViewTabs && onOpenDay) onOpenDay(entry.date); else { setSelectedDate(entry.date); setActiveTab("today"); } }} className="mt-2 text-xs font-semibold text-[#31577D] hover:text-[#003366]">Open this day →</button></div>
                <div className="grid gap-3 sm:grid-cols-2">{CATEGORY_META.map((category) => {
                  const items = itemsFromText(entry.categories[category.key]);
                  return items.length ? <div key={category.key}><h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{category.label}</h4><ul className="mt-1 space-y-1 text-sm leading-relaxed text-slate-700">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span aria-hidden="true" className="text-[#31577D]">•</span><span>{item}</span></li>)}</ul></div> : null;
                })}</div>
              </article>
            ))}
            {!entries.some((entry) => entry.member.id === member?.id && entry.date >= rangeStart && entry.date <= rangeEnd && entry.hasContent) && <p className="p-8 text-center text-sm text-gray-500">No activity recorded in this period.</p>}
          </div>
        </section>
      )}

      {activeTab === "insights" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl">{formatDate(rangeStart, { month: "long", day: "numeric", year: "numeric" })}–{formatDate(rangeEnd, { month: "long", day: "numeric", year: "numeric" })}</h2>
            <p className="text-sm text-gray-500 mt-1">{insightMemberId === "all" ? "All team members" : (payload?.members.find((person) => person.id === insightMemberId)?.name || "Selected member")} · weekends and future dates are excluded from completeness.</p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="bg-[#FFFCFB] border border-gray-200 p-5"><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Team completeness</div><div className="text-3xl font-serif font-bold text-[#003366] mt-2">{averageCompleteness}%</div><div className="text-xs text-gray-500 mt-1">{submittedLogs} of {expectedLogs} expected logs</div></div>
            <div className="bg-[#FFFCFB] border border-gray-200 p-5"><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Members tracked</div><div className="text-3xl font-serif font-bold text-[#003366] mt-2">{filteredRows.length}</div><div className="text-xs text-gray-500 mt-1">within the selected view</div></div>
            <div className="bg-[#FFFCFB] border border-gray-200 p-5"><div className="text-xs uppercase tracking-wider font-bold text-gray-500">Empty logs</div><div className="text-3xl font-serif font-bold text-orange-700 mt-2">{emptyDayLogs}</div><div className="text-xs text-gray-500 mt-1">no daily record found</div></div>
          </div>

          <section className="bg-[#FFFCFB] border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div><h3 className="text-lg flex items-center gap-2"><Users size={18} className="text-[#C9AB4C]" /> Completeness by team member</h3><p className="text-sm text-gray-500 mt-1">Submitted logs compared with elapsed working days.</p></div>
              <div className="text-xs text-gray-500">Expected per member: <strong className="text-[#003366]">{workdays.length} days</strong></div>
            </div>
            <div className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <div key={row.member.id} className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-[minmax(190px,1fr)_minmax(220px,2fr)_100px] gap-4 items-center">
                  <div className="flex items-center gap-3 min-w-0"><MemberAvatar member={row.member} /><div className="min-w-0"><div className="text-sm font-semibold text-[#1b1d1e] truncate">{row.member.name}</div><div className="text-xs text-gray-500">{row.submittedDates.length} submitted · {row.emptyDays.length} empty logs</div></div></div>
                  <div>
                    <div className="h-2.5 bg-[#FFFCFB] overflow-hidden flex" role="progressbar" aria-label={`${row.member.name} completeness`} aria-valuenow={row.percent} aria-valuemin={0} aria-valuemax={100}>
                      <span className="bg-[#003366] h-full" style={{ width: `${row.percent}%` }} />
                    </div>
                  </div>
                  <div className="md:text-right"><span className={`text-2xl font-serif font-bold ${row.percent >= 90 ? "text-emerald-700" : row.percent >= 70 ? "text-amber-700" : "text-red-700"}`}>{row.percent}%</span></div>
                </div>
              ))}
              {!displayedRows.length && <div className="p-8 text-center text-sm text-gray-500">No team members were found in this list.</div>}
            </div>
          </section>

          <section className="bg-[#FFFCFB] border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div><h3 className="text-lg flex items-center gap-2"><CalendarDays size={18} className="text-[#C9AB4C]" /> Coverage by workday</h3><p className="text-sm text-gray-500 mt-1">A daily audit of submitted logs and days without any logs.</p></div>
              <div className="flex items-center gap-4 text-xs text-gray-500"><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 bg-emerald-600" /> Submitted</span><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 bg-orange-200 border border-orange-300" /> Empty log</span></div>
            </div>
            <div className="overflow-x-auto p-5">
              <div style={{ minWidth: `${Math.max(720, 210 + workdays.length * 35)}px` }}>
                <div className="grid gap-1.5 items-end mb-2" style={{ gridTemplateColumns: `190px repeat(${workdays.length}, minmax(28px, 1fr))` }}>
                  <div className="text-xs uppercase tracking-wider font-bold text-gray-500">Team member</div>
                  {workdays.map((date) => <div key={date} className="text-center"><div className="text-[11px] uppercase text-gray-500">{formatDate(date, { weekday: "narrow" })}</div><div className="text-xs font-bold text-[#003366]">{fromIso(date).getDate()}</div></div>)}
                </div>
                <div className="space-y-1.5">
                  {filteredRows.map((row) => (
                    <div key={row.member.id} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: `190px repeat(${workdays.length}, minmax(28px, 1fr))` }}>
                      <div className="text-sm font-semibold text-gray-700 truncate pr-3">{row.member.name}</div>
                      {workdays.map((date) => {
                        const dayEntries = row.byDate.get(date) || [];
                        const status = dayEntries.some((entry) => entry.hasContent) ? "submitted" : "empty";
                        return <div key={date} title={`${formatDate(date)}: ${status === "submitted" ? "submitted" : "empty log"}`} aria-label={`${row.member.name}, ${formatDate(date)}: ${status === "submitted" ? "submitted" : "empty log"}`} className={`h-8 grid place-items-center text-xs font-bold ${status === "submitted" ? "bg-emerald-600 text-white" : "bg-orange-100 text-orange-800 border border-orange-300"}`}>{status === "submitted" ? "✓" : "·"}</div>;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-[#FFFCFB] border border-gray-200 p-5">
              <h3 className="text-lg flex items-center gap-2"><BarChart3 size={18} className="text-[#C9AB4C]" /> Recorded work mix</h3>
              <p className="text-sm text-gray-500 mt-1">Individual entries detected in each existing ClickUp field.</p>
              <div className="space-y-4 mt-5">
                {monthCategoryTotals.map((category) => (
                  <div key={category.key} className="grid grid-cols-[80px_1fr_40px] gap-3 items-center">
                    <span className="text-sm text-gray-600">{category.label}</span>
                    <div className="h-5 bg-[#FFFCFB]"><div className="h-full bg-[#003366]" style={{ width: `${(category.count / maxCategoryTotal) * 100}%` }} /></div>
                    <strong className="text-sm text-right text-[#003366]">{category.count}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="bg-[#1b1d1e] border border-[#C9AB4C]/50 p-5 text-white">
              <div className="text-xs uppercase tracking-widest text-[#C9AB4C] font-bold">Completeness rule</div>
              <h3 className="text-2xl text-white mt-3">Clear and non-destructive</h3>
              <p className="text-sm text-gray-300 mt-3 leading-relaxed">A weekday is submitted when at least one of the four existing fields contains content. Empty logs are workdays without any submitted content.</p>
              <p className="text-sm text-gray-300 mt-3 leading-relaxed">Mosaic writes only the existing four Daily Log fields and creates the matching month parent and date subtask when needed.</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
