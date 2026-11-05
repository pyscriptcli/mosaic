"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FileText,
  Download,
  Cloud,
  Plus,
  Users,
  Calendar,
  MapPin,
  Building2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Check,
  ChevronRight,
  Lock,
  ExternalLink,
  Mail,
  Mic,
  Video
} from "lucide-react";
import { fetchSpaceLists } from "@/lib/api";

export const VENUE_OPTIONS = [
  "GreatWork Mega Tower 32F - Secret Room",
  "GreatWork Mega Tower 32F - Small Meeting Room",
  "GreatWork Mega Tower 24F - Meeting Room",
  "GreatWork Mega Tower 32F - Board Room",
  "GreatWork Mega Tower 32F - Co-working",
  "Online Meeting",
  "Other / Custom..."
];

interface FinalizeMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: any;
  onUpdateMetadata: (updated: any) => void;
  primeAttendees: string[];
  onUpdatePrimeAttendees: (attendees: string[]) => void;
  externalAttendees: string[];
  onUpdateExternalAttendees: (attendees: string[]) => void;
  onExportWord: () => Promise<void>;
  onExportPdf: () => Promise<void>;
  onEmailPdf?: () => void;
  onExportRecording?: () => void;
  recordingName?: string | null;
  onArchiveClickUp: (spaceId: string, options?: { listId?: string; isConfidential?: boolean; idempotencyKey?: string }) => Promise<any>;
  archiveSpaces: Array<{ id: string; name: string; teamName: string }>;
  loadingArchiveSpaces: boolean;
  selectedSpaceId: string;
  onSelectSpaceId: (spaceId: string) => void;
  isProcessing: boolean;
  processingText: string;
  initialAction?: "export" | "archive" | "all";
  canExport?: boolean;
}

export function FinalizeMeetingModal({
  isOpen,
  onClose,
  metadata,
  onUpdateMetadata,
  primeAttendees,
  onUpdatePrimeAttendees,
  externalAttendees,
  onUpdateExternalAttendees,
  onExportWord,
  onExportPdf,
  onEmailPdf,
  onExportRecording,
  recordingName,
  onArchiveClickUp,
  archiveSpaces,
  loadingArchiveSpaces,
  selectedSpaceId,
  onSelectSpaceId,
  isProcessing,
  processingText,
  initialAction = "all",
  canExport = true
}: FinalizeMeetingModalProps) {
  const [newPrimeName, setNewPrimeName] = useState("");
  const [newExternalName, setNewExternalName] = useState("");
  const [titleError, setTitleError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const activeTabDefault = initialAction === "export" ? "export" : "archive";
  const [activeTab, setActiveTab] = useState<"export" | "archive">(activeTabDefault);
  const [showExportChoices, setShowExportChoices] = useState(false);

  // Personal list & confidentiality state
  const [archiveDestination, setArchiveDestination] = useState<"team" | "personal">("team");
  const [personalListId, setPersonalListId] = useState<string>("");
  const [personalListName, setPersonalListName] = useState<string>("");
  const [personalListInput, setPersonalListInput] = useState<string>("");
  const [isConfiguringPersonalList, setIsConfiguringPersonalList] = useState<boolean>(false);
  const [isValidatingPersonalList, setIsValidatingPersonalList] = useState<boolean>(false);
  const [personalListError, setPersonalListError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{
    taskUrl?: string;
    taskTitle?: string;
    listName?: string;
    isConfidential?: boolean;
  } | null>(null);
  const saveRequestId = useRef<string | null>(null);

  // Dynamic lists per space state
  const [spaceLists, setSpaceLists] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTeamListId, setSelectedTeamListId] = useState<string>("");
  const [loadingSpaceLists, setLoadingSpaceLists] = useState<boolean>(false);

  // When selectedSpaceId changes, load lists in that space and select preferred list
  useEffect(() => {
    if (!selectedSpaceId) {
      setSpaceLists([]);
      setSelectedTeamListId("");
      return;
    }
    setLoadingSpaceLists(true);
    fetchSpaceLists(selectedSpaceId)
      .then((data) => {
        const lists: Array<{ id: string; name: string }> = data.lists || [];
        setSpaceLists(lists);
        const cachedListId = typeof window !== "undefined"
          ? localStorage.getItem(`project_echo_space_list_${selectedSpaceId}`) || ""
          : "";
        const matchCached = lists.find((l) => l.id === cachedListId);
        if (matchCached) {
          setSelectedTeamListId(matchCached.id);
        } else {
          const echoList = lists.find((l) => /echo meetings|echo meeting|meeting archive/i.test(l.name));
          setSelectedTeamListId(echoList ? echoList.id : (lists[0]?.id || ""));
        }
      })
      .catch((err) => {
        console.warn("Could not fetch space lists:", err);
        setSpaceLists([]);
        setSelectedTeamListId("");
      })
      .finally(() => setLoadingSpaceLists(false));
  }, [selectedSpaceId]);

  const handleSelectTeamList = (listId: string) => {
    setSelectedTeamListId(listId);
    if (typeof window !== "undefined" && selectedSpaceId) {
      localStorage.setItem(`project_echo_space_list_${selectedSpaceId}`, listId);
    }
  };

  // Load preferences from localStorage + Supabase on open
  useEffect(() => {
    if (isOpen) {
      setSaveSuccess(null);
      saveRequestId.current = null;
      setPersonalListError(null);
      const localId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || "" : "";
      const localName = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_name") || "" : "";
      if (localId) {
        setPersonalListId(localId);
        setPersonalListName(localName || "Personal List");
      }
      fetch("/api/user/preferences")
        .then((res) => res.json())
        .then((data) => {
          if (data.preferences?.personal_list_id) {
            setPersonalListId(data.preferences.personal_list_id);
            setPersonalListName(data.preferences.personal_list_name || "Personal List");
            if (typeof window !== "undefined") {
              localStorage.setItem("project_echo_personal_list_id", data.preferences.personal_list_id);
              if (data.preferences.personal_list_name) {
                localStorage.setItem("project_echo_personal_list_name", data.preferences.personal_list_name);
              }
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialAction === "export") {
      setActiveTab("export");
    } else {
      setActiveTab("archive");
    }
  }, [initialAction, isOpen]);

  useEffect(() => {
    if (activeTab !== "export") setShowExportChoices(false);
  }, [activeTab]);

  if (!isOpen) return null;

  const validateTitle = (): boolean => {
    if (!metadata.client_name || !metadata.client_name.trim()) {
      setTitleError(true);
      if (titleInputRef.current) {
        titleInputRef.current.focus();
        if (typeof titleInputRef.current.scrollIntoView === "function") {
          titleInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return false;
    }
    setTitleError(false);
    return true;
  };

  const handleSavePersonalList = async () => {
    if (!personalListInput.trim()) return;
    setIsValidatingPersonalList(true);
    setPersonalListError(null);
    try {
      const res = await fetch("/api/clickup/validate-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: personalListInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPersonalListError(data.error || "ClickUp list not found or inaccessible.");
        return;
      }
      setPersonalListId(data.list.id);
      setPersonalListName(data.list.name);
      if (typeof window !== "undefined") {
        localStorage.setItem("project_echo_personal_list_id", data.list.id);
        localStorage.setItem("project_echo_personal_list_name", data.list.name);
      }
      setIsConfiguringPersonalList(false);
      setPersonalListInput("");
      fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            personal_list_id: data.list.id,
            personal_list_name: data.list.name,
          },
        }),
      }).catch(() => {});
    } catch (err: any) {
      setPersonalListError(err.message || "Failed to validate list.");
    } finally {
      setIsValidatingPersonalList(false);
    }
  };

  const handleWordClick = async () => {
    if (!validateTitle()) return;
    await onExportWord();
  };

  const handlePdfClick = async () => {
    if (!validateTitle()) return;
    await onExportPdf();
  };

  const handleArchiveClick = async () => {
    if (!validateTitle()) return;
    if (!saveRequestId.current) saveRequestId.current = crypto.randomUUID();
    if (archiveDestination === "personal") {
      if (!personalListId) {
        setIsConfiguringPersonalList(true);
        setPersonalListError("Please configure your private ClickUp list first.");
        return;
      }
      const result: any = await onArchiveClickUp("", { listId: personalListId, isConfidential: true, idempotencyKey: saveRequestId.current });
      if (result?.status === "success") {
        setSaveSuccess({
          taskUrl: result.clickup.taskUrl,
          taskTitle: metadata.client_name,
          listName: personalListName,
          isConfidential: true,
        });
      }
    } else {
      if (!selectedSpaceId) return;
      const result: any = await onArchiveClickUp(selectedSpaceId, {
        listId: selectedTeamListId || undefined,
        isConfidential: false,
        idempotencyKey: saveRequestId.current,
      });
      if (result?.status === "success") {
        setSaveSuccess({
          taskUrl: result.clickup.taskUrl,
          taskTitle: metadata.client_name,
          listName: result.clickup.listName || "Mosaic Meetings",
          isConfidential: false,
        });
      }
    }
  };

  const handleAddPrime = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPrimeName.trim();
    if (trimmed && !primeAttendees.includes(trimmed)) {
      onUpdatePrimeAttendees([...primeAttendees, trimmed]);
      setNewPrimeName("");
    }
  };

  const handleRemovePrime = (name: string) => {
    onUpdatePrimeAttendees(primeAttendees.filter((a) => a !== name));
  };

  const handleAddExternal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newExternalName.trim();
    if (trimmed && !externalAttendees.includes(trimmed)) {
      onUpdateExternalAttendees([...externalAttendees, trimmed]);
      setNewExternalName("");
    }
  };

  const handleRemoveExternal = (name: string) => {
    onUpdateExternalAttendees(externalAttendees.filter((a) => a !== name));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finalize-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#FFFCFB] border border-[#003366]/20 shadow-2xl rounded-none text-[#181D1E] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 bg-[#FFFCFB] px-6 py-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[#C9A84C]" />
              <h2 id="finalize-modal-title" className="text-xl font-serif font-bold italic text-[#003366]">
                Finalize Meeting Minutes
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Verify meeting details to ensure accurate document headers and ClickUp records.
            </p>
          </div>
          {canExport && (
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              aria-label="Close modal"
              className="p-1 text-slate-400 hover:text-[#003366] transition-colors rounded-none disabled:opacity-40"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Section: Meeting Details Verification */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-[#003366]/10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#003366]">
                Meeting Details Verification
              </span>
              <span className="text-[10px] text-slate-400">Required for export & ClickUp</span>
            </div>

            {/* Title / Client Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Meeting Name <span className="text-red-600">*</span>
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={metadata.client_name || ""}
                onChange={(e) => {
                  onUpdateMetadata({ ...metadata, client_name: e.target.value });
                  if (e.target.value.trim()) setTitleError(false);
                }}
                placeholder="e.g. Q3 Commercial Real Estate Strategy - Megaworld (Required)"
                className={`w-full text-xs px-3 py-2 bg-white border ${
                  titleError ? "border-red-500 ring-1 ring-red-400" : "border-slate-300 focus:border-[#C9A84C]"
                } rounded-none outline-none text-[#181D1E] shadow-2xs transition-colors`}
              />
              {titleError && (
                <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1 font-medium">
                  <AlertCircle size={12} /> Please enter a meeting title or client name before continuing.
                </p>
              )}
            </div>

            {/* Date, Type, Location 3-Column Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Meeting Date */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Meeting Date
                </label>
                <input
                  type="date"
                  value={metadata.date || ""}
                  onChange={(e) => onUpdateMetadata({ ...metadata, date: e.target.value })}
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#C9A84C] rounded-none outline-none shadow-2xs"
                />
              </div>

              {/* Meeting Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Meeting Type
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(["Internal", "External", "Team"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onUpdateMetadata({ ...metadata, meeting_type: type })}
                      className={`text-[11px] font-semibold py-1.5 border transition-colors ${
                        metadata.meeting_type === type
                          ? "bg-[#003366] text-white border-[#003366]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-[#003366]"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Venue / Location */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Location / Venue
                </label>
                <select
                  value={metadata.location || VENUE_OPTIONS[0]}
                  onChange={(e) => onUpdateMetadata({ ...metadata, location: e.target.value })}
                  className="w-full text-xs px-2 py-1.5 bg-white border border-slate-300 focus:border-[#C9A84C] rounded-none outline-none shadow-2xs truncate"
                >
                  {VENUE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Venue (if selected) */}
            {metadata.location === "Other / Custom..." && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Custom Location Details
                </label>
                <input
                  type="text"
                  value={metadata.custom_location || ""}
                  onChange={(e) => onUpdateMetadata({ ...metadata, custom_location: e.target.value })}
                  placeholder="Specify meeting venue or room"
                  className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 focus:border-[#C9A84C] rounded-none outline-none shadow-2xs"
                />
              </div>
            )}

            {/* Attendees Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* PRIME Attendees */}
              <div className="border border-slate-200 bg-white p-3 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#003366] flex items-center gap-1.5">
                    <Users size={13} className="text-[#C9A84C]" /> PRIME Attendees ({primeAttendees.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] max-h-24 overflow-y-auto p-1 bg-slate-50 border border-slate-100">
                  {primeAttendees.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">No attendees added</span>
                  ) : (
                    primeAttendees.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 px-2 py-0.5 text-slate-700 shadow-2xs"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => handleRemovePrime(name)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <form onSubmit={handleAddPrime} className="flex gap-1">
                  <input
                    type="text"
                    value={newPrimeName}
                    onChange={(e) => setNewPrimeName(e.target.value)}
                    placeholder="Add PRIME member..."
                    className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 focus:border-[#C9A84C] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newPrimeName.trim()}
                    className="px-2.5 py-1 text-xs font-semibold bg-[#003366] text-white disabled:opacity-30 hover:bg-[#002244]"
                  >
                    <Plus size={13} />
                  </button>
                </form>
              </div>

              {/* External Attendees */}
              <div className="border border-slate-200 bg-white p-3 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#003366] flex items-center gap-1.5">
                    <Building2 size={13} className="text-[#C9A84C]" /> External Attendees ({externalAttendees.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] max-h-24 overflow-y-auto p-1 bg-slate-50 border border-slate-100">
                  {externalAttendees.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">No external attendees</span>
                  ) : (
                    externalAttendees.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-200 px-2 py-0.5 text-slate-700 shadow-2xs"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => handleRemoveExternal(name)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <form onSubmit={handleAddExternal} className="flex gap-1">
                  <input
                    type="text"
                    value={newExternalName}
                    onChange={(e) => setNewExternalName(e.target.value)}
                    placeholder="Add client or guest..."
                    className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 focus:border-[#C9A84C] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newExternalName.trim()}
                    className="px-2.5 py-1 text-xs font-semibold bg-[#003366] text-white disabled:opacity-30 hover:bg-[#002244]"
                  >
                    <Plus size={13} />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Section: Destination & Action Hub */}
          <div className="pt-2 border-t border-slate-200">
            {/* Tabs for Action Focus: Save to ClickUp on the left, Download Document on the right */}
            <div className="flex border-b border-slate-200 mb-4" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "archive"}
                onClick={() => setActiveTab("archive")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "archive"
                    ? "border-[#C9A84C] text-[#003366] bg-white"
                    : "border-transparent text-slate-400 hover:text-[#003366]"
                }`}
              >
                <Cloud size={14} /> Save to ClickUp
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "export"}
                onClick={() => setActiveTab("export")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "export"
                    ? "border-[#C9A84C] text-[#003366] bg-white"
                    : "border-transparent text-slate-400 hover:text-[#003366]"
                }`}
              >
                <Download size={14} /> Download Document (.docx / .pdf)
              </button>
            </div>

            {/* Tab 1: ClickUp Saving */}
            {activeTab === "archive" && (
              <div className="space-y-3 bg-white border border-slate-200 p-4 shadow-2xs animate-in fade-in duration-100">
                {/* Success Banner if meeting was saved */}
                {saveSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 flex items-center justify-between gap-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold">
                          {saveSuccess.isConfidential ? "Meeting saved successfully to your private archive." : "Meeting saved successfully."}
                        </span>
                        <span className="block text-[11px] text-emerald-800">It is queued to sync with ClickUp.</span>
                        {saveSuccess.taskUrl && (
                          <a
                            href={saveSuccess.taskUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#003366] hover:underline font-semibold ml-2"
                          >
                            <span>Open Task in ClickUp</span>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2-way Destination Switcher: Shared Team Space vs Personal Confidential */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setArchiveDestination("team")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold transition-all ${
                      archiveDestination === "team"
                        ? "bg-white text-[#003366] shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-[#003366]"
                    }`}
                  >
                    <Users size={13} className={archiveDestination === "team" ? "text-[#C9A84C]" : ""} />
                    <span>Shared / Team Space</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveDestination("personal")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold transition-all ${
                      archiveDestination === "personal"
                        ? "bg-[#003366] text-white shadow-xs"
                        : "text-slate-500 hover:text-[#003366]"
                    }`}
                  >
                    <Lock size={13} className={archiveDestination === "personal" ? "text-[#C9A84C]" : ""} />
                    <span>Personal / Private</span>
                  </button>
                </div>

                {/* Shared Team Space Mode */}
                {archiveDestination === "team" && (
                  <div className="space-y-3 pt-1 animate-in fade-in duration-100">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-[#003366]">Select Target ClickUp Space</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Mosaic will save the meeting into the selected department’s <b>Mosaic Meetings</b> list.
                        </p>
                      </div>
                      {loadingArchiveSpaces && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#003366] font-semibold">
                          <Loader2 size={12} className="animate-spin text-[#C9A84C]" /> Scanning Spaces…
                        </span>
                      )}
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 divide-y divide-slate-100">
                      {loadingArchiveSpaces ? (
                        <div className="p-4 text-center text-xs text-slate-400">Loading your ClickUp spaces...</div>
                      ) : archiveSpaces.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">No accessible ClickUp spaces found.</div>
                      ) : (
                        archiveSpaces.map((space) => {
                          const isSelected = selectedSpaceId === space.id;
                          return (
                            <button
                              key={space.id}
                              type="button"
                              onClick={() => onSelectSpaceId(space.id)}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors ${
                                isSelected
                                  ? "bg-[#003366] text-white"
                                  : "hover:bg-slate-50 text-slate-800"
                              }`}
                            >
                              <div>
                                <span className="font-semibold">{space.name}</span>
                                <span className={`block text-[10px] ${isSelected ? "text-slate-200" : "text-slate-400"}`}>
                                  {space.teamName}
                                </span>
                              </div>
                              {isSelected && <Check size={14} className="text-[#C9A84C]" />}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {selectedSpaceId && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#003366] uppercase tracking-wider">
                            Select Destination List
                          </label>
                          {loadingSpaceLists && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                              <Loader2 size={11} className="animate-spin text-[#C9A84C]" /> Loading lists…
                            </span>
                          )}
                        </div>
                        {spaceLists.length > 0 ? (
                          <div className="relative">
                            <select
                              value={selectedTeamListId}
                              onChange={(e) => handleSelectTeamList(e.target.value)}
                              className="w-full bg-[#FFFCFB] border border-slate-300 text-xs px-3 py-2 text-slate-800 rounded-none focus:outline-none focus:border-[#C9AB4C]"
                            >
                              {spaceLists.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                              {!spaceLists.some((l) => /echo meetings|echo meeting/i.test(l.name)) && (
                                <option value="">+ Create new "Mosaic Meetings" list in this space</option>
                              )}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Your selected list is saved as default for this space. You can change it anytime.
                            </p>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 py-1">
                            {loadingSpaceLists ? "Retrieving lists..." : 'Defaulting to "Mosaic Meetings" in this space.'}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleArchiveClick}
                        disabled={!selectedSpaceId || isProcessing}
                        className="btn-primary !py-2 !px-5 text-xs flex items-center gap-2 rounded-none disabled:opacity-40"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-[#C9A84C]" />
                            <span>{processingText || "Saving to ClickUp..."}</span>
                          </>
                        ) : (
                          <>
                            <Cloud size={14} />
                            <span>Save to ClickUp</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Personal / Confidential Mode */}
                {archiveDestination === "personal" && (
                  <div className="space-y-3 pt-1 animate-in fade-in duration-100">
                    <div>
                      <h4 className="text-xs font-bold text-[#003366] flex items-center gap-1.5">
                        <Lock size={13} className="text-[#C9A84C]" />
                        <span>Personal / Private List</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Only you and direct members with permissions to your private list will be able to access this meeting in ClickUp.
                      </p>
                    </div>

                    {/* Configured Personal List Card */}
                    {personalListId && !isConfiguringPersonalList ? (
                      <div className="p-3.5 bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 text-amber-800">
                            <Lock size={15} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {personalListName || "My Personal List"}
                              </span>
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300">
                                Private
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              List ID: {personalListId}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPersonalListInput(personalListId);
                            setIsConfiguringPersonalList(true);
                          }}
                          className="text-xs font-semibold text-[#003366] hover:underline shrink-0 ml-2"
                        >
                          Change List
                        </button>
                      </div>
                    ) : (
                      /* Configuration / Input Box */
                      <div className="space-y-2 p-3 bg-slate-50 border border-slate-200">
                        <label className="block text-xs font-semibold text-slate-700">
                          Configure Your Private ClickUp List
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={personalListInput}
                            onChange={(e) => {
                              setPersonalListInput(e.target.value);
                              setPersonalListError(null);
                            }}
                            placeholder="Paste ClickUp list URL or enter List ID..."
                            className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#003366] outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSavePersonalList}
                            disabled={!personalListInput.trim() || isValidatingPersonalList}
                            className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1 disabled:opacity-40"
                          >
                            {isValidatingPersonalList ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Verifying...</span>
                              </>
                            ) : (
                              <span>Save List</span>
                            )}
                          </button>
                          {personalListId && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsConfiguringPersonalList(false);
                                setPersonalListError(null);
                              }}
                              className="px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {personalListError && (
                          <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                            <AlertCircle size={12} /> {personalListError}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500">
                          Tip: Open your private list in ClickUp, copy the browser URL (e.g. <code>https://app.clickup.com/123/v/li/456</code>), and paste it here.
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleArchiveClick}
                        disabled={!personalListId || isProcessing || isConfiguringPersonalList}
                        className="btn-primary !py-2 !px-5 text-xs flex items-center gap-2 rounded-none disabled:opacity-40"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-[#C9A84C]" />
                            <span>{processingText || "Saving to Private List..."}</span>
                          </>
                        ) : (
                          <>
                            <Lock size={13} className="text-[#C9A84C]" />
                            <span>Save to Private List</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Export Files */}
            {activeTab === "export" && (
              <div className="space-y-3 animate-in fade-in duration-100">
                <button type="button" onClick={() => setShowExportChoices((open) => !open)} disabled={isProcessing} aria-expanded={showExportChoices} className="flex w-full items-center gap-3 border border-slate-200 bg-white p-3.5 text-left hover:border-[#C9AB4C] hover:bg-slate-50/50 transition-all shadow-2xs group disabled:opacity-50">
                  <div className="w-9 h-9 bg-[#003366]/5 border border-[#003366]/15 flex items-center justify-center shrink-0 text-[#003366]"><Download size={18} /></div>
                  <div className="flex-1 min-w-0"><span className="block text-xs font-bold text-[#003366]">Share meeting minutes</span><span className="block text-[11px] text-slate-500 mt-0.5">Export Word, PDF, or open Outlook</span></div>
                  <ChevronRight size={16} className={`text-slate-400 transition-transform ${showExportChoices ? "rotate-90 text-[#003366]" : ""}`} />
                </button>
                {showExportChoices && <div className="grid grid-cols-1 gap-2 border-l-2 border-[#C9AB4C] pl-3 sm:grid-cols-3">
                {/* Word Export Card */}
                <button
                  type="button"
                  onClick={handleWordClick}
                  disabled={isProcessing}
                  className="flex items-center gap-3.5 border border-slate-200 bg-white p-4 text-left hover:border-[#C9A84C] hover:bg-slate-50/50 transition-all shadow-2xs group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-[#003366]/5 border border-[#003366]/15 flex items-center justify-center shrink-0 group-hover:bg-[#003366] group-hover:text-[#C9A84C] transition-colors text-[#003366]">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#003366]">Word Document</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Formatted .docx with official PRIME headers
                    </span>
                  </div>
                  <Download size={15} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                </button>

                {/* PDF Export Card */}
                <button
                  type="button"
                  onClick={handlePdfClick}
                  disabled={isProcessing}
                  className="flex items-center gap-3.5 border border-slate-200 bg-white p-4 text-left hover:border-[#C9A84C] hover:bg-slate-50/50 transition-all shadow-2xs group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-[#003366]/5 border border-[#003366]/15 flex items-center justify-center shrink-0 group-hover:bg-[#003366] group-hover:text-[#C9A84C] transition-colors text-[#003366]">
                    <Download size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#003366]">PDF Document</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Executive board-ready PDF file (.pdf)
                    </span>
                  </div>
                  <Download size={15} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                </button>

                {onEmailPdf && <button
                  type="button"
                  onClick={onEmailPdf}
                  disabled={isProcessing}
                  className="flex items-center gap-3.5 border border-slate-200 bg-white p-4 text-left hover:border-[#C9AB4C] hover:bg-slate-50/50 transition-all shadow-2xs group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-[#003366]/5 border border-[#003366]/15 flex items-center justify-center shrink-0 group-hover:bg-[#003366] group-hover:text-[#C9AB4C] transition-colors text-[#003366]">
                    <Mail size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#003366]">Email via Outlook</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">Open a ready-to-review draft</span>
                  </div>
                  <ExternalLink size={15} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                </button>}

                {onExportRecording && <button
                  type="button"
                  onClick={onExportRecording}
                  disabled={isProcessing}
                  className="flex items-center gap-3.5 border border-slate-200 bg-white p-4 text-left hover:border-[#C9AB4C] hover:bg-slate-50/50 transition-all shadow-2xs group disabled:opacity-50"
                >
                  <div className="w-10 h-10 bg-[#003366]/5 border border-[#003366]/15 flex items-center justify-center shrink-0 group-hover:bg-[#003366] group-hover:text-[#C9AB4C] transition-colors text-[#003366]">
                    {recordingName && (recordingName.endsWith(".mp4") || recordingName.endsWith(".webm")) ? (
                      <Video size={20} />
                    ) : (
                      <Mic size={20} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#003366]">
                      {recordingName && (recordingName.endsWith(".mp4") || recordingName.endsWith(".webm"))
                        ? "Export Video"
                        : "Export Audio"}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Download full meeting media recording
                    </span>
                  </div>
                  <Download size={15} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                </button>}

                </div>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 shrink-0">
          <span className="text-[10px] text-slate-400">
            Mosaic • Minutes of the Meeting
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
