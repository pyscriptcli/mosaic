"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  CheckSquare,
  X,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Users,
  AlertCircle,
  FolderKanban,
  FolderSync,
  Check,
  ChevronDown
} from "lucide-react";
import {
  createClickUpTask,
  fetchClickUpTasks,
  getStoredClickUpToken,
  getStoredClickUpListId,
  setStoredClickUpListId,
  getStoredClickUpListName,
  setStoredClickUpListName,
  discoverClickUpLists
} from "@/lib/api";
import { WORKSPACE_STATUS_CATEGORIES } from "@/lib/clickupStatuses";
import { SearchableMemberMultiSelect } from "./SearchableMemberSelect";
import { formatEchoDate } from "@/lib/dateUtils";

interface QuickAddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    name?: string;
    description?: string;
    meetingTitle?: string;
    meetingDate?: string;
    dueDate?: string;
    priority?: string;
    assigneeName?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    topic?: string;
    evidence?: string;
    discussionPointId?: string;
    existingTaskId?: string;
    existingTaskUrl?: string;
  };
  onTaskCreated?: (task: any) => void;
  onOpenInTasks?: (taskId: string) => void;
}

export function QuickAddTaskModal({
  isOpen,
  onClose,
  initialData,
  onTaskCreated,
  onOpenInTasks
}: QuickAddTaskModalProps) {
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [status, setStatus] = useState("to do");
  const [dueDate, setDueDate] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [customAssigneeName, setCustomAssigneeName] = useState("");

  // Configurable ClickUp Space & List state
  const [selectedSpace, setSelectedSpace] = useState<string>("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [availableLists, setAvailableLists] = useState<
    Array<{ id: string; name: string; spaceName: string; folderName?: string; teamName?: string }>
  >([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // ClickUp members and statuses from API
  const [availableMembers, setAvailableMembers] = useState<
    Array<{ id: number | string; username: string; email: string; initials: string }>
  >([]);
  const [statusCategories, setStatusCategories] = useState(WORKSPACE_STATUS_CATEGORIES);

  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [isAlreadyCreated, setIsAlreadyCreated] = useState(false);

  // Unique available spaces
  const availableSpaces = useMemo(() => {
    const spaces = Array.from(new Set(availableLists.map(l => l.spaceName).filter(Boolean)));
    return spaces.sort((a, b) => a.localeCompare(b));
  }, [availableLists]);

  // Lists filtered by chosen space
  const listsInSelectedSpace = useMemo(() => {
    if (!selectedSpace) return availableLists;
    return availableLists.filter(l => l.spaceName === selectedSpace);
  }, [availableLists, selectedSpace]);

  // Load members and statuses for target list
  const loadWorkspaceContext = async (targetListId?: string) => {
    setLoadingMembers(true);
    try {
      const data = await fetchClickUpTasks(targetListId);
      if (data.members && Array.isArray(data.members)) {
        setAvailableMembers(data.members);
      }
      if (data.categories && Array.isArray(data.categories)) {
        setStatusCategories(data.categories);
      }
      if (data.spaceName) {
        setSelectedSpace(prev => prev || data.spaceName);
      }
    } catch (e) {
      console.warn("Could not preload ClickUp members:", e);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Discover all spaces and lists
  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const data = await discoverClickUpLists();
      const lists = data.lists || [];
      setAvailableLists(lists);

      const currentListId = selectedListId || getStoredClickUpListId();
      if (lists.length > 0) {
        if (currentListId) {
          const matched = lists.find((l: any) => l.id === currentListId);
          if (matched) {
            setSelectedSpace(matched.spaceName);
            setSelectedListId(matched.id);
            return;
          }
        }
        // Fallback to first discovered list
        setSelectedSpace(lists[0].spaceName);
        setSelectedListId(lists[0].id);
        const displayName = lists[0].folderName ? `${lists[0].folderName} / ${lists[0].name}` : lists[0].name;
        setStoredClickUpListId(lists[0].id);
        setStoredClickUpListName(displayName);
      }
    } catch (e) {
      console.warn("Could not discover ClickUp lists:", e);
    } finally {
      setLoadingLists(false);
    }
  };

  // Load members, statuses, and available lists on modal open
  useEffect(() => {
    if (isOpen) {
      const storedId = getStoredClickUpListId();
      if (storedId) setSelectedListId(storedId);
      loadWorkspaceContext(storedId || undefined);
      loadLists();
    }
  }, [isOpen]);

  const handleSpaceChange = (newSpace: string) => {
    setSelectedSpace(newSpace);
    const inSpace = availableLists.filter(l => l.spaceName === newSpace);
    if (inSpace.length > 0) {
      const nextList = inSpace[0];
      setSelectedListId(nextList.id);
      const displayName = nextList.folderName ? `${nextList.folderName} / ${nextList.name}` : nextList.name;
      setStoredClickUpListId(nextList.id);
      setStoredClickUpListName(displayName);
      loadWorkspaceContext(nextList.id);
    }
  };

  const handleListChange = (newListId: string) => {
    setSelectedListId(newListId);
    const found = availableLists.find(l => l.id === newListId);
    if (found) {
      const displayName = found.folderName ? `${found.folderName} / ${found.name}` : found.name;
      setStoredClickUpListId(found.id);
      setStoredClickUpListName(displayName);
    }
    loadWorkspaceContext(newListId);
  };

  useEffect(() => {
    if (initialData) {
      setTaskName(initialData.name || "");
      setDescription(initialData.description || "");
      setMeetingTitle(initialData.meetingTitle || "");
      setMeetingDate(initialData.meetingDate || "");
      setDueDate(initialData.dueDate || "");
      setPriority(initialData.priority || "normal");
      setCustomAssigneeName(initialData.assigneeName || "");
      setSelectedAssigneeIds(initialData.assigneeIds || (initialData.assigneeId ? [initialData.assigneeId] : []));

      if (initialData.existingTaskId) {
        setCreatedTaskId(initialData.existingTaskId);
        setCreatedUrl(initialData.existingTaskUrl || null);
        setIsAlreadyCreated(true);
      } else {
        setCreatedTaskId(null);
        setCreatedUrl(null);
        setIsAlreadyCreated(false);
      }
    }
    setError(null);
  }, [initialData, isOpen]);

  // Pre-match assignee if name matches
  useEffect(() => {
    if (customAssigneeName && availableMembers.length > 0 && selectedAssigneeIds.length === 0) {
      const names = customAssigneeName.split(/[,;\n]/).map((name) => name.trim().toLowerCase()).filter(Boolean);
      const matches = availableMembers.filter((member) => names.some((name) => name === member.username.toLowerCase()));
      if (matches.length) setSelectedAssigneeIds(matches.map((member) => String(member.id)));
    }
  }, [customAssigneeName, availableMembers, selectedAssigneeIds.length]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let fullDescription = description.trim();
      const selectedMembers = availableMembers.filter((member) => selectedAssigneeIds.includes(String(member.id)));
      const selectedNames = selectedMembers.map((member) => member.username);
      const remainingNames = customAssigneeName.split(/[,;\n]/).map((name) => name.trim()).filter((name) => name && !selectedNames.some((selectedName) => selectedName.toLowerCase() === name.toLowerCase()));
      const assigneeLabel = [...selectedNames, ...remainingNames].join(", ");
      const assigneesPayload = selectedAssigneeIds.map(Number).filter(Number.isFinite);

      const res = await createClickUpTask({
        name: taskName.trim(),
        description: fullDescription,
        meetingTitle: meetingTitle.trim() || undefined,
        meetingDate: meetingDate.trim() || undefined,
        status,
        priority,
        dueDate: dueDate || null,
        assignees: assigneesPayload,
        discussionPointId: initialData?.discussionPointId,
        structuredDescription: true,
        personInCharge: assigneeLabel,
        topic: initialData?.topic || initialData?.name,
        discussion: description.trim(),
        evidence: initialData?.evidence,
        listId: selectedListId || getStoredClickUpListId() || undefined,
      });

      const taskId = res.id || res.task?.id;
      const url = res.url || res.task?.url;

      setCreatedTaskId(taskId);
      setCreatedUrl(url);
      setIsAlreadyCreated(!!res.alreadyExisted);

      if (onTaskCreated) {
        onTaskCreated({
          id: taskId,
          url,
          name: taskName.trim(),
          status,
          priority,
          discussionPointId: initialData?.discussionPointId,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to create task in ClickUp.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-[#FFFCFB] border-2 border-[#003366] shadow-2xl p-6 w-full max-w-lg rounded-none animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#1b1d1e] flex items-center justify-center text-[#c9ab4c]">
              <CheckSquare size={16} />
            </div>
            <div>
              <h3 className="font-serif italic font-bold text-lg text-[#003366] leading-none">
                Add to ClickUp Tasks
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Convert meeting discussion point into a tracked ClickUp task
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {createdUrl ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto rounded-none">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="font-serif italic font-bold text-base text-[#003366]">
              {isAlreadyCreated ? "Task Already Tracked in ClickUp!" : "Task Created in ClickUp!"}
            </h4>
            <p className="text-xs text-gray-600 max-w-xs mx-auto">
              This discussion point is linked to ClickUp with the meeting workflow tag.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3">
              {/* OPEN IN TASKS BUTTON */}
              {onOpenInTasks && createdTaskId && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInTasks(createdTaskId);
                  }}
                  className="btn-primary !py-2 !px-4 !text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <FolderKanban size={13} />
                  <span>Open in Tasks</span>
                </button>
              )}

              {/* OPEN IN CLICKUP */}
              <a
                href={createdUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-outline !py-2 !px-4 !text-xs flex items-center gap-1.5 text-[#003366]"
              >
                <ExternalLink size={13} />
                <span>Open in ClickUp</span>
              </a>

              {/* DONE */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-[#FFFCFB]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Configurable ClickUp Space & Target List */}
            <div className="bg-[#FAF9F7] border border-gray-200 p-3 rounded-none space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#003366]">
                  <FolderKanban size={13} className="text-[#c9ab4c]" />
                  <span>ClickUp Destination</span>
                </div>
                <button
                  type="button"
                  onClick={loadLists}
                  disabled={loadingLists}
                  title="Rescan ClickUp spaces and lists"
                  className="text-[10px] text-gray-500 hover:text-[#003366] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <FolderSync size={11} className={loadingLists ? "animate-spin text-[#c9ab4c]" : ""} />
                  <span>{loadingLists ? "Scanning..." : "Rescan"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Space Dropdown */}
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Space
                  </label>
                  {availableSpaces.length > 0 ? (
                    <div className="relative">
                      <select
                        value={selectedSpace}
                        onChange={(e) => handleSpaceChange(e.target.value)}
                        className="w-full border border-gray-300 p-2 pr-7 text-xs font-semibold text-gray-800 bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none appearance-none cursor-pointer"
                      >
                        {availableSpaces.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  ) : (
                    <div className="p-2 border border-gray-200 bg-[#FFFCFB] text-xs text-gray-500">
                      {loadingLists ? "Discovering spaces..." : (selectedSpace || "Default Space")}
                    </div>
                  )}
                </div>

                {/* List Dropdown */}
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Target List
                  </label>
                  {listsInSelectedSpace.length > 0 ? (
                    <div className="relative">
                      <select
                        value={selectedListId}
                        onChange={(e) => handleListChange(e.target.value)}
                        className="w-full border border-gray-300 p-2 pr-7 text-xs font-semibold text-gray-800 bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none appearance-none cursor-pointer"
                      >
                        {listsInSelectedSpace.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.folderName ? `${l.folderName} / ${l.name}` : l.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  ) : availableLists.length > 0 ? (
                    <div className="relative">
                      <select
                        value={selectedListId}
                        onChange={(e) => handleListChange(e.target.value)}
                        className="w-full border border-gray-300 p-2 pr-7 text-xs font-semibold text-gray-800 bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none appearance-none cursor-pointer"
                      >
                        {availableLists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.spaceName} → {l.folderName ? `${l.folderName} / ${l.name}` : l.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  ) : (
                    <div className="p-2 border border-gray-200 bg-[#FFFCFB] text-xs text-gray-500 truncate">
                      {loadingLists ? "Loading lists..." : (getStoredClickUpListName() || "Default List")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 rounded-none">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Task Title */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                Task Name *
              </label>
              <input
                type="text"
                required
                value={taskName}
                onChange={e => setTaskName(e.target.value)}
                placeholder="Action item summary..."
                className="w-full border border-gray-300 p-2 text-xs font-semibold text-gray-900 bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none"
              />
            </div>

            {/* Meeting Context */}
            {meetingTitle && (
              <div className="p-2 bg-blue-50/70 border border-blue-100 text-[11px] text-[#003366] flex items-center justify-between">
                <span className="font-semibold truncate max-w-[320px]">
                  🔗 Meeting: {meetingTitle}
                </span>
                {meetingDate && <span className="font-mono text-[10px] text-gray-500">{formatEchoDate(meetingDate)}</span>}
              </div>
            )}

            {/* Priority & Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none"
                >
                  <option value="urgent">🔴 Urgent</option>
                  <option value="high">🟠 High</option>
                  <option value="normal">🔵 Normal</option>
                  <option value="low">⚪ Low</option>
                </select>
              </div>

              {/* Status with Exact ClickUp Categories */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  ClickUp Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
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
            </div>

            {/* Target Due Date & Assignee */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none rounded-none"
                />
              </div>

              {/* Assignee Selection from ClickUp Space Members API */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-700">
                    Assignee (Space Members)
                  </label>
                  {loadingMembers && (
                    <span className="text-[9px] text-[#c9ab4c] font-bold flex items-center gap-1">
                      <RefreshCw size={9} className="animate-spin" /> Fetching...
                    </span>
                  )}
                </div>

                <SearchableMemberMultiSelect
                  members={availableMembers}
                  selectedMemberIds={selectedAssigneeIds}
                  onChange={setSelectedAssigneeIds}
                  placeholder="Choose ClickUp members"
                />
              </div>
            </div>

            {/* Description Details */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
                Context & Notes
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Key arguments, requirements, or deliverables discussed..."
                className="w-full border border-gray-300 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:border-[#c9ab4c] outline-none resize-none rounded-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-[10px] text-gray-400 italic">
                Direct push to ClickUp API
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-outline !py-1.5 !px-3.5 !text-xs rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary !py-1.5 !px-4 !text-xs flex items-center gap-1.5 shadow-xs rounded-none"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Pushing to ClickUp...</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare size={13} />
                      <span>Push to ClickUp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
