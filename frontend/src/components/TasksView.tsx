"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CheckSquare,
  Search,
  Filter,
  Kanban,
  List,
  Plus,
  RefreshCw,
  ExternalLink,
  Calendar,
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Link2,
  Sparkles,
  ArrowUpDown,
  Tag,
  FolderSync,
  FolderKanban,
  Edit3,
  X,
  Users,
  Check
} from "lucide-react";
import {
  fetchClickUpTasks,
  createClickUpTask,
  updateClickUpTask,
  deleteClickUpTask,
  getStoredClickUpToken,
  setStoredClickUpToken,
  getStoredClickUpListId,
  setStoredClickUpListId,
  getStoredClickUpListName,
  setStoredClickUpListName,
  discoverClickUpLists
} from "@/lib/api";
import { WORKSPACE_STATUS_CATEGORIES, ALL_WORKSPACE_STATUSES } from "@/lib/clickupStatuses";
import { SearchableMemberSelect } from "./SearchableMemberSelect";
import { formatEchoDate } from "@/lib/dateUtils";
import { clearBrowserPageCache, readBrowserPageCache, writeBrowserPageCache } from "@/lib/browserPageCache";
import { requestCentralClickUpSync, trackClickUpLiveRefresh } from "@/lib/clickupSyncClient";
import { flushClickUpMutationQueue, getPendingClickUpMutationCount, mergePendingClickUpMutations, queueClickUpDelete, queueClickUpUpdate } from "@/lib/clickUpMutationQueue";

export interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: string;
  statusColor?: string;
  statusType?: string;
  priority: string;
  priorityOrder?: number;
  dueDate: string | null;
  startDate?: string | null;
  dateCreated?: string | null;
  url?: string;
  assignees: Array<{
    id: number | string;
    username: string;
    email?: string;
    initials?: string;
    profilePicture?: string | null;
  }>;
  tags?: string[];
  isMeetingTask?: boolean;
  meetingTitle?: string;
  discussionPointId?: string;
  listId?: string;
}

interface TasksViewProps {
  userId?: string;
  onNavigateToMeetings?: () => void;
  onSelectMeeting?: (meetingTitle: string) => void;
  focusedTaskId?: string | null;
  onClearFocusedTask?: () => void;
}

export default function TasksView({
  userId,
  onNavigateToMeetings,
  onSelectMeeting,
  focusedTaskId,
  onClearFocusedTask
}: TasksViewProps) {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  // List Selector & Discovery state
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedListName, setSelectedListName] = useState<string>("");
  const [selectedSpaceName, setSelectedSpaceName] = useState<string>("");
  const [availableLists, setAvailableLists] = useState<
    Array<{ id: string; name: string; spaceName: string; folderName?: string; teamName?: string }>
  >([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [needsListSelection, setNeedsListSelection] = useState(false);
  const listDropdownRef = useRef<HTMLDivElement>(null);

  // Setup / Connection credentials (manual fallback)
  const [tokenInput, setTokenInput] = useState("");
  const [listIdInput, setListIdInput] = useState("");
  const [discoveredLists, setDiscoveredLists] = useState<
    Array<{ id: string; name: string; spaceName: string; folderName?: string; teamName?: string }>
  >([]);
  const [discovering, setDiscovering] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Available ClickUp members and statuses
  const [availableMembers, setAvailableMembers] = useState<
    Array<{ id: number | string; username: string; email: string; initials: string }>
  >([]);
  const [statusCategories, setStatusCategories] = useState(WORKSPACE_STATUS_CATEGORIES);

  // View state: 'board' | 'list'
  const [viewMode, setViewMode] = useState<"board" | "list">("board");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "overdue" | "upcoming">("all");
  const [meetingFilter, setMeetingFilter] = useState("all");

  // Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskMeetingTitle, setNewTaskMeetingTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("normal");
  const [newTaskStatus, setNewTaskStatus] = useState("to do");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Detail / Edit Modal state
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<ClickUpTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSavedSuccess, setEditSavedSuccess] = useState(false);

  // Load stored credentials & lists on mount
  useEffect(() => {
    const token = getStoredClickUpToken();
    const listId = getStoredClickUpListId();
    const listName = getStoredClickUpListName();
    setTokenInput(token);
    setListIdInput(listId);
    if (listId) setSelectedListId(listId);
    if (listName) setSelectedListName(listName);

    void (async () => {
      const cacheKey = `tasks:${listId || "default"}`;
      const cached = userId ? await readBrowserPageCache<Awaited<ReturnType<typeof fetchClickUpTasks>>>(userId, cacheKey) : undefined;
      if (cached) {
        setTasks(cached.tasks || []);
        setAvailableMembers(cached.members || []);
        setStatusCategories(cached.categories || WORKSPACE_STATUS_CATEGORIES);
        if (cached.listId) setSelectedListId(cached.listId);
        if (cached.listName) setSelectedListName(cached.folderName ? `${cached.folderName} / ${cached.listName}` : cached.listName);
        if (cached.spaceName) setSelectedSpaceName(cached.spaceName);
        setLoading(false);
      }
      void loadTasks(false, listId || undefined, Boolean(cached));
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const refreshCount = () => setPendingSync(getPendingClickUpMutationCount(userId));
    const flush = () => { refreshCount(); void flushClickUpMutationQueue(userId, setPendingSync); };
    const onQueueChange = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail?.userId === userId) flush();
    };
    refreshCount();
    flush();
    window.addEventListener("online", flush);
    window.addEventListener("mosaic-clickup-sync", onQueueChange);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("mosaic-clickup-sync", onQueueChange);
    };
  }, [userId]);

  const persistTaskSnapshot = (nextTasks: ClickUpTask[]) => {
    if (!userId) return;
    const key = `tasks:${selectedListId || getStoredClickUpListId() || "default"}`;
    void readBrowserPageCache<Awaited<ReturnType<typeof fetchClickUpTasks>>>(userId, key).then((cached) => {
      if (cached) return writeBrowserPageCache(userId, key, { ...cached, tasks: nextTasks });
    });
  };

  const updateTasksLocally = (change: (current: ClickUpTask[]) => ClickUpTask[]) => {
    setTasks((current) => {
      const next = change(current);
      persistTaskSnapshot(next);
      return next;
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listDropdownRef.current && !listDropdownRef.current.contains(e.target as Node)) {
        setIsListDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle focusedTaskId from external navigation
  useEffect(() => {
    if (focusedTaskId && tasks.length > 0) {
      const matched = tasks.find(t => t.id === focusedTaskId);
      if (matched) {
        openTaskDetail(matched);
      }
    }
  }, [focusedTaskId, tasks]);

  const loadTasks = async (showRefreshIndicator = false, listIdOverride?: string, background = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else if (!background && tasks.length === 0) setLoading(true);
    setError(null);
    setNeedsListSelection(false);

    const activeListId = listIdOverride !== undefined ? listIdOverride : (selectedListId || getStoredClickUpListId());

    try {
      const data = await fetchClickUpTasks(activeListId || undefined, showRefreshIndicator);
      const visibleData = userId ? { ...data, tasks: mergePendingClickUpMutations(userId, data.tasks || []) } : data;
      if (userId) void writeBrowserPageCache(userId, `tasks:${activeListId || "default"}`, visibleData);
      setTasks(visibleData.tasks || []);
      if (data.members && Array.isArray(data.members)) {
        setAvailableMembers(data.members);
      }
      if (data.categories && Array.isArray(data.categories)) {
        setStatusCategories(data.categories);
      }
      if (data.listId) {
        setSelectedListId(data.listId);
        setStoredClickUpListId(data.listId);
      }
      if (data.listName) {
        const displayName = data.folderName ? `${data.folderName} / ${data.listName}` : data.listName;
        setSelectedListName(displayName);
        setStoredClickUpListName(displayName);
      }
      if (data.spaceName) {
        setSelectedSpaceName(data.spaceName);
      }
      setNeedsAuth(false);
      setNeedsListSelection(false);
    } catch (err: any) {
      console.warn("Failed to load ClickUp tasks:", err.message);
      if (userId && (err.status === 401 || err.status === 403)) await clearBrowserPageCache(userId);
      setError(err.message);
      if (err.needsAuth || err.status === 401 || err.message.includes("authentication") || err.message.includes("Token")) {
        setNeedsAuth(true);
      } else if (
        err.needsListSelection ||
        err.status === 404 ||
        err.message.toLowerCase().includes("list not found") ||
        err.message.toLowerCase().includes("select a clickup list") ||
        err.message.toLowerCase().includes("not configured")
      ) {
        setNeedsListSelection(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTasksRef = useRef(loadTasks);
  useEffect(() => { loadTasksRef.current = loadTasks; });
  useEffect(() => {
    const refreshAfterSync = (event: Event) => { trackClickUpLiveRefresh(event, () => loadTasksRef.current(false, undefined, true), "Tasks"); };
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
  }, []);

  const requestTasksRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await requestCentralClickUpSync();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to start ClickUp refresh.");
      setRefreshing(false);
    }
  };

  const loadDiscoveredLists = async (showNotification = false, force = false) => {
    if (!force && !showNotification && userId) {
      const cached = await readBrowserPageCache<{ lists: typeof availableLists }>(userId, "tasks:discovered-lists");
      if (cached && Array.isArray(cached.lists)) {
        setAvailableLists(cached.lists);
        setDiscoveredLists(cached.lists);
        return;
      }
    }
    setLoadingLists(availableLists.length === 0);
    setDiscovering(availableLists.length === 0);
    try {
      const data = await discoverClickUpLists(tokenInput.trim() || undefined);
      const lists = data.lists || [];
      setAvailableLists(lists);
      setDiscoveredLists(lists);
      if (userId) void writeBrowserPageCache(userId, "tasks:discovered-lists", { lists });

      const currentListId = selectedListId || getStoredClickUpListId();
      if (currentListId && lists.length > 0) {
        const matched = lists.find((l: any) => l.id === currentListId);
        if (matched) {
          const displayName = matched.folderName ? `${matched.folderName} / ${matched.name}` : matched.name;
          setSelectedListName(displayName);
          setSelectedSpaceName(matched.spaceName);
          setStoredClickUpListName(displayName);
        }
      }
      if (showNotification) {
        alert(`Discovered ${lists.length} lists across your ClickUp workspace.`);
      }
    } catch (err: any) {
      console.warn("Discovered lists notice:", err.message);
      if (userId && (err.status === 401 || err.status === 403)) await clearBrowserPageCache(userId);
      if (showNotification) {
        alert(err.message || "Failed to discover ClickUp lists.");
      }
    } finally {
      setLoadingLists(false);
      setDiscovering(false);
    }
  };

  const handleSelectList = (list: { id: string; name: string; spaceName: string; folderName?: string }) => {
    const displayName = list.folderName ? `${list.folderName} / ${list.name}` : list.name;
    setSelectedListId(list.id);
    setSelectedListName(displayName);
    setSelectedSpaceName(list.spaceName);
    setStoredClickUpListId(list.id);
    setStoredClickUpListName(displayName);
    setIsListDropdownOpen(false);
    setNeedsListSelection(false);
    setError(null);
    void (async () => {
      const cached = userId ? await readBrowserPageCache<Awaited<ReturnType<typeof fetchClickUpTasks>>>(userId, `tasks:${list.id}`) : undefined;
      if (cached) {
        setTasks(cached.tasks || []);
        setAvailableMembers(cached.members || []);
        setStatusCategories(cached.categories || WORKSPACE_STATUS_CATEGORIES);
        setLoading(false);
      }
      void loadTasks(false, list.id, Boolean(cached));
    })();
  };

  const handleSaveCredentials = async () => {
    if (!tokenInput.trim()) {
      alert("Please enter a valid ClickUp API Token.");
      return;
    }
    setStoredClickUpToken(tokenInput.trim());
    if (listIdInput.trim()) {
      setStoredClickUpListId(listIdInput.trim());
      setSelectedListId(listIdInput.trim());
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    setNeedsAuth(false);
    setNeedsListSelection(false);
    loadTasks();
    loadDiscoveredLists(false, true);
  };

  const handleDiscoverLists = async () => {
    await loadDiscoveredLists(true);
  };

  const openTaskDetail = (task: ClickUpTask) => {
    setSelectedTaskForDetail(task);
    setEditTitle(task.name);
    setEditDescription(task.description);
    setEditStatus(task.status.toLowerCase());
    setEditPriority(task.priority.toLowerCase());
    setEditDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
    setEditAssigneeId(task.assignees.length > 0 ? String(task.assignees[0].id) : "");
    setEditSavedSuccess(false);
  };

  const handleSaveTaskDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDetail) return;

    setSavingEdit(true);
    try {
      const payload: any = {
        taskId: selectedTaskForDetail.id,
        name: editTitle.trim(),
        description: editDescription.trim(),
        status: editStatus,
        priority: editPriority,
        dueDate: editDueDate || null,
      };

      if (editAssigneeId) {
        payload.assignees = [Number(editAssigneeId)];
      }

      const updatedAssignee = availableMembers.find(m => String(m.id) === editAssigneeId);
      updateTasksLocally(prev =>
        prev.map(t => {
          if (t.id === selectedTaskForDetail.id) {
            return {
              ...t,
              name: editTitle.trim(),
              description: editDescription.trim(),
              status: editStatus,
              priority: editPriority,
              dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
              assignees: updatedAssignee
                ? [
                    {
                      id: updatedAssignee.id,
                      username: updatedAssignee.username,
                      email: updatedAssignee.email,
                      initials: updatedAssignee.initials,
                    },
                  ]
                : t.assignees,
            };
          }
          return t;
        })
      );

      if (userId) {
        queueClickUpUpdate(userId, payload);
        void flushClickUpMutationQueue(userId, setPendingSync);
      } else await updateClickUpTask(payload);
      setEditSavedSuccess(true);
      setTimeout(() => setEditSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || "Failed to update task.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    // Optimistic UI update
    updateTasksLocally(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)));
    if (userId) { queueClickUpUpdate(userId, { taskId, status: newStatus }); void flushClickUpMutationQueue(userId, setPendingSync); }
    else void updateClickUpTask({ taskId, status: newStatus }).catch(() => loadTasks());
  };

  const handlePriorityChange = async (taskId: string, newPriority: string) => {
    updateTasksLocally(prev => prev.map(t => (t.id === taskId ? { ...t, priority: newPriority } : t)));
    if (userId) { queueClickUpUpdate(userId, { taskId, priority: newPriority }); void flushClickUpMutationQueue(userId, setPendingSync); }
    else void updateClickUpTask({ taskId, priority: newPriority }).catch(() => loadTasks());
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task from ClickUp?")) return;
    updateTasksLocally(prev => prev.filter(t => t.id !== taskId));
    if (selectedTaskForDetail?.id === taskId) {
      setSelectedTaskForDetail(null);
    }
    if (userId) { queueClickUpDelete(userId, taskId); void flushClickUpMutationQueue(userId, setPendingSync); }
    else void deleteClickUpTask(taskId).catch(() => loadTasks());
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreatingTask(true);
    try {
      const assigneesPayload = newTaskAssigneeId ? [Number(newTaskAssigneeId)] : undefined;
      await createClickUpTask({
        name: newTaskName.trim(),
        description: newTaskDesc.trim(),
        meetingTitle: newTaskMeetingTitle.trim() || undefined,
        status: newTaskStatus,
        priority: newTaskPriority,
        dueDate: newTaskDueDate || null,
        assignees: assigneesPayload,
        listId: selectedListId || undefined,
      });
      setShowCreateModal(false);
      setNewTaskName("");
      setNewTaskDesc("");
      setNewTaskMeetingTitle("");
      setNewTaskDueDate("");
      setNewTaskAssigneeId("");
      await loadTasks();
    } catch (err: any) {
      alert(err.message || "Failed to create task in ClickUp.");
    } finally {
      setCreatingTask(false);
    }
  };

  // Derive filter lists
  const allAssignees = useMemo(() => {
    const map = new Map<string, string>();
    availableMembers.forEach(m => map.set(String(m.id), m.username));
    tasks.forEach(t => {
      t.assignees.forEach(a => map.set(String(a.id), a.username));
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [availableMembers, tasks]);

  const allMeetings = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      if (t.meetingTitle) set.add(t.meetingTitle);
    });
    return Array.from(set);
  }, [tasks]);

  // Filtered available lists for dropdown search
  const filteredAvailableLists = useMemo(() => {
    const q = listSearchQuery.trim().toLowerCase();
    if (!q) return availableLists;
    return availableLists.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        l.spaceName.toLowerCase().includes(q) ||
        (l.folderName && l.folderName.toLowerCase().includes(q))
    );
  }, [availableLists, listSearchQuery]);

  // Grouped lists by Space
  const listsBySpace = useMemo(() => {
    const map = new Map<string, typeof availableLists>();
    filteredAvailableLists.forEach(l => {
      const space = l.spaceName || "Workspace Lists";
      if (!map.has(space)) map.set(space, []);
      map.get(space)!.push(l);
    });
    return Array.from(map.entries());
  }, [filteredAvailableLists]);

  // Helper to get category for any status
  const getStatusCategory = (statusStr: string): string => {
    const s = statusStr.toLowerCase();
    for (const cat of statusCategories) {
      if (cat.statuses.some(st => st.status.toLowerCase() === s)) {
        return cat.category;
      }
    }
    if (s.includes("complete") || s.includes("done")) return "Done";
    if (s.includes("closed")) return "Closed";
    if (s.includes("progress") || s.includes("ongoing") || s.includes("delayed")) return "Active";
    return "Not started";
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesDesc = t.description.toLowerCase().includes(q);
        const matchesMeeting = (t.meetingTitle || "").toLowerCase().includes(q);
        const matchesAssignee = t.assignees.some(a =>
          a.username.toLowerCase().includes(q)
        );
        if (!matchesName && !matchesDesc && !matchesMeeting && !matchesAssignee) {
          return false;
        }
      }

      // Status
      if (statusFilter !== "all" && t.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Assignee
      if (assigneeFilter !== "all") {
        const hasAssignee = t.assignees.some(a => String(a.id) === assigneeFilter);
        if (!hasAssignee) return false;
      }

      // Meeting
      if (meetingFilter !== "all" && t.meetingTitle !== meetingFilter) {
        return false;
      }

      // Date Filter
      if (dateFilter !== "all" && t.dueDate) {
        const due = new Date(t.dueDate);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (dateFilter === "today") {
          const isToday =
            due.getFullYear() === now.getFullYear() &&
            due.getMonth() === now.getMonth() &&
            due.getDate() === now.getDate();
          if (!isToday) return false;
        } else if (dateFilter === "overdue") {
          const cat = getStatusCategory(t.status);
          if (due >= now || cat === "Done" || cat === "Closed") return false;
        } else if (dateFilter === "upcoming") {
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (due < now || due > nextWeek) return false;
        }
      } else if (dateFilter !== "all" && !t.dueDate) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, statusFilter, assigneeFilter, dateFilter, meetingFilter, statusCategories]);

  // Metrics
  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => {
      const cat = getStatusCategory(t.status);
      return cat === "Done" || cat === "Closed";
    }).length;
    const inProgress = tasks.filter(t => getStatusCategory(t.status) === "Active").length;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = tasks.filter(t => {
      const cat = getStatusCategory(t.status);
      return t.dueDate && new Date(t.dueDate) < now && cat !== "Done" && cat !== "Closed";
    }).length;

    return { total, completed, inProgress, overdue };
  }, [tasks, statusCategories]);

  const getPriorityBadge = (priority: string) => {
    const p = priority.toLowerCase();
    if (p.includes("urgent")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 uppercase tracking-wider rounded-none">
          <span className="w-1.5 h-1.5 bg-red-600"></span> Urgent
        </span>
      );
    }
    if (p.includes("high")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 uppercase tracking-wider rounded-none">
          <span className="w-1.5 h-1.5 bg-amber-600"></span> High
        </span>
      );
    }
    if (p.includes("normal") || p.includes("medium")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-[#003366] uppercase tracking-wider rounded-none">
          <span className="w-1.5 h-1.5 bg-[#003366]"></span> Normal
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-[#FFFCFB] text-gray-600 uppercase tracking-wider rounded-none">
        <span className="w-1.5 h-1.5 bg-gray-400"></span> Low
      </span>
    );
  };

  const getStatusBadge = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    const cat = getStatusCategory(s);

    let badgeClass = "bg-[#FFFCFB] text-gray-700 border-gray-200";
    if (cat === "Not started") badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    else if (cat === "Active") {
      if (s.includes("delayed")) badgeClass = "bg-red-50 text-red-700 border-red-200";
      else if (s.includes("recovery")) badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
      else badgeClass = "bg-yellow-50 text-yellow-800 border-yellow-200";
    } else if (cat === "Done") {
      if (s.includes("delayed")) badgeClass = "bg-pink-50 text-pink-700 border-pink-200";
      else if (s.includes("onhold") || s.includes("shelved")) badgeClass = "bg-[#FFFCFB] text-gray-600 border-gray-200";
      else badgeClass = "bg-blue-50 text-[#003366] border-blue-200";
    } else if (cat === "Closed") {
      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
    }

    return (
      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border rounded-none ${badgeClass}`}>
        {statusStr}
      </span>
    );
  };

  // Kanban Board Columns by Category
  const KANBAN_CATEGORIES: Array<{ key: string; label: string; color: string }> = [
    { key: "Not started", label: "NOT STARTED", color: "border-amber-400" },
    { key: "Active", label: "ACTIVE & ONGOING", color: "border-blue-500" },
    { key: "Done", label: "DONE & RESOLVED", color: "border-purple-500" },
    { key: "Closed", label: "CLOSED", color: "border-emerald-500" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFCFB] overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-[#FFFCFB] border-b border-gray-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1b1d1e] flex items-center justify-center text-[#c9ab4c]">
            <CheckSquare size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif italic font-bold text-xl text-[#003366] leading-none">
                Meeting Action Items & Tasks
              </h1>
              <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 border border-purple-200 tracking-wider uppercase">
                {pendingSync ? `${pendingSync} change${pendingSync === 1 ? "" : "s"} syncing` : "Up to date"}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Closed-loop operational execution synchronized directly with ClickUp. Click any task to view or edit details.
            </p>
          </div>
        </div>

        {/* View Switcher, List Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active ClickUp List Selector Dropdown */}
          <div className="relative" ref={listDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setIsListDropdownOpen(!isListDropdownOpen);
                if (availableLists.length === 0) loadDiscoveredLists(false);
              }}
              title="Click to switch ClickUp list"
              className="flex items-center gap-2 px-3 py-1.5 bg-[#FAF9F7] hover:bg-[#FFFCFB] border border-[#1b1d1e]/20 hover:border-[#c9ab4c] transition-all text-xs font-semibold text-[#1b1d1e] shadow-2xs rounded-none cursor-pointer"
            >
              <FolderKanban size={15} className="text-[#c9ab4c] shrink-0" />
              <div className="flex flex-col text-left leading-tight max-w-[170px] sm:max-w-[240px] truncate">
                <span className="text-[9px] uppercase tracking-widest text-gray-500 font-bold truncate">
                  {selectedSpaceName || "ClickUp Space"}
                </span>
                <span className="text-xs font-bold text-[#003366] truncate">
                  {selectedListName || (selectedListId ? `List #${selectedListId}` : "Select List...")}
                </span>
              </div>
              <ChevronDown
                size={13}
                className={`text-gray-400 ml-1 transition-transform ${isListDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown Menu */}
            {isListDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-80 sm:w-96 bg-[#FFFCFB] border-2 border-[#1b1d1e] shadow-2xl z-50 rounded-none overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                {/* Search / Filter bar inside dropdown */}
                <div className="p-2.5 bg-[#1b1d1e] text-white border-b border-[#2c2f32]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[#c9ab4c]">
                      Workspace Lists
                    </span>
                    <button
                      type="button"
                      onClick={() => loadDiscoveredLists(true)}
                      disabled={loadingLists}
                      className="text-[10px] text-gray-300 hover:text-white flex items-center gap-1 font-bold disabled:opacity-50 cursor-pointer"
                    >
                      <FolderSync size={11} className={loadingLists ? "animate-spin text-[#c9ab4c]" : ""} />
                      <span>{loadingLists ? "Scanning..." : "Rescan"}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#25282a] border border-[#3a3e42] px-2 py-1 text-xs">
                    <Search size={12} className="text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Filter spaces and lists..."
                      value={listSearchQuery}
                      onChange={(e) => setListSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-white placeholder-gray-500 outline-none text-xs"
                      autoFocus
                    />
                    {listSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setListSearchQuery("")}
                        className="text-gray-400 hover:text-white cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lists Content */}
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {loadingLists && availableLists.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-[#c9ab4c]" />
                      <span>Discovering workspace lists...</span>
                    </div>
                  ) : listsBySpace.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-500">
                      {listSearchQuery ? "No lists match your search." : "No lists found. Click Rescan to discover."}
                    </div>
                  ) : (
                    listsBySpace.map(([spaceName, spaceLists]) => (
                      <div key={spaceName}>
                        <div className="bg-[#FFFCFB] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-100 flex items-center justify-between">
                          <span>{spaceName}</span>
                          <span className="text-gray-400">{spaceLists.length} lists</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {spaceLists.map((l) => {
                            const isSelected = selectedListId === l.id;
                            return (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => handleSelectList(l)}
                                className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between group transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-amber-50/70 border-l-4 border-[#c9ab4c]"
                                    : "hover:bg-[#FFFCFB]"
                                }`}
                              >
                                <div className="truncate pr-2">
                                  {l.folderName && (
                                    <span className="text-[10px] text-gray-400 block font-normal truncate">
                                      {l.folderName}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs font-semibold block truncate ${
                                      isSelected ? "text-[#003366] font-bold" : "text-gray-800 group-hover:text-[#003366]"
                                    }`}
                                  >
                                    {l.name}
                                  </span>
                                </div>
                                {isSelected ? (
                                  <Check size={14} className="text-[#c9ab4c] shrink-0" />
                                ) : (
                                  <ChevronRight
                                    size={13}
                                    className="text-gray-300 group-hover:text-[#003366] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Dropdown Footer */}
                <div className="p-2 bg-[#FFFCFB] border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-500 px-3">
                  <span>
                    {availableLists.length > 0 ? `${availableLists.length} lists available` : "Click Rescan to refresh"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsListDropdownOpen(false);
                      setNeedsListSelection(true);
                    }}
                    className="text-[#003366] font-bold hover:underline cursor-pointer"
                  >
                    Manage / Switch
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Board / List Toggle */}
          <div className="flex bg-[#FFFCFB] p-0.5 border border-gray-200">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                viewMode === "board"
                  ? "bg-[#003366] text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Kanban size={13} />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-[#003366] text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <List size={13} />
              <span>List</span>
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => void requestTasksRefresh()}
            disabled={refreshing || loading}
            title="Refresh from ClickUp"
            className="p-1.5 text-gray-600 hover:text-[#003366] bg-[#FFFCFB] border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-[#c9ab4c]" : ""} />
          </button>

          {/* Create Task Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Metric Strip */}
      <div className="bg-[#1b1d1e] text-white px-6 py-2.5 border-b border-[#c9ab4c]/30 flex items-center justify-between gap-4 shrink-0 text-xs">
        <div className="flex items-center gap-6 divide-x divide-white/10">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
              Total Synced:
            </span>
            <span className="font-mono font-bold text-white text-sm">{metrics.total}</span>
          </div>
          <div className="pl-6 flex items-center gap-2">
            <span className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
              In Progress / Active:
            </span>
            <span className="font-mono font-bold text-blue-400 text-sm">{metrics.inProgress}</span>
          </div>
          <div className="pl-6 flex items-center gap-2">
            <span className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
              Completed / Done:
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm">{metrics.completed}</span>
          </div>
          <div className="pl-6 flex items-center gap-2">
            <span className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
              Overdue:
            </span>
            <span className="font-mono font-bold text-rose-400 text-sm">{metrics.overdue}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#c9ab4c]">
          <Tag size={12} />
          <span className="font-mono">Tag: meeting archive</span>
        </div>
      </div>

      {/* Enterprise Filter Bar */}
      <div className="bg-[#FFFCFB] border-b border-gray-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks, meetings, assignees..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-[#FFFCFB] border border-gray-200 text-xs w-60 focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
            />
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 text-xs bg-[#FFFCFB] border border-gray-200 text-gray-700 outline-none focus:border-[#c9ab4c] font-bold uppercase"
          >
            <option value="all">Status: All Statuses</option>
            {statusCategories.map(cat => (
              <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                {cat.statuses.map(st => (
                  <option key={st.status} value={st.status}>
                    {st.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Date Range Selector */}
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as any)}
            className="px-2.5 py-1 text-xs bg-[#FFFCFB] border border-gray-200 text-gray-700 outline-none focus:border-[#c9ab4c]"
          >
            <option value="all">Due: All Dates</option>
            <option value="today">Due: Today</option>
            <option value="overdue">Due: Overdue</option>
            <option value="upcoming">Due: Next 7 Days</option>
          </select>

          {/* Assignee Filter Dropdown */}
          {allAssignees.length > 0 && (
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-[#FFFCFB] border border-gray-200 text-gray-700 outline-none focus:border-[#c9ab4c]"
            >
              <option value="all">Assignee: All Members</option>
              {allAssignees.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          {/* Meeting Origin Filter */}
          {allMeetings.length > 0 && (
            <select
              value={meetingFilter}
              onChange={e => setMeetingFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-[#FFFCFB] border border-gray-200 text-gray-700 outline-none focus:border-[#c9ab4c] max-w-[200px] truncate"
            >
              <option value="all">Meeting: All Sources</option>
              {allMeetings.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="text-[11px] text-gray-400">
          Showing <span className="font-bold text-gray-700">{filteredTasks.length}</span> of{" "}
          <span className="font-bold text-gray-700">{tasks.length}</span> tasks
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Auth / Connection Warning Card */}
        {/* List Selection Required Card */}
        {needsListSelection && !loading && (
          <div className="max-w-3xl mx-auto mb-8 bg-[#FFFCFB] border-2 border-[#1b1d1e] p-7 shadow-xl rounded-none">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="w-10 h-10 bg-[#1b1d1e] text-[#c9ab4c] flex items-center justify-center shrink-0">
                <FolderKanban size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-bold text-xl text-[#003366]">
                    Select a ClickUp List to Display
                  </h3>
                  <span className="text-[9px] uppercase tracking-widest bg-amber-50 text-[#003366] font-bold px-2 py-0.5 border border-[#c9ab4c]/40">
                    Workspace Connected
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Choose which list inside your connected ClickUp workspace you would like to view and synchronize with Mosaic.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-700">
                    Available Lists in Your Workspace
                  </label>
                  <button
                    type="button"
                    onClick={() => loadDiscoveredLists(true)}
                    disabled={loadingLists}
                    className="text-[11px] text-[#003366] hover:text-[#c9ab4c] font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <FolderSync size={13} className={loadingLists ? "animate-spin text-[#c9ab4c]" : ""} />
                    <span>{loadingLists ? "Scanning Workspace..." : "Rescan Lists"}</span>
                  </button>
                </div>

                {availableLists.length > 0 ? (
                  <div className="border border-gray-200 divide-y divide-gray-100 max-h-80 overflow-y-auto bg-[#FAF9F7]">
                    {listsBySpace.map(([spaceName, spaceLists]) => (
                      <div key={spaceName}>
                        <div className="bg-[#FFFCFB]/80 px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-600 border-b border-gray-200 flex items-center justify-between">
                          <span>{spaceName}</span>
                          <span className="text-gray-400">{spaceLists.length} lists</span>
                        </div>
                        <div className="divide-y divide-gray-100 bg-[#FFFCFB]">
                          {spaceLists.map((l) => (
                            <div
                              key={l.id}
                              className="px-4 py-3 hover:bg-amber-50/60 transition-colors flex items-center justify-between gap-4"
                            >
                              <div className="truncate">
                                {l.folderName && (
                                  <span className="text-[10px] text-gray-400 font-semibold block uppercase tracking-wider">
                                    {l.folderName}
                                  </span>
                                )}
                                <span className="text-xs font-bold text-gray-900 block truncate">
                                  {l.name}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  ID: {l.id}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSelectList(l)}
                                className="btn-primary !py-1.5 !px-3.5 !text-xs shrink-0 flex items-center gap-1 cursor-pointer"
                              >
                                <span>Select & Sync</span>
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 bg-[#FFFCFB] border border-gray-200 text-center">
                    {loadingLists ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
                        <RefreshCw size={20} className="animate-spin text-[#c9ab4c]" />
                        <span className="font-semibold text-gray-700">Auto-discovering spaces and lists in your ClickUp workspace...</span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-500 mb-3">
                          No lists were automatically discovered from your workspace. Click the button below to scan.
                        </p>
                        <button
                          type="button"
                          onClick={() => loadDiscoveredLists(true)}
                          className="btn-primary !py-2 !px-4 !text-xs inline-flex items-center gap-2 cursor-pointer"
                        >
                          <FolderSync size={14} />
                          <span>Scan Workspace Lists</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual List ID input fallback */}
              <div className="pt-3 border-t border-gray-100">
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer font-bold hover:text-[#003366] text-[11px]">
                    Or enter a ClickUp List ID manually
                  </summary>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 9012345678"
                      value={listIdInput}
                      onChange={(e) => setListIdInput(e.target.value)}
                      className="flex-1 border border-gray-300 p-2 text-xs font-mono bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!listIdInput.trim()) return;
                        setSelectedListId(listIdInput.trim());
                        setStoredClickUpListId(listIdInput.trim());
                        setNeedsListSelection(false);
                        loadTasks(false, listIdInput.trim());
                      }}
                      className="btn-primary !py-2 !px-4 !text-xs cursor-pointer"
                    >
                      Connect ID
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}

        {/* Auth / Connection Warning Card */}
        {needsAuth && (
          <div className="max-w-2xl mx-auto mb-6 bg-[#FFFCFB] border-2 border-[#003366] p-6 shadow-md">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="text-[#c9ab4c] shrink-0 mt-0.5" size={22} />
              <div>
                <h3 className="font-serif italic font-bold text-lg text-[#003366]">
                  Connect Your ClickUp Workspace
                </h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Mosaic synchronizes live tasks with ClickUp. Please sign in with ClickUp or provide a personal API token.
                </p>
              </div>
            </div>

            <div className="space-y-3.5 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <a
                  href="/api/auth/clickup"
                  className="btn-primary !py-2 !px-4 !text-xs flex items-center gap-1.5"
                >
                  <ExternalLink size={13} />
                  <span>Sign In with ClickUp</span>
                </a>
                <span className="text-xs text-gray-400">or configure a token below</span>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  ClickUp Personal API Token (pk_...)
                </label>
                <input
                  type="password"
                  placeholder="pk_12345678_..."
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs font-mono bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Connected successfully!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  className="btn-primary !py-2 !px-5 !text-xs ml-auto shadow-xs cursor-pointer"
                >
                  Save & Connect ClickUp
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <RefreshCw size={24} className="animate-spin text-[#c9ab4c] mb-3" />
            <p className="text-xs font-semibold">Synchronizing with ClickUp API...</p>
          </div>
        )}

        {/* Error Notification */}
        {!loading && error && !needsAuth && !needsListSelection && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNeedsListSelection(true)}
                className="font-bold underline hover:text-red-900 cursor-pointer"
              >
                Change List
              </button>
              <button
                onClick={() => loadTasks()}
                className="font-bold underline hover:text-red-900 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredTasks.length === 0 && (
          <div className="text-center py-16 bg-[#FFFCFB] border border-gray-200 p-8 max-w-xl mx-auto">
            <CheckSquare size={32} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-serif italic font-bold text-base text-[#003366] mb-1">
              No Meeting Tasks Found
            </h3>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed max-w-sm mx-auto">
              No tasks matched your current filters. Add tasks from the Notetaker discussion points,
              or create one directly above.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary !py-1.5 !px-4 !text-xs"
            >
              Create First Task
            </button>
          </div>
        )}

        {/* ─── BOARD VIEW (KANBAN) ─── */}
        {!loading && !error && viewMode === "board" && filteredTasks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {KANBAN_CATEGORIES.map(col => {
              const colTasks = filteredTasks.filter(
                t => getStatusCategory(t.status) === col.key
              );

              return (
                <div
                  key={col.key}
                  className="bg-[#FFFCFB]/80 border border-gray-200 flex flex-col min-h-[500px]"
                >
                  {/* Column Header */}
                  <div className={`bg-[#FFFCFB] px-3.5 py-2.5 border-b-2 ${col.color} flex items-center justify-between shadow-2xs`}>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-[11px] uppercase tracking-wider text-gray-800">
                        {col.label}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#FFFCFB] text-gray-700 px-1.5 py-0.2">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Column Task Cards */}
                  <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto">
                    {colTasks.map(task => (
                      <div
                        key={task.id}
                        onClick={() => openTaskDetail(task)}
                        className="bg-[#FFFCFB] border border-gray-200 hover:border-[#c9ab4c] p-3 shadow-2xs transition-all flex flex-col justify-between group cursor-pointer hover:shadow-xs"
                      >
                        <div>
                          {/* Priority & Specific Status Badge */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            {getPriorityBadge(task.priority)}
                            {getStatusBadge(task.status)}
                          </div>

                          {/* Task Name */}
                          <h5 className="text-xs font-bold text-gray-900 leading-snug mb-1.5 group-hover:text-[#003366] transition-colors">
                            {task.name}
                          </h5>

                          {/* Originating Meeting Badge */}
                          {task.meetingTitle && (
                            <div
                              onClick={e => {
                                e.stopPropagation();
                                if (onSelectMeeting) onSelectMeeting(task.meetingTitle!);
                              }}
                              className="flex items-center gap-1 text-[10px] text-[#003366] bg-blue-50/70 border border-blue-100 px-2 py-0.5 mb-2 font-medium hover:bg-blue-100/70"
                            >
                              <Link2 size={10} className="shrink-0 text-[#c9ab4c]" />
                              <span className="truncate">{task.meetingTitle}</span>
                            </div>
                          )}

                          {/* Due Date Indicator */}
                          {task.dueDate && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-2 font-mono">
                              <Calendar size={10} />
                              <span>{formatEchoDate(task.dueDate)}</span>
                              {new Date(task.dueDate) < new Date() &&
                                getStatusCategory(task.status) !== "Done" &&
                                getStatusCategory(task.status) !== "Closed" && (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.2 ml-1">
                                    OVERDUE
                                  </span>
                                )}
                            </div>
                          )}
                        </div>

                        {/* Card Footer: Assignee & Quick Status Changer */}
                        <div
                          onClick={e => e.stopPropagation()}
                          className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 mt-1"
                        >
                          {/* Assignee Avatar / Name */}
                          <div className="flex items-center gap-1 text-[10px] text-gray-600 truncate">
                            {task.assignees.length > 0 ? (
                              <div className="flex items-center gap-1 truncate">
                                <div className="w-4 h-4 bg-[#003366] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {task.assignees[0].initials}
                                </div>
                                <span className="truncate max-w-[80px]">
                                  {task.assignees[0].username}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Unassigned</span>
                            )}
                          </div>

                          {/* Status Quick Switcher */}
                          <select
                            value={task.status.toLowerCase()}
                            onChange={e => handleStatusChange(task.id, e.target.value)}
                            className="text-[9px] uppercase font-bold tracking-wider bg-[#FFFCFB] border border-gray-200 text-gray-700 py-0.5 px-1 outline-none hover:border-gray-400 cursor-pointer max-w-[120px] truncate"
                          >
                            {statusCategories.map(cat => (
                              <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                                {cat.statuses.map(s => (
                                  <option key={s.status} value={s.status}>
                                    {s.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── LIST VIEW (TABLE) ─── */}
        {!loading && !error && viewMode === "list" && filteredTasks.length > 0 && (
          <div className="bg-[#FFFCFB] border border-gray-200 overflow-x-auto shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#1b1d1e] text-white border-b border-[#c9ab4c]/40 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Task Name</th>
                  <th className="py-2.5 px-4">Meeting Origin</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Assignee</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTasks.map(task => (
                  <tr
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                  >
                    {/* Status Column */}
                    <td className="py-2.5 px-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={task.status.toLowerCase()}
                        onChange={e => handleStatusChange(task.id, e.target.value)}
                        className="text-[10px] uppercase font-bold tracking-wider bg-[#FFFCFB] border border-gray-200 text-gray-800 py-1 px-1.5 outline-none hover:border-[#c9ab4c]"
                      >
                        {statusCategories.map(cat => (
                          <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                            {cat.statuses.map(s => (
                              <option key={s.status} value={s.status}>
                                {s.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>

                    {/* Name Column */}
                    <td className="py-2.5 px-4 font-bold text-gray-900 max-w-sm">
                      <div className="line-clamp-2 hover:text-[#003366]">{task.name}</div>
                    </td>

                    {/* Meeting Origin Column */}
                    <td className="py-2.5 px-4 text-gray-600" onClick={e => e.stopPropagation()}>
                      {task.meetingTitle ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectMeeting) onSelectMeeting(task.meetingTitle!);
                          }}
                          className="flex items-center gap-1.5 text-[11px] text-[#003366] hover:underline font-medium"
                        >
                          <Link2 size={11} className="text-[#c9ab4c] shrink-0" />
                          <span className="truncate max-w-[180px]">{task.meetingTitle}</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 italic">Direct Task</span>
                      )}
                    </td>

                    {/* Priority Column */}
                    <td className="py-2.5 px-4" onClick={e => e.stopPropagation()}>
                      <select
                        value={task.priority.toLowerCase()}
                        onChange={e => handlePriorityChange(task.id, e.target.value)}
                        className="text-[10px] uppercase font-bold bg-transparent border-0 text-gray-700 outline-none cursor-pointer"
                      >
                        <option value="urgent">🔴 Urgent</option>
                        <option value="high">🟠 High</option>
                        <option value="normal">🔵 Normal</option>
                        <option value="low">⚪ Low</option>
                      </select>
                    </td>

                    {/* Assignee Column */}
                    <td className="py-2.5 px-4 text-gray-600">
                      {task.assignees.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 bg-[#003366] text-white text-[10px] font-bold flex items-center justify-center">
                            {task.assignees[0].initials}
                          </div>
                          <span className="truncate max-w-[120px]">{task.assignees[0].username}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Due Date Column */}
                    <td className="py-2.5 px-4 font-mono text-[11px] text-gray-600">
                      {task.dueDate ? (
                        <span
                          className={
                            new Date(task.dueDate) < new Date() &&
                            getStatusCategory(task.status) !== "Done" &&
                            getStatusCategory(task.status) !== "Closed"
                              ? "text-rose-600 font-bold"
                              : ""
                          }
                        >
                          {formatEchoDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openTaskDetail(task)}
                          title="View / Edit Details"
                          className="p-1 text-gray-400 hover:text-[#003366]"
                        >
                          <Edit3 size={13} />
                        </button>
                        {task.url && (
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in ClickUp"
                            className="p-1 text-gray-400 hover:text-[#003366]"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          title="Delete from ClickUp"
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── TASK DETAIL & EDIT MODAL ─── */}
      {/* ─── TASK DETAIL & EDIT MODAL ─── */}
      {selectedTaskForDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#FFFCFB] border-2 border-[#003366] shadow-2xl p-6 w-full max-w-4xl rounded-none animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-200 pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono uppercase bg-purple-50 text-purple-700 px-1.5 py-0.2 font-bold">
                    ClickUp Task #{selectedTaskForDetail.id}
                  </span>
                  {selectedTaskForDetail.discussionPointId && (
                    <span className="text-[10px] font-mono bg-blue-50 text-[#003366] px-1.5 py-0.2 font-bold">
                      DP ID: {selectedTaskForDetail.discussionPointId}
                    </span>
                  )}
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.2 font-bold">
                    Tag: meeting archive
                  </span>
                </div>
                <h3 className="font-serif italic font-bold text-xl text-[#003366]">
                  Task Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTaskForDetail(null);
                  if (onClearFocusedTask) onClearFocusedTask();
                }}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTaskDetail} className="space-y-4">
              {/* 2-Column Rectangular Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column Left: Task Details */}
                <div className="space-y-3.5">
                  <div className="border-b border-gray-100 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#003366]">
                      Task Attributes
                    </span>
                  </div>

                  {/* Task Title */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Task Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full border border-gray-300 p-2 text-xs font-bold text-gray-900 bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none"
                    />
                  </div>

                  {/* Originating Meeting Context */}
                  {selectedTaskForDetail.meetingTitle && (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-100 flex items-center justify-between text-xs text-[#003366]">
                      <div className="flex items-center gap-2 truncate">
                        <Link2 size={13} className="text-[#c9ab4c] shrink-0" />
                        <span className="font-semibold truncate">
                          Originating Meeting: {selectedTaskForDetail.meetingTitle}
                        </span>
                      </div>
                      {onSelectMeeting && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskForDetail(null);
                            onSelectMeeting(selectedTaskForDetail.meetingTitle!);
                          }}
                          className="text-[11px] font-bold underline hover:text-[#c9ab4c] shrink-0 ml-2"
                        >
                          View Meeting
                        </button>
                      )}
                    </div>
                  )}

                  {/* Status & Priority Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                        ClickUp Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={e => setEditStatus(e.target.value)}
                        className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none font-bold uppercase"
                      >
                        {statusCategories.map(cat => (
                          <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                            {cat.statuses.map(st => (
                              <option key={st.status} value={st.status}>
                                {st.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={editPriority}
                        onChange={e => setEditPriority(e.target.value)}
                        className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none font-bold uppercase"
                      >
                        <option value="urgent">🔴 Urgent</option>
                        <option value="high">🟠 High</option>
                        <option value="normal">🔵 Normal</option>
                        <option value="low">⚪ Low</option>
                      </select>
                    </div>
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Due Date {editDueDate && <span className="text-gray-400 font-normal">({formatEchoDate(editDueDate)})</span>}
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={e => setEditDueDate(e.target.value)}
                      className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none"
                    />
                  </div>

                  {/* Assignee with SearchableMemberSelect */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Assignee (Space Members)
                    </label>
                    <SearchableMemberSelect
                      members={availableMembers}
                      selectedMemberId={editAssigneeId}
                      onChange={setEditAssigneeId}
                      placeholder="-- Select Space Member --"
                    />
                  </div>
                </div>

                {/* Column Right: Description & Context */}
                <div className="flex flex-col h-full space-y-2">
                  <div className="border-b border-gray-100 pb-1.5 flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#003366]">
                      Description & Context
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">Executive Format</span>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <textarea
                      rows={12}
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Executive context, action plan, and meeting evidence..."
                      className="w-full flex-1 min-h-[260px] border border-gray-300 p-3 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none resize-none font-mono leading-relaxed rounded-none"
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                      <span>Synchronized with ClickUp task description</span>
                      <span>Tag: meeting archive</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(selectedTaskForDetail.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 text-xs flex items-center gap-1 rounded-none"
                  >
                    <Trash2 size={13} />
                    <span>Delete Task</span>
                  </button>

                  {selectedTaskForDetail.url && (
                    <a
                      href={selectedTaskForDetail.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-gray-600 hover:text-[#003366] text-xs flex items-center gap-1"
                    >
                      <ExternalLink size={13} />
                      <span>Open in ClickUp</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editSavedSuccess && (
                    <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                      <Check size={14} /> Saved in ClickUp!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaskForDetail(null);
                      if (onClearFocusedTask) onClearFocusedTask();
                    }}
                    className="btn-outline !py-1.5 !px-3.5 !text-xs rounded-none"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn-primary !py-1.5 !px-4 !text-xs flex items-center gap-1.5 shadow-xs rounded-none"
                  >
                    {savingEdit ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Updating ClickUp...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CREATE TASK MODAL ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#FFFCFB] border-2 border-[#003366] shadow-2xl p-6 w-full max-w-lg rounded-none">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="text-[#c9ab4c]" size={20} />
                <h3 className="font-serif italic font-bold text-xl text-[#003366]">
                  Create ClickUp Task
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Follow up on Q4 financial projections"
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Originating Meeting Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Executive Board Meeting - Sept 9"
                  value={newTaskMeetingTitle}
                  onChange={e => setNewTaskMeetingTitle(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value)}
                    className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                  >
                    <option value="urgent">🔴 Urgent</option>
                    <option value="high">🟠 High</option>
                    <option value="normal">🔵 Normal</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={newTaskStatus}
                    onChange={e => setNewTaskStatus(e.target.value)}
                    className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none uppercase font-bold"
                  >
                    {statusCategories.map(cat => (
                      <optgroup key={cat.category} label={`── ${cat.category} ──`}>
                        {cat.statuses.map(s => (
                          <option key={s.status} value={s.status}>
                            {s.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Assignee (Space Members)
                  </label>
                  <SearchableMemberSelect
                    members={availableMembers}
                    selectedMemberId={newTaskAssigneeId}
                    onChange={setNewTaskAssigneeId}
                    placeholder="-- Select Space Member --"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Description / Action Plan
                </label>
                <textarea
                  rows={3}
                  placeholder="Specific deliverables, discussion point context, and expected outcomes..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-outline !py-1.5 !px-3.5 !text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTask}
                  className="btn-primary !py-1.5 !px-4 !text-xs flex items-center gap-1.5 shadow-xs"
                >
                  {creatingTask ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Creating in ClickUp...</span>
                    </>
                  ) : (
                    <span>Push to ClickUp</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
