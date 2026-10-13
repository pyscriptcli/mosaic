"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Sparkles, 
  X, 
  Calendar, 
  FileText, 
  ArrowRight, 
  Mic, 
  CheckSquare,
  LayoutDashboard,
  FolderKanban,
  ExternalLink,
  ClipboardList,
  NotebookTabs,
  Newspaper,
  RefreshCw,
  ClipboardCheck
} from "lucide-react";
import { ArchivedMeeting } from "@/types/meeting";
import { ClickUpTask } from "./TasksView";
import { formatEchoDate } from "@/lib/dateUtils";
import { flushClickUpMutationQueue, getPendingClickUpMutationCount } from "@/lib/clickUpMutationQueue";
import { refreshBrowserPageQueries } from "@/lib/browserPageCache";

interface TopbarProps {
  meetings: ArchivedMeeting[];
  tasks?: ClickUpTask[];
  userId?: string;
  onOpenUniversalEcho: () => void;
  onOpenSearch?: () => void;
  onSelectMeeting: (meetingId: string) => void;
  onSelectTask?: (taskId: string) => void;
  onOpenStudio: () => void;
  onGoToNotetaker: () => void;
  onNavigateToPage?: (page: "dashboard" | "project" | "meetings" | "tasks" | "notebook" | "market-insights" | "demands" | "minutes" | "forms" | "forms-admin") => void;
  allowedPages?: Array<"dashboard" | "project" | "meetings" | "tasks" | "notebook" | "market-insights" | "demands" | "minutes" | "forms">;
  isAdmin?: boolean;
  askEchoEnabled?: boolean;
  allowedFeatures?: string[];
  studioRecording?: {
    active?: boolean;
    isMinimized: boolean;
    elapsedSeconds: number;
    isPaused?: boolean;
    onRestore: () => void;
  };
}

export function Topbar({
  meetings,
  tasks = [],
  userId,
  onOpenUniversalEcho,
  onOpenSearch,
  onSelectMeeting,
  onSelectTask,
  onOpenStudio,
  onGoToNotetaker,
  onNavigateToPage,
  allowedPages,
  isAdmin,
  askEchoEnabled = false,
  allowedFeatures,
  studioRecording,
}: TopbarProps) {
  const formatMeetingClock = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<"checking" | "synced" | "syncing" | "error">("checking");
  const [syncPendingCount, setSyncPendingCount] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [manualSyncing, setManualSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [syncItems, setSyncItems] = useState<Array<{ id?: string; label: string; state: "syncing" | "synced" | "error" }>>([]);
  const previousSyncState = useRef(syncState);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const refreshSyncStatus = React.useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch("/api/integrations/clickup/sync", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.configured) throw new Error(data.error || "Background sync is not configured.");
      const nextState = data.state === "error" ? "error" : data.state === "syncing" ? "syncing" : "synced";
      const previousState = previousSyncState.current;
      previousSyncState.current = nextState;
      setSyncState(nextState);
      setSyncPendingCount(Number(data.pendingCount || 0));
      setSyncError(data.state === "error" ? `${Number(data.failedCount || 0)} change${Number(data.failedCount || 0) === 1 ? "" : "s"} need attention.` : "");
      if (previousState === "syncing" && nextState === "synced") {
        window.dispatchEvent(new CustomEvent("mosaic-clickup-sync-complete"));
        void refreshBrowserPageQueries(userId);
        setSyncItems((items) => items.map((item) => ({ ...item, state: "synced" })));
      }
    } catch (error) {
      setSyncState("error");
      setSyncError(error instanceof Error ? error.message : "Sync status is unavailable.");
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      await refreshSyncStatus();
      if (active) timer = window.setTimeout(poll, syncState === "syncing" || manualSyncing ? 2500 : 15000);
    };
    const onQueueChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; pending?: number }>).detail;
      if (detail?.userId !== userId) return;
      setSyncPendingCount(Number(detail.pending || 0));
      if (detail.pending) setSyncState("syncing");
      if (timer) window.clearTimeout(timer);
      void poll();
    };
    void poll();
    window.addEventListener("mosaic-clickup-sync", onQueueChange);
    return () => { active = false; if (timer) window.clearTimeout(timer); window.removeEventListener("mosaic-clickup-sync", onQueueChange); };
  }, [manualSyncing, refreshSyncStatus, syncState, userId]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => { window.removeEventListener("online", updateOnlineState); window.removeEventListener("offline", updateOnlineState); };
  }, []);

  const runManualSync = async () => {
    if (!userId || manualSyncing) return;
    setManualSyncing(true);
    setSyncState("syncing");
    setSyncError("");
    setSyncDetailsOpen(true);
    const pending = getPendingClickUpMutationCount(userId);
    setSyncPendingCount(pending);
    setSyncItems([
      { label: "ClickUp lists", state: "syncing" },
      ...(pending > 0 ? [{ label: `${pending} saved task change${pending === 1 ? "" : "s"}`, state: "syncing" as const }] : []),
    ]);
    void flushClickUpMutationQueue(userId, setSyncPendingCount);
    try {
      const taskListId = localStorage.getItem("project_echo_clickup_list_id");
      const personalListId = localStorage.getItem("project_echo_personal_list_id");
      const listIds = [taskListId, personalListId].filter((value): value is string => Boolean(value));
      const listLabels: Record<string, string> = {};
      if (taskListId) listLabels[taskListId] = "Tasks";
      if (personalListId) listLabels[personalListId] = "Personal notes";
      const response = await fetch("/api/integrations/clickup/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listIds, listLabels }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Manual sync could not be started.");
      if (Array.isArray(data.items)) {
        setSyncItems([
          ...data.items.map((item: { id?: unknown; label?: unknown }) => ({ id: typeof item.id === "string" ? item.id : undefined, label: typeof item.label === "string" ? item.label : "ClickUp list", state: "syncing" as const })),
          ...(pending > 0 ? [{ label: `${pending} saved task change${pending === 1 ? "" : "s"}`, state: "syncing" as const }] : []),
        ]);
      }
      await refreshSyncStatus();
    } catch (error) {
      setSyncState("error");
      setSyncError(error instanceof Error ? error.message : "Manual sync could not be started.");
      setSyncItems((items) => items.map((item) => ({ ...item, state: "error" })));
    } finally {
      setManualSyncing(false);
    }
  };

  // Keyboard shortcut Ctrl+K / Cmd+K to focus search
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
        onOpenSearch?.();
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = searchQuery.trim().toLowerCase();

  // 1. Navigation Pages
  const APP_PAGES: Array<{ id: "dashboard" | "project" | "meetings" | "tasks" | "notebook" | "market-insights" | "demands" | "minutes" | "forms" | "forms-admin"; name: string; description: string; icon: any }> = [
    { id: "dashboard", name: "Dashboard", description: "Executive overview & meeting metrics", icon: LayoutDashboard },
    { id: "project", name: "Project", description: "Focused project workspace", icon: FolderKanban },
    { id: "meetings", name: "Meetings Archives", description: "Review and edit meeting minutes", icon: Calendar },
    { id: "tasks", name: "Tasks Portal (ClickUp)", description: "Track & execute meeting action items", icon: CheckSquare },
    { id: "notebook", name: "Notebook", description: "Daily logs & team completeness", icon: NotebookTabs },
    { id: "market-insights", name: "Market Insights", description: "Weekly market brief & source archive", icon: Newspaper },
    { id: "demands", name: "Demands", description: "Demand pipeline, table & coverage", icon: ClipboardCheck },
    { id: "minutes", name: "Notetaker Studio", description: "Transcribe audio & synthesize notes", icon: Mic },
    { id: "forms", name: "Forms", description: "Submit, track & approve requests", icon: ClipboardList },
    { id: "forms-admin", name: "Settings", description: "Configure Ask Echo access and routing", icon: ClipboardList },
  ];

  const matchedPages = query
    ? APP_PAGES.filter((p) => {
        if (p.id === "forms-admin" && !isAdmin) return false;
        if (!isAdmin && allowedPages && allowedPages.length > 0 && !allowedPages.includes(p.id as any) && !(p.id === "project" && allowedPages.includes("tasks"))) return false;
        return (
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.id.includes(query)
        );
      })
    : [];

  // 2. ClickUp Tasks
  const canAccessTasks = isAdmin || !allowedPages || allowedPages.includes("tasks");
  const matchedTasks = query && canAccessTasks
    ? tasks.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          (t.meetingTitle || "").toLowerCase().includes(query) ||
          t.status.toLowerCase().includes(query) ||
          t.assignees.some((a) => a.username.toLowerCase().includes(query))
      ).slice(0, 5)
    : [];

  // 3. Meetings
  const canAccessMeetings = isAdmin || !allowedPages || allowedPages.includes("meetings");
  const matchedMeetings = query && canAccessMeetings
    ? meetings.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          m.location.toLowerCase().includes(query) ||
          m.summary.toLowerCase().includes(query)
      ).slice(0, 5)
    : [];

  // 4. Discussion Topics & Action Items
  const matchedTopics: { meetingId: string; meetingTitle: string; topic: string; action: string }[] = [];
  if (query) {
    meetings.forEach((m) => {
      m.items.forEach((item) => {
        if (
          item.topic.toLowerCase().includes(query) ||
          item.discussion_point.toLowerCase().includes(query) ||
          item.action_plan.toLowerCase().includes(query)
        ) {
          if (matchedTopics.length < 5) {
            matchedTopics.push({
              meetingId: m.id,
              meetingTitle: m.title,
              topic: item.topic,
              action: item.action_plan
            });
          }
        }
      });
    });
  }

  const hasResults =
    matchedPages.length > 0 ||
    matchedTasks.length > 0 ||
    matchedMeetings.length > 0 ||
    matchedTopics.length > 0;

  return (
    <header className="sticky top-0 z-30 h-14 bg-[#FFFCFB]/95 backdrop-blur-sm border-b border-[#003366]/15 px-4 md:px-8 flex items-center justify-between gap-4 transition-colors">
      {/* Left controls: sync status and live sync details */}
      <div className="relative flex w-auto shrink-0 items-center gap-2 xl:w-72">
        {userId && (() => {
          const effectiveState = !isOnline ? "error" : syncPendingCount > 0 && syncState === "synced" ? "syncing" : syncState;
          const label = effectiveState === "synced" ? "Synced" : effectiveState === "syncing" || effectiveState === "checking" ? "Syncing" : "Sync issue";
          const tone = effectiveState === "synced" ? "text-emerald-700 hover:bg-emerald-50" : effectiveState === "error" ? "text-red-700 hover:bg-red-50" : "text-amber-700 hover:bg-amber-50";
          const dot = effectiveState === "synced" ? "bg-emerald-600" : effectiveState === "error" ? "bg-red-600" : "bg-amber-500";
          return (
            <>
              <button type="button" onClick={() => void runManualSync()} disabled={manualSyncing} aria-label={`Sync now. ${label}${syncPendingCount ? `, ${syncPendingCount} pending` : ""}`} title={syncError || `${label}${syncPendingCount ? ` · ${syncPendingCount} pending` : ""}. Click to sync now.`} className={`inline-flex min-h-9 items-center gap-1.5 border border-slate-200 px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-70 ${tone}`}>
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                <RefreshCw aria-hidden="true" size={13} className={effectiveState === "syncing" || manualSyncing ? "animate-spin" : ""} />
                <span>{label}</span>
              </button>
              {syncDetailsOpen && (
                <section role="status" aria-live="polite" className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] border border-[#003366]/20 bg-[#FFFCFB] p-3 text-[#1b1d1e] shadow-lg">
                  <div className="flex items-center justify-between gap-3 border-b border-[#003366]/10 pb-2">
                    <h2 className="text-xs font-semibold text-[#003366]">{syncState === "error" ? "Sync needs attention" : syncState === "synced" && !manualSyncing ? "Sync complete" : "Syncing in background"}</h2>
                    <button type="button" onClick={() => setSyncDetailsOpen(false)} aria-label="Close sync details" className="p-1 text-slate-500 hover:text-[#003366]"><X size={14} /></button>
                  </div>
                  <p className="py-2 text-[11px] text-slate-600">{syncState === "error" ? syncError || "Some changes could not be synced." : syncState === "synced" && !manualSyncing ? "The requested lists and saved changes are up to date." : "Your app stays available while these items sync."}</p>
                  <ul className="space-y-1.5">
                    {syncItems.map((item) => (
                      <li key={`${item.id || item.label}`} className="flex items-center gap-2 text-[11px]">
                        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${item.state === "synced" ? "bg-emerald-600" : item.state === "error" ? "bg-red-600" : "bg-amber-500 animate-pulse"}`} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <span className={`shrink-0 text-[10px] ${item.state === "synced" ? "text-emerald-700" : item.state === "error" ? "text-red-700" : "text-amber-700"}`}>{item.state === "synced" ? "Done" : item.state === "error" ? "Retry needed" : "Working"}</span>
                      </li>
                    ))}
                  </ul>
                  {(syncState === "syncing" || manualSyncing) && <div className="mt-3 h-1 overflow-hidden bg-amber-100"><div className="h-full w-2/3 animate-pulse bg-amber-500" /></div>}
                </section>
              )}
            </>
          );
        })()}
      </div>

      {/* Middle: Centered Spotlight Search Container */}
      <div ref={searchContainerRef} className="relative w-full max-w-md mx-auto">
        <div className="relative flex items-center">
          <Search size={15} className="absolute left-3.5 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => { setIsOpen(true); onOpenSearch?.(); }}
            placeholder="Search"
            className="w-full pl-10 pr-9 py-1.5 text-xs bg-[#FFFCFB] border border-[#003366]/25 rounded-none shadow-2xs focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] transition-all text-[#181D1E] placeholder:text-[#53616A]"
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery("");
                setIsOpen(false);
              }}
              className="absolute right-2.5 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="absolute right-2.5 hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-gray-400 bg-[#FFFCFB] border border-gray-200 rounded-none">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Spotlight Results Dropdown */}
        {isOpen && query && (
          <div className="absolute left-0 right-0 mt-2 bg-[#FFFCFB] border border-gray-200 rounded-none shadow-xl overflow-hidden z-50 max-h-[420px] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            {hasResults ? (
              <div className="p-2 divide-y divide-gray-100 text-xs">
                {/* 1. APP PAGES */}
                {matchedPages.length > 0 && (
                  <div className="py-2 first:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9AB4C] px-2 block mb-1">
                      Pages & Views
                    </span>
                    {matchedPages.map((p) => {
                      const IconComponent = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (onNavigateToPage) onNavigateToPage(p.id);
                            setIsOpen(false);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-none hover:bg-[#FFFCFB] flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <IconComponent size={14} className="text-[#003366] shrink-0" />
                            <div>
                              <div className="font-semibold text-[#1b1d1e] group-hover:text-[#003366]">
                                {p.name}
                              </div>
                              <div className="text-[10px] text-gray-400">{p.description}</div>
                            </div>
                          </div>
                          <ArrowRight size={13} className="text-gray-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 2. CLICKUP TASKS */}
                {matchedTasks.length > 0 && (
                  <div className="py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9AB4C] px-2 block mb-1">
                      ClickUp Tasks
                    </span>
                    {matchedTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          if (onSelectTask) onSelectTask(t.id);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-none hover:bg-[#FFFCFB] flex items-center justify-between group transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <CheckSquare size={14} className="text-[#003366] shrink-0" />
                          <div className="truncate">
                            <div className="font-semibold text-[#1b1d1e] group-hover:text-[#003366] truncate">
                              {t.name}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              Status: <span className="uppercase font-bold text-gray-600">{t.status}</span>
                              {t.assignees.length > 0 && ` • Assigned to ${t.assignees[0].username}`}
                              {t.dueDate && ` • Due ${formatEchoDate(t.dueDate)}`}
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-gray-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. MEETINGS */}
                {matchedMeetings.length > 0 && (
                  <div className="py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9AB4C] px-2 block mb-1">
                      Meetings
                    </span>
                    {matchedMeetings.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectMeeting(m.id);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-none hover:bg-[#FFFCFB] flex items-center justify-between group transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Calendar size={14} className="text-[#003366] shrink-0" />
                          <div className="truncate">
                            <div className="font-semibold text-[#1b1d1e] group-hover:text-[#003366] truncate">
                              {m.title}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {formatEchoDate(m.date)} • {m.location || "Scheduled Venue"}
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-gray-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. TOPICS & ACTIONS */}
                {matchedTopics.length > 0 && (
                  <div className="py-2 last:pb-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9AB4C] px-2 block mb-1">
                      Topics & Action Plans
                    </span>
                    {matchedTopics.map((t, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          onSelectMeeting(t.meetingId);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-none hover:bg-[#FFFCFB] flex items-center justify-between group transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText size={14} className="text-[#C9AB4C] shrink-0" />
                          <div className="truncate">
                            <div className="font-medium text-[#1b1d1e] group-hover:text-[#003366] truncate">
                              {t.topic}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate max-w-sm">
                              In {t.meetingTitle} • {t.action || "No action plan"}
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-gray-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 text-xs">
                No matching results found across pages, tasks, or meetings for &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {studioRecording?.active && (
          <button type="button" onClick={studioRecording.onRestore} className="inline-flex items-center gap-1.5 border border-[#C9AB4C] bg-[#003366] px-3 py-1.5 text-xs font-bold text-white" title="Open current meeting" aria-label={`${studioRecording.isPaused ? "Paused" : "Recording"} ${formatMeetingClock(studioRecording.elapsedSeconds)}`}>
            <span className={`h-2 w-2 rounded-full ${studioRecording.isPaused ? "bg-amber-400" : "bg-red-500 animate-pulse"}`} />
            <span>{studioRecording.isPaused ? "Paused" : "Recording"} {formatMeetingClock(studioRecording.elapsedSeconds)}</span>
          </button>
        )}

        {/* Ask Echo trigger */}
        {askEchoEnabled && (!allowedFeatures || allowedFeatures.includes("ask-echo")) && (!allowedPages || allowedPages.includes("minutes")) && (
          <button
            type="button"
            onClick={onOpenUniversalEcho}
            className="flex items-center gap-1.5 bg-[#003366] text-[#FFFCFB] hover:bg-[#174778] border border-[#C9A84C]/60 hover:border-[#C9A84C] px-3.5 py-1.5 rounded-none text-xs font-semibold tracking-wide shadow-2xs transition-all group"
          >
            <Sparkles size={13} className="text-[#FFBF00] group-hover:rotate-12 transition-transform" />
            <span>Ask Echo</span>
          </button>
        )}
      </div>
    </header>
  );
}
