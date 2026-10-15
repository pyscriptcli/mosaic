"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Plus, 
  Calendar, 
  FileText, 
  Download, 
  Sparkles, 
  Send, 
  Loader2, 
  Save, 
  ChevronUp, 
  ChevronDown, 
  X, 
  Users, 
  Building2, 
  Clock, 
  Trash2,
  CheckCircle,
  FileSpreadsheet,
  AlertCircle,
  CheckSquare,
  Info,
  ExternalLink,
  Lock,
  FolderInput,
  PhilippinePeso,
  Mic,
  Video,
  MessageCircle,
  Copy,
  Check,
  AlertTriangle,
  Archive
} from "lucide-react";
import { ArchivedMeeting, DiscussionItem } from "@/types/meeting";
import type { StudioSession } from "@/types/studio";
import { getInterruptedSessions, downloadSession, clearSession, exportSessionAsFile } from "@/lib/studioStorage";
import { exportWord, exportPdf, askEcho, discoverClickUpLists, getStoredApiKey } from "@/lib/api";
import { QuickAddTaskModal } from "./QuickAddTaskModal";
import { EmailMeetingModal } from "./EmailMeetingModal";
import { MoveMeetingModal } from "./MoveMeetingModal";
import { DiscoverTopicsModal } from "./DiscoverTopicsModal";
import type { DiscoveredTopicItem } from "@/app/api/discover-topics/route";
import { formatEchoDate } from "@/lib/dateUtils";

const VENUE_OPTIONS = [
  "GreatWork Mega Tower 32F - Secret Room",
  "GreatWork Mega Tower 32F - Small Meeting Room",
  "GreatWork Mega Tower 24F - Meeting Room",
  "GreatWork Mega Tower 32F - Board Room",
  "GreatWork Mega Tower 32F - Co-working",
  "Online Meeting",
  "Other / Custom..."
];

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  rows = 1,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
}

function DatePickerInput({
  value,
  onChange,
  placeholder = "YYYY-MM-DD or TBD",
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (dateInputRef.current) {
      try {
        if (typeof dateInputRef.current.showPicker === "function") {
          dateInputRef.current.showPicker();
        } else {
          dateInputRef.current.focus();
        }
      } catch {
        dateInputRef.current.focus();
      }
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-xs bg-[#FFFCFB] border border-gray-200 rounded-none px-2 py-1 pr-7 focus:outline-none focus:border-[#C9AB4C]"
      />
      <input
        type="date"
        ref={dateInputRef}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        tabIndex={-1}
        className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
      />
      <button
        type="button"
        onClick={handleIconClick}
        title="Choose date from calendar"
        className="absolute right-1 text-gray-400 hover:text-[#003366] p-1 cursor-pointer"
      >
        <Calendar size={13} />
      </button>
    </div>
  );
}

const TOTAL_AI_PHP_PER_HOUR = 2.53;

function getMeetingDurationMinutes(m: ArchivedMeeting): number {
  if (typeof m.duration_minutes === "number" && m.duration_minutes > 0) return m.duration_minutes;
  if (typeof m.duration_seconds === "number" && m.duration_seconds > 0) return Math.max(1, Math.round(m.duration_seconds / 60));
  const sm = m.start_time;
  const em = m.end_time;
  if (sm && em) {
    const [sh, smin] = sm.split(":").map(Number);
    const [eh, emin] = em.split(":").map(Number);
    if (!isNaN(sh) && !isNaN(smin) && !isNaN(eh) && !isNaN(emin)) {
      const diff = (eh * 60 + emin) - (sh * 60 + smin);
      if (diff > 0) return diff;
    }
  }
  if (m.transcript && m.transcript.trim().length > 0) {
    const words = m.transcript.trim().split(/\s+/).length;
    return Math.max(5, Math.round(words / 130));
  }
  return 30;
}

function formatDisplayTime(timeStr?: string): string {
  if (!timeStr || timeStr.trim() === "" || timeStr === "—") return "—";
  const trimmed = timeStr.trim();
  if (/am|pm/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = match[2];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${mins} ${ampm}`;
  }
  return trimmed;
}

interface MeetingsViewProps {
  meetings: ArchivedMeeting[];
  selectedMeetingId: string | null;
  onSelectMeeting: (id: string) => void;
  onUpdateMeeting: (meeting: ArchivedMeeting, previousMeeting?: ArchivedMeeting) => Promise<void>;
  onDeleteMeeting?: (meetingId: string) => Promise<void>;
  onMoveMeeting?: (updatedMeeting: ArchivedMeeting) => Promise<void> | void;
  onProcessInterrupted?: (file: File, notes?: string) => void;
  onNavigateToTasks?: (taskId: string) => void;
  onSelectMeetingSpace?: (spaceId: string) => void;
  userEmail?: string;
  canExport?: boolean;
}

export function MeetingsView({
  meetings,
  selectedMeetingId,
  onSelectMeeting,
  onUpdateMeeting,
  onDeleteMeeting,
  onMoveMeeting,
  onProcessInterrupted,
  onNavigateToTasks,
  onSelectMeetingSpace,
  userEmail,
  canExport = true
}: MeetingsViewProps) {
  // Search & Filter state
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Internal" | "External" | "Archives">("All");
  const [meetingSpaces, setMeetingSpaces] = useState<Array<{ id: string; name: string; teamName: string }>>([]);
  const [selectedMeetingSpace, setSelectedMeetingSpace] = useState("__all__");
  const [personalListId, setPersonalListId] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [interruptedSessions, setInterruptedSessions] = useState<StudioSession[]>([]);
  const [selectedInterruptedId, setSelectedInterruptedId] = useState<string | null>(null);
  const [isProcessingInterrupted, setIsProcessingInterrupted] = useState<string | null>(null);

  useEffect(() => {
    const storedPId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || "" : "";
    if (storedPId) {
      setPersonalListId(storedPId);
    }
    discoverClickUpLists().then((data) => {
      setMeetingSpaces(data.spaces || []);
      onSelectMeetingSpace?.("__all__");
    }).catch(() => setMeetingSpaces([]));
  }, []);

  // Selected meeting working draft (for in-place editing)
  const currentMeeting = meetings.find((m) => m.id === selectedMeetingId) || meetings[0];
  const [activeMeeting, setActiveMeeting] = useState<ArchivedMeeting | null>(currentMeeting || null);

  // Sync draft when selectedMeetingId changes
  useEffect(() => {
    if (currentMeeting) {
      setActiveMeeting(JSON.parse(JSON.stringify(currentMeeting)));
    }
  }, [selectedMeetingId, meetings]);

  // Venue custom helper
  const [isCustomVenue, setIsCustomVenue] = useState(false);

  useEffect(() => {
    if (activeMeeting) {
      const isKnown = VENUE_OPTIONS.slice(0, -1).includes(activeMeeting.location);
      setIsCustomVenue(!isKnown && !!activeMeeting.location);
    }
  }, [activeMeeting?.id]);

  // Attendee input tags
  const [primeInput, setPrimeInput] = useState("");
  const [externalInput, setExternalInput] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [showArchiveDetails, setShowArchiveDetails] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [detailTab, setDetailTab] = useState<"discussion" | "notes" | "transcript">("discussion");
  const [showDiscoverTopicsModal, setShowDiscoverTopicsModal] = useState(false);
  const [missedTopics, setMissedTopics] = useState<DiscoveredTopicItem[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [isDiscoveringTopics, setIsDiscoveringTopics] = useState(false);
  const [autoDiscoverEnabled, setAutoDiscoverEnabled] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [localRecordingFiles, setLocalRecordingFiles] = useState<Array<{ name: string; size: number; path: string }>>([]);

  // Fetch local recordings from Mosaic Meetings folder
  const refreshLocalRecordings = React.useCallback(() => {
    fetch("/api/recordings/save-local")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setLocalRecordingFiles(data.files);
        }
      })
      .catch(() => {});
  }, []);

  const refreshInterruptedSessions = React.useCallback(() => {
    getInterruptedSessions()
      .then((records) => {
        setInterruptedSessions(records);
        if (records.length > 0 && !selectedInterruptedId) {
          setSelectedInterruptedId(records[0].sessionId);
        }
      })
      .catch(() => {});
    refreshLocalRecordings();
  }, [selectedInterruptedId, refreshLocalRecordings]);

  useEffect(() => {
    refreshLocalRecordings();
    refreshInterruptedSessions();
  }, [refreshLocalRecordings, refreshInterruptedSessions]);

  // When switching to Archives pill, ensure interrupted records are refreshed
  useEffect(() => {
    if (typeFilter === "Archives") {
      refreshInterruptedSessions();
    }
  }, [typeFilter, refreshInterruptedSessions]);

  // Determine matched local audio or video recording for the active meeting
  const matchedRecording = React.useMemo(() => {
    if (!activeMeeting || localRecordingFiles.length === 0) return null;
    const meetingDate = activeMeeting.date?.trim();
    const titleTokens = (activeMeeting.title || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((tok) => tok.length >= 3 && !["meeting", "echo", "prime", "the", "and", "internal"].includes(tok));

    // 1. Exact or date match + token match
    let match = localRecordingFiles.find((f) => {
      const lower = f.name.toLowerCase();
      if (meetingDate && lower.includes(meetingDate)) {
        if (titleTokens.length > 0 && titleTokens.some((t) => lower.includes(t))) return true;
        return true;
      }
      return false;
    });

    // 2. Token match on title
    if (!match && titleTokens.length > 0) {
      match = localRecordingFiles.find((f) => {
        const lower = f.name.toLowerCase();
        return titleTokens.some((t) => lower.includes(t));
      });
    }

    // 3. Normalized string match
    if (!match) {
      const titleClean = activeMeeting.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      match = localRecordingFiles.find((f) => {
        const fileClean = f.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (titleClean && titleClean.length > 4 && fileClean.includes(titleClean.slice(0, 10))) return true;
        return false;
      });
    }

    return match || null;
  }, [activeMeeting, localRecordingFiles]);

  const recordingType = React.useMemo<"video" | "audio">(() => {
    if (activeMeeting?.recording_type === "video") return "video";
    if (activeMeeting?.recording_type === "audio") return "audio";
    if (matchedRecording) {
      const lower = matchedRecording.name.toLowerCase();
      if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv") || lower.includes("video") || lower.includes("screen")) {
        return "video";
      }
      return "audio";
    }
    const combined = `${activeMeeting?.title || ""} ${activeMeeting?.location || ""} ${activeMeeting?.summary || ""}`.toLowerCase();
    if (combined.includes("screen recording") || combined.includes("video") || combined.includes("zoom") || combined.includes("meet")) {
      return "video";
    }
    return "audio";
  }, [activeMeeting, matchedRecording]);

  const recordingFormat = React.useMemo<string>(() => {
    if (matchedRecording) {
      const parts = matchedRecording.name.split(".");
      if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
    }
    if (activeMeeting?.recording_format) return activeMeeting.recording_format;
    return recordingType === "video" ? "webm" : "mp3";
  }, [matchedRecording, activeMeeting, recordingType]);

  const handleExportRecording = () => {
    if (matchedRecording) {
      const downloadUrl = `/api/recordings/download?fileName=${encodeURIComponent(matchedRecording.name)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = matchedRecording.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    if (localRecordingFiles.length > 0) {
      const fallback = localRecordingFiles.find((f) => {
        const lower = f.name.toLowerCase();
        return recordingType === "video"
          ? (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.includes("video"))
          : (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".m4a") || lower.endsWith(".webm"));
      });
      if (fallback) {
        const downloadUrl = `/api/recordings/download?fileName=${encodeURIComponent(fallback.name)}`;
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = fallback.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
    }

    alert(`No local ${recordingType === "video" ? "video" : "audio"} recording found in Documents/Mosaic Meetings for this meeting.`);
  };

  const handleDownloadMatchedRecording = () => {
    handleExportRecording();
  };

  // Handlers for Interrupted Meetings / Archives
  const handleProcessInterruptedSession = async (session: StudioSession) => {
    setIsProcessingInterrupted(session.sessionId);
    try {
      const file = await exportSessionAsFile(session.sessionId);
      const notesFormatted = session.notes && session.notes.length > 0
        ? session.notes.map((n) => `[${n.timestamp}] ${n.text}`).join("\n")
        : "";
      await clearSession(session.sessionId);
      refreshInterruptedSessions();
      if (onProcessInterrupted) {
        onProcessInterrupted(file, notesFormatted);
      }
    } catch (err) {
      console.error("[MeetingsView] Processing interrupted session failed:", err);
      alert("Failed to assemble and process interrupted recording.");
    } finally {
      setIsProcessingInterrupted(null);
    }
  };

  const handleDownloadInterruptedSession = async (sessionId: string) => {
    try {
      await downloadSession(sessionId);
    } catch (err) {
      console.error("[MeetingsView] Download interrupted session failed:", err);
      alert("Failed to download interrupted session.");
    }
  };

  const handleDiscardInterruptedSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to discard this interrupted meeting recording? This action cannot be undone.")) {
      return;
    }
    try {
      await clearSession(sessionId);
      refreshInterruptedSessions();
      if (selectedInterruptedId === sessionId) {
        setSelectedInterruptedId(null);
      }
    } catch (err) {
      console.error("[MeetingsView] Discard interrupted session failed:", err);
      alert("Failed to discard session.");
    }
  };

  const handleProcessLocalInterruptedFile = async (fileName: string) => {
    setIsProcessingInterrupted(fileName);
    try {
      const res = await fetch(`/api/recordings/download?fileName=${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error("Failed to fetch recording file");
      const blob = await res.blob();
      const ext = fileName.endsWith(".mp4") ? "mp4" : "webm";
      const file = new File([blob], fileName, { type: blob.type || (ext === "mp4" ? "video/mp4" : "video/webm") });
      if (onProcessInterrupted) {
        onProcessInterrupted(file);
      }
    } catch (err) {
      console.error("[MeetingsView] Failed to process local interrupted file:", err);
      alert("Failed to load local recording file for processing.");
    } finally {
      setIsProcessingInterrupted(null);
    }
  };

  const handleDownloadLocalInterruptedFile = (fileName: string) => {
    const downloadUrl = `/api/recordings/download?fileName=${encodeURIComponent(fileName)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDiscardLocalInterruptedFile = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}" from Documents/Mosaic Meetings?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/recordings/save-local?fileName=${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete request failed");
      refreshLocalRecordings();
      if (selectedInterruptedId === fileName) {
        setSelectedInterruptedId(null);
      }
    } catch (err) {
      console.error("[MeetingsView] Failed to delete file:", err);
      alert("Failed to delete local interrupted file.");
    }
  };

  // Quick Add ClickUp Task state
  const [quickAddTaskData, setQuickAddTaskData] = useState<{
    isOpen: boolean;
    data: {
      name?: string;
      description?: string;
      meetingTitle?: string;
      meetingDate?: string;
      dueDate?: string;
      priority?: string;
      assigneeName?: string;
      topic?: string;
      evidence?: string;
      discussionPointId?: string;
      existingTaskId?: string;
      existingTaskUrl?: string;
    };
    topicIndex?: number;
  }>({
    isOpen: false,
    data: {},
  });

  // Filter master list
  const filteredList = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.location.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.summary.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesType = typeFilter === "All" || m.meeting_type === typeFilter;
    const matchesFrom = !fromDate || m.date >= fromDate;
    const matchesTo = !toDate || m.date <= toDate;
    const matchesSpace =
      selectedMeetingSpace === "__all__" || !selectedMeetingSpace
        ? true
        : selectedMeetingSpace === "__personal__"
        ? m.is_confidential === true || m.clickup_space_id === "__personal__" || (Boolean(personalListId) && m.clickup_list_id === personalListId)
        : m.clickup_space_id === selectedMeetingSpace && !m.is_confidential;
    return matchesSearch && matchesType && matchesFrom && matchesTo && matchesSpace;
  });

  // Interrupted records combining IndexedDB sessions and local interrupted files
  const interruptedItems = React.useMemo(() => {
    type UnifiedInterrupted = {
      id: string;
      kind: "indexeddb" | "local_file";
      title: string;
      date: string;
      durationSeconds: number;
      mediaType: "video" | "audio";
      fileSize?: number;
      session?: StudioSession;
      fileName?: string;
      noteCount: number;
    };

    const list: UnifiedInterrupted[] = [];
    const lowerSearch = searchFilter.toLowerCase();

    // 1. IndexedDB Interrupted Sessions
    for (const s of interruptedSessions) {
      const isVideo = s.mediaType === "video";
      const title = `Interrupted Session (${s.sessionId.slice(-6)})`;
      if (lowerSearch && !title.toLowerCase().includes(lowerSearch) && !s.sessionId.toLowerCase().includes(lowerSearch)) {
        continue;
      }
      list.push({
        id: s.sessionId,
        kind: "indexeddb",
        title,
        date: s.startedAt ? s.startedAt.split("T")[0] : "",
        durationSeconds: s.elapsedSeconds || 0,
        mediaType: isVideo ? "video" : "audio",
        session: s,
        noteCount: s.notes ? s.notes.length : 0,
      });
    }

    // 2. Local interrupted / checkpoint files in Documents/Mosaic Meetings
    const knownSessionIds = new Set(interruptedSessions.map((s) => s.sessionId));
    for (const f of localRecordingFiles) {
      const isInterruptedFile = f.name.startsWith("INTERRUPTED_") || f.name.startsWith("CHECKPOINT_");
      if (!isInterruptedFile) continue;

      // Avoid duplicate card if already represented in IndexedDB session
      const matchingIndexedDb = interruptedSessions.find((s) => f.name.includes(s.sessionId));
      if (matchingIndexedDb) continue;

      if (lowerSearch && !f.name.toLowerCase().includes(lowerSearch)) {
        continue;
      }

      const isVideo = f.name.endsWith(".mp4") || f.name.includes("video");
      const title = f.name.startsWith("INTERRUPTED_") ? `Interrupted: ${f.name}` : `Checkpoint: ${f.name}`;

      list.push({
        id: f.name,
        kind: "local_file",
        title,
        date: (f as any).modifiedAt ? String((f as any).modifiedAt).split("T")[0] : "",
        durationSeconds: 0,
        mediaType: isVideo ? "video" : "audio",
        fileSize: f.size,
        fileName: f.name,
        noteCount: 0,
      });
    }

    return list;
  }, [interruptedSessions, localRecordingFiles, searchFilter]);

  const activeInterruptedItem = React.useMemo(() => {
    if (!selectedInterruptedId && interruptedItems.length > 0) {
      return interruptedItems[0];
    }
    return interruptedItems.find((it) => it.id === selectedInterruptedId) || null;
  }, [selectedInterruptedId, interruptedItems]);

  // Handle Discussion Items Reorder / Remove / Add
  const handleMoveItem = (index: number, direction: "up" | "down") => {
    if (!activeMeeting) return;
    const newItems = [...activeMeeting.items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setActiveMeeting({ ...activeMeeting, items: newItems });
  };

  const handleRemoveItem = (index: number) => {
    if (!activeMeeting) return;
    const newItems = activeMeeting.items.filter((_, i) => i !== index);
    setActiveMeeting({ ...activeMeeting, items: newItems });
  };

  const handleUpdateItem = (index: number, field: keyof DiscussionItem, value: string) => {
    if (!activeMeeting) return;
    const newItems = [...activeMeeting.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setActiveMeeting({ ...activeMeeting, items: newItems });
  };

  const handleAddNewItem = () => {
    if (!activeMeeting) return;
    const newItem: DiscussionItem = {
      id: `item-${Date.now()}`,
      topic: "New Discussion Topic",
      evidence: "[00:00] Recorded discussion notes",
      discussion_point: "",
      action_plan: "",
      target_date: "TBD",
      person_in_charge: "Dave Policarpio"
    };
    setActiveMeeting({ ...activeMeeting, items: [...activeMeeting.items, newItem] });
  };

  // Add Attendee Handlers
  const handleAddPrimeAttendee = () => {
    if (!activeMeeting || !primeInput.trim()) return;
    const current = activeMeeting.attendees_prime || [];
    if (!current.includes(primeInput.trim())) {
      setActiveMeeting({ ...activeMeeting, attendees_prime: [...current, primeInput.trim()] });
    }
    setPrimeInput("");
  };

  const handleRemovePrimeAttendee = (name: string) => {
    if (!activeMeeting) return;
    setActiveMeeting({
      ...activeMeeting,
      attendees_prime: (activeMeeting.attendees_prime || []).filter((a) => a !== name)
    });
  };

  const handleAddExternalAttendee = () => {
    if (!activeMeeting || !externalInput.trim()) return;
    const current = activeMeeting.attendees_external || [];
    if (!current.includes(externalInput.trim())) {
      setActiveMeeting({ ...activeMeeting, attendees_external: [...current, externalInput.trim()] });
    }
    setExternalInput("");
  };

  const handleRemoveExternalAttendee = (name: string) => {
    if (!activeMeeting) return;
    setActiveMeeting({
      ...activeMeeting,
      attendees_external: (activeMeeting.attendees_external || []).filter((a) => a !== name)
    });
  };

  // Save changes
  const handleSaveChanges = async () => {
    if (!activeMeeting) return;
    try {
      await onUpdateMeeting(activeMeeting, currentMeeting || undefined);
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);
    } catch (error: any) {
      alert(error.message || "Unable to save changes to ClickUp.");
    }
  };

  const handleDiscoverTopics = async (queryOverride?: string) => {
    if (!activeMeeting?.transcript?.trim()) {
      alert("No transcript found for this meeting archive.");
      return;
    }
    if (isDiscoveringTopics) return;
    setIsDiscoveringTopics(true);
    const activeQuery = queryOverride !== undefined ? queryOverride : topicQuery;
    try {
      const response = await fetch("/api/discover-topics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getStoredApiKey() || "",
        },
        body: JSON.stringify({
          transcript: activeMeeting.transcript,
          query: activeQuery,
          existingTopics: (activeMeeting.items || []).map((item) => item.topic),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to discover topics.");
      const incomingList: DiscoveredTopicItem[] = data.topics || [];
      if (activeQuery?.trim() && missedTopics.length > 0) {
        const existingSet = new Set(missedTopics.map((t) => t.topic_title.toLowerCase().trim()));
        const uniqueIncoming = incomingList.filter((t) => !existingSet.has(t.topic_title.toLowerCase().trim()));
        setMissedTopics([...uniqueIncoming, ...missedTopics]);
      } else {
        setMissedTopics(incomingList);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to discover topics.");
    } finally {
      setIsDiscoveringTopics(false);
    }
  };

  const handleAddDiscoveredTopic = (index: number = 0) => {
    if (!activeMeeting) return;
    const suggestion = missedTopics[index];
    if (!suggestion) return;
    const newItem: DiscussionItem = {
      id: `dp_${Date.now()}_${activeMeeting.items.length}`,
      topic: suggestion.topic_title,
      evidence: suggestion.evidence_quote || "",
      discussion_point: suggestion.discussion_point || "Review and complete the discussion details.",
      action_plan: suggestion.action_plan || "None",
      target_date: suggestion.indicative_delivery_date || "TBD",
      person_in_charge: suggestion.person_in_charge || "Unassigned",
    };
    setActiveMeeting({
      ...activeMeeting,
      items: [...activeMeeting.items, newItem],
    });
    setMissedTopics((topics) => topics.filter((_, i) => i !== index));
  };

  const handleAddAllDiscoveredTopics = () => {
    if (!activeMeeting || !missedTopics.length) return;
    const newItems: DiscussionItem[] = missedTopics.map((suggestion, idx) => ({
      id: `dp_${Date.now()}_${activeMeeting.items.length + idx}`,
      topic: suggestion.topic_title,
      evidence: suggestion.evidence_quote || "",
      discussion_point: suggestion.discussion_point || "Review and complete the discussion details.",
      action_plan: suggestion.action_plan || "None",
      target_date: suggestion.indicative_delivery_date || "TBD",
      person_in_charge: suggestion.person_in_charge || "Unassigned",
    }));
    setActiveMeeting({
      ...activeMeeting,
      items: [...activeMeeting.items, ...newItems],
    });
    setMissedTopics([]);
  };

  const handleDismissDiscoveredTopic = (index: number) => {
    setMissedTopics((topics) => topics.filter((_, i) => i !== index));
  };

  const handleCopyTranscript = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      // ignore
    }
  };

  // Delete meeting
  const handleConfirmDelete = async () => {
    if (!activeMeeting) return;
    setIsDeleting(true);
    try {
      if (onDeleteMeeting) {
        await onDeleteMeeting(activeMeeting.id);
      }
      setShowDeleteModal(false);
    } catch (error: any) {
      alert(error.message || "Failed to delete meeting archive.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Re-export Word
  const handleExportWord = async () => {
    if (!activeMeeting) return;
    setIsExporting(true);
    try {
      const metadata = {
        client_name: activeMeeting.title,
        date: activeMeeting.date,
        meeting_type: activeMeeting.meeting_type,
        location: activeMeeting.location,
        attendees_prime: activeMeeting.attendees_prime,
        attendees_external: activeMeeting.attendees_external
      };
      await exportWord(metadata, activeMeeting.items, activeMeeting.summary);
    } catch (e: any) {
      alert("Failed to export Word: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Re-export PDF
  const handleExportPdf = async () => {
    if (!activeMeeting) return;
    setIsExporting(true);
    try {
      const metadata = {
        client_name: activeMeeting.title,
        date: activeMeeting.date,
        meeting_type: activeMeeting.meeting_type,
        location: activeMeeting.location,
        attendees_prime: activeMeeting.attendees_prime,
        attendees_external: activeMeeting.attendees_external
      };
      await exportPdf(metadata, activeMeeting.items, activeMeeting.summary);
    } catch (e: any) {
      alert("Failed to export PDF: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#003366] italic">
            Meetings Archives
          </h1>
          <p className="text-xs font-bold tracking-wider text-gray-400 uppercase mt-0.5">
            Structured records • In-Place Editing • Instant Re-Export
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          {/* Space Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Space</span>
            <select
              value={selectedMeetingSpace}
              onChange={(event) => {
                const spaceId = event.target.value;
                setSelectedMeetingSpace(spaceId);
                onSelectMeetingSpace?.(spaceId);
              }}
              className="border border-gray-200 bg-white py-1 px-2.5 min-w-[150px] max-w-[260px] text-xs font-normal normal-case tracking-normal text-left text-[#003366] hover:border-gray-300 focus:outline-none focus:border-[#C9AB4C] transition-colors cursor-pointer"
            >
              <option value="__all__">All spaces</option>
              <option value="__personal__">Personal List</option>
              {meetingSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} — {space.teamName}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="border border-gray-200 bg-white py-1 px-2 text-xs font-normal normal-case tracking-normal text-[#003366] hover:border-gray-300 focus:outline-none focus:border-[#C9AB4C] transition-colors cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="border border-gray-200 bg-white py-1 px-2 text-xs font-normal normal-case tracking-normal text-[#003366] hover:border-gray-300 focus:outline-none focus:border-[#C9AB4C] transition-colors cursor-pointer"
            />
          </div>

          {(fromDate || toDate || selectedMeetingSpace !== "__all__") && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setSelectedMeetingSpace("__all__");
                onSelectMeetingSpace?.("__all__");
              }}
              className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-[#003366] transition-colors cursor-pointer"
              title="Reset all filters"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Master-Detail Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT MASTER PANE (4 cols) */}
        <div className="lg:col-span-4 space-y-3 bg-[#FFFCFB] border border-gray-200/90 rounded-none p-4 shadow-2xs">
          {/* Search Box */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter archived meetings..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 rounded-none focus:outline-none focus:border-[#C9AB4C]"
            />
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 pt-1">
            {(["All", "Internal", "External", "Archives"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTypeFilter(t);
                  if (t === "Archives") {
                    refreshInterruptedSessions();
                  }
                }}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-none transition-colors flex items-center gap-1 ${
                  typeFilter === t
                    ? "bg-[#003366] text-white"
                    : "bg-[#FFFCFB] text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t === "Archives" && <Archive size={11} className={typeFilter === t ? "text-[#C9AB4C]" : "text-gray-500"} />}
                <span>{t}</span>
                {t === "Archives" && interruptedItems.length > 0 && (
                  <span className={`text-[9px] font-bold px-1 py-0.2 rounded-none ${typeFilter === t ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-800"}`}>
                    {interruptedItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Meeting Cards List */}
          <div className="space-y-2 pt-2 max-h-[720px] overflow-y-auto pr-1">
            {typeFilter === "Archives" ? (
              interruptedItems.length > 0 ? (
                interruptedItems.map((item) => {
                  const isSelected = selectedInterruptedId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedInterruptedId(item.id)}
                      className={`p-3.5 rounded-none border text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[#FAF9F7] border-[#C9AB4C] shadow-xs"
                          : "bg-[#FFFCFB] border-amber-200 hover:border-amber-300 hover:bg-[#FFFCFB]/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className={`font-serif text-base lg:text-[17px] font-bold italic line-clamp-1 ${isSelected ? "text-[#003366]" : "text-[#1b1d1e]"}`}>
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                            <AlertTriangle size={10} className="text-amber-700" /> Interrupted
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-none bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                            {item.mediaType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} className="text-[#C9AB4C]" />
                          <span>{item.date ? formatEchoDate(item.date) : "Recent Recording"}</span>
                        </div>
                        {item.durationSeconds > 0 ? (
                          <div className="flex items-center gap-1 text-[10px] text-gray-500">
                            <Clock size={10} className="text-[#003366]" />
                            <span>
                              {Math.floor(item.durationSeconds / 60)}m {item.durationSeconds % 60}s
                            </span>
                          </div>
                        ) : item.fileSize ? (
                          <span className="text-[10px] text-gray-400">
                            {(item.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                        <span>{item.noteCount > 0 ? `${item.noteCount} Notes captured` : "Unprocessed recording"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#C9AB4C] font-semibold">{isSelected ? "Selected" : "View"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-gray-400">
                  No interrupted recordings found.
                </div>
              )
            ) : filteredList.length > 0 ? (
              filteredList.map((m) => {
                const isSelected = activeMeeting?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => onSelectMeeting(m.id)}
                    className={`p-3.5 rounded-none border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#FAF9F7] border-[#C9AB4C] shadow-xs"
                        : "bg-[#FFFCFB] border-gray-200 hover:border-gray-300 hover:bg-[#FFFCFB]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className={`font-serif text-base lg:text-[17px] font-bold italic line-clamp-1 ${isSelected ? "text-[#003366]" : "text-[#1b1d1e]"}`}>
                        {m.title}
                      </h4>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {m.is_confidential ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                            <Lock size={10} className="text-amber-800" /> Private
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 bg-blue-50 text-[#003366] border border-blue-200 uppercase tracking-wider">
                            <Users size={10} className="text-[#003366]" /> Shared
                          </span>
                        )}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-none bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                          {m.meeting_type}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar size={11} className="text-[#C9AB4C]" />
                        <span>{formatEchoDate(m.date)}</span>
                      </div>
                      {m.clickup_space_name && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-[#003366] font-medium border border-slate-200 truncate max-w-[130px]">
                          {m.clickup_space_name}
                        </span>
                      )}
                    </div>

                    {m.location && (
                      <div className="text-[10px] text-gray-400 truncate mt-1">
                        {m.location}
                      </div>
                    )}

                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                      <span>{m.items.length} Topics</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#C9AB4C] font-semibold">{isSelected ? "Editing" : "View"}</span>
                        <a
                          href={m.clickup_task_url || `https://app.clickup.com/t/${m.meeting_id || m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 border border-[#003366]/25 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[#003366] hover:border-[#C9AB4C] hover:text-[#8c7329]"
                          title="Open this meeting archive in ClickUp"
                        >
                          <ExternalLink size={10} />
                          ClickUp
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-gray-400">
                No meetings match your filter.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT DETAIL PANE (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {typeFilter === "Archives" ? (
            activeInterruptedItem ? (
              <div className="bg-[#FFFCFB] border border-amber-200/90 rounded-none p-6 shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-widest uppercase text-amber-900 bg-amber-100 px-2 py-0.5 border border-amber-300 flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-amber-700" />
                      Interrupted Meeting Record
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      #{activeInterruptedItem.id.slice(-10)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Process into Minutes */}
                    <button
                      type="button"
                      onClick={() => {
                        if (activeInterruptedItem.kind === "indexeddb" && activeInterruptedItem.session) {
                          void handleProcessInterruptedSession(activeInterruptedItem.session);
                        } else if (activeInterruptedItem.fileName) {
                          void handleProcessLocalInterruptedFile(activeInterruptedItem.fileName);
                        }
                      }}
                      disabled={isProcessingInterrupted === activeInterruptedItem.id}
                      className="btn-primary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5 shadow-xs rounded-none cursor-pointer"
                    >
                      <Sparkles size={13} className="text-[#C9AB4C]" />
                      <span>
                        {isProcessingInterrupted === activeInterruptedItem.id ? "Processing…" : "Process into Minutes Now"}
                      </span>
                    </button>

                    {/* Download Recording */}
                    <button
                      type="button"
                      onClick={() => {
                        if (activeInterruptedItem.kind === "indexeddb") {
                          void handleDownloadInterruptedSession(activeInterruptedItem.id);
                        } else if (activeInterruptedItem.fileName) {
                          handleDownloadLocalInterruptedFile(activeInterruptedItem.fileName);
                        }
                      }}
                      className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1.5 text-[#003366] rounded-none cursor-pointer"
                      title="Download recorded file to disk"
                    >
                      <Download size={13} className="text-[#C9AB4C]" />
                      <span>Download</span>
                    </button>

                    {/* Discard / Delete */}
                    <button
                      type="button"
                      onClick={() => {
                        if (activeInterruptedItem.kind === "indexeddb") {
                          void handleDiscardInterruptedSession(activeInterruptedItem.id);
                        } else if (activeInterruptedItem.fileName) {
                          void handleDiscardLocalInterruptedFile(activeInterruptedItem.fileName);
                        }
                      }}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 transition-colors rounded-none cursor-pointer"
                      title="Discard interrupted recording"
                      aria-label="Discard interrupted recording"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Metadata summary grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/50 p-4 border border-amber-200 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-0.5">
                      Recorded Date
                    </label>
                    <p className="font-semibold text-gray-800">
                      {activeInterruptedItem.date ? formatEchoDate(activeInterruptedItem.date) : "Recent Session"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-0.5">
                      Recorded Duration
                    </label>
                    <p className="font-semibold text-gray-800">
                      {activeInterruptedItem.durationSeconds > 0
                        ? `${Math.floor(activeInterruptedItem.durationSeconds / 60)} mins ${activeInterruptedItem.durationSeconds % 60} secs`
                        : activeInterruptedItem.fileSize
                        ? `${(activeInterruptedItem.fileSize / (1024 * 1024)).toFixed(2)} MB on disk`
                        : "Incomplete recording"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-0.5">
                      Media Type
                    </label>
                    <p className="font-semibold text-gray-800 uppercase tracking-wide">
                      {activeInterruptedItem.mediaType === "video" ? "Screen / Video + Audio" : "Audio Recording"}
                    </p>
                  </div>
                </div>

                {/* Storage Origin Info */}
                <div className="text-[11px] text-gray-600 bg-[#FFFCFB] border border-gray-200 p-3">
                  <span className="font-bold text-[#003366]">Storage Location: </span>
                  {activeInterruptedItem.kind === "indexeddb" ? (
                    <span>Browser storage & auto-saved in Documents/Mosaic Meetings</span>
                  ) : (
                    <span>Local disk in Documents/Mosaic Meetings ({activeInterruptedItem.fileName})</span>
                  )}
                </div>

                {/* Notes taken during interrupted session if available */}
                {activeInterruptedItem.session?.notes && activeInterruptedItem.session.notes.length > 0 && (
                  <div className="border border-gray-200 bg-[#FFFCFB] p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#003366]">
                      Notes Captured During Meeting ({activeInterruptedItem.session.notes.length})
                    </h4>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {activeInterruptedItem.session.notes.map((n) => (
                        <div key={n.id} className="text-xs bg-slate-50 border border-slate-200 p-2 flex items-start gap-2">
                          <span className="font-mono text-[10px] font-bold text-[#003366] bg-slate-200 px-1 py-0.5 shrink-0">
                            {n.timestamp}
                          </span>
                          <span className="text-gray-800">{n.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#FFFCFB] border border-gray-200 rounded-none p-12 text-center text-gray-400 text-xs">
                Select an interrupted recording from the archives list on the left to review or process.
              </div>
            )
          ) : activeMeeting ? (
            <>
              {/* Meeting Header & Export Action Bar */}
              <div className="bg-[#FFFCFB] border border-gray-200/90 rounded-none p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-widest uppercase text-[#003366]">
                      Meeting Record
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      #{activeMeeting.meeting_id || activeMeeting.id}
                    </span>
                    <button type="button" onClick={() => setShowArchiveDetails(true)} className="inline-flex h-6 w-6 items-center justify-center text-[#003366] hover:bg-[#003366]/5 rounded-none cursor-pointer" title="Show archive details" aria-label="Show archive details">
                      <Info size={14} />
                    </button>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canExport && <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowShareMenu((open) => !open)}
                        disabled={isExporting}
                        aria-haspopup="menu"
                        aria-expanded={showShareMenu}
                        className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1.5 text-[#003366] rounded-none"
                      >
                        <Send size={13} className="text-[#C9AB4C]" />
                        <span>{isExporting ? "Working…" : "Share"}</span>
                        <ChevronDown size={13} className="ml-0.5" />
                      </button>
                      {showShareMenu && !isExporting && <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-[180px] border border-[#003366]/20 bg-[#FFFCFB] p-1 shadow-lg">
                        <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Share</div>
                        <button type="button" role="menuitem" onClick={() => { setShowShareMenu(false); setShowEmailModal(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#003366] hover:bg-[#003366]/5 cursor-pointer"><Send size={13} className="text-[#C9AB4C]" /> Email via Outlook</button>
                        <div className="my-1 border-t border-slate-200" />
                        <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Export</div>
                        <button type="button" role="menuitem" onClick={() => { setShowShareMenu(false); void handleExportWord(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#003366] hover:bg-[#003366]/5 cursor-pointer"><FileText size={13} className="text-[#C9AB4C]" /> Word (.docx)</button>
                        <button type="button" role="menuitem" onClick={() => { setShowShareMenu(false); void handleExportPdf(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#003366] hover:bg-[#003366]/5 cursor-pointer"><Download size={13} className="text-[#C9AB4C]" /> PDF (.pdf)</button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setShowShareMenu(false); handleExportRecording(); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#003366] hover:bg-[#003366]/5 cursor-pointer"
                        >
                          {recordingType === "video" ? (
                            <Video size={13} className="text-[#C9AB4C]" />
                          ) : (
                            <Mic size={13} className="text-[#C9AB4C]" />
                          )}
                          <span>{recordingType === "video" ? `Export Video (.${recordingFormat})` : `Export Audio (.${recordingFormat})`}</span>
                        </button>
                      </div>}
                    </div>}

                    {matchedRecording && (
                      <button
                        type="button"
                        onClick={handleDownloadMatchedRecording}
                        className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1.5 text-[#003366] bg-amber-50/50 hover:bg-amber-100/60 border-amber-300 rounded-none cursor-pointer"
                        title={`Download recorded file: ${matchedRecording.name}`}
                      >
                        {matchedRecording.name.endsWith(".mp4") || matchedRecording.name.endsWith(".webm") ? (
                          <Video size={13} className="text-[#C9AB4C]" />
                        ) : (
                          <Mic size={13} className="text-[#C9AB4C]" />
                        )}
                        <span>{matchedRecording.name.endsWith(".mp4") || matchedRecording.name.endsWith(".webm") ? "Save Video" : "Save Audio"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowMoveModal(true)}
                      className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1.5 text-[#003366] rounded-none cursor-pointer"
                      title="Move meeting archive to another ClickUp list"
                    >
                      <FolderInput size={13} className="text-[#C9AB4C]" />
                      <span>Move</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      className="btn-primary !py-1.5 !px-4 !text-xs flex items-center gap-1.5 shadow-xs rounded-none"
                    >
                      <Save size={13} />
                      <span>Save Changes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 transition-colors rounded-none"
                      title="Delete meeting archive"
                      aria-label="Delete meeting archive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {saveSuccessMsg && (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-none text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>Meeting record updated and saved to archives.</span>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {/* Title */}
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Meeting Name
                    </label>
                    <input
                      type="text"
                      value={activeMeeting.title}
                      onChange={(e) => setActiveMeeting({ ...activeMeeting, title: e.target.value })}
                      className="w-full font-serif font-bold text-base text-[#003366] bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 focus:outline-none focus:border-[#C9AB4C] focus:bg-[#FFFCFB]"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Meeting Date
                    </label>
                    <DatePickerInput
                      value={activeMeeting.date}
                      onChange={(val) => setActiveMeeting({ ...activeMeeting, date: val })}
                    />
                  </div>

                  {/* Meeting Type */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Meeting Type
                    </label>
                    <div className="flex gap-2">
                      {(["Internal", "External", "Team"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setActiveMeeting({ ...activeMeeting, meeting_type: t })}
                          className={`flex-1 py-1.5 rounded-none font-semibold text-xs transition-colors ${
                            activeMeeting.meeting_type === t
                              ? "bg-[#003366] text-white"
                              : "bg-[#FFFCFB] text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Start Time (Shown, not editable) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Start Time
                    </label>
                    <div className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 text-xs text-gray-700 font-medium flex items-center justify-between">
                      <span>{formatDisplayTime(activeMeeting.start_time)}</span>
                      <Clock size={13} className="text-gray-400" />
                    </div>
                  </div>

                  {/* End Time (Shown, not editable) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      End Time
                    </label>
                    <div className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 text-xs text-gray-700 font-medium flex items-center justify-between">
                      <span>{formatDisplayTime(activeMeeting.end_time)}</span>
                      <Clock size={13} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Location / Venue */}
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Location / Venue
                    </label>
                    <select
                      value={isCustomVenue ? "Other / Custom..." : activeMeeting.location}
                      onChange={(e) => {
                        if (e.target.value === "Other / Custom...") {
                          setIsCustomVenue(true);
                        } else {
                          setIsCustomVenue(false);
                          setActiveMeeting({ ...activeMeeting, location: e.target.value });
                        }
                      }}
                      className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-[#C9AB4C]"
                    >
                      {VENUE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    {isCustomVenue && (
                      <input
                        type="text"
                        value={activeMeeting.location}
                        onChange={(e) => setActiveMeeting({ ...activeMeeting, location: e.target.value })}
                        placeholder="Enter custom venue location..."
                        className="w-full mt-1.5 bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-[#C9AB4C]"
                      />
                    )}
                  </div>

                  {/* Meeting Duration (Shown, not editable) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Meeting Duration
                    </label>
                    <div className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none px-2.5 py-1.5 text-xs text-gray-700 font-medium flex items-center justify-between">
                      <span>{getMeetingDurationMinutes(activeMeeting)}</span>
                      <span className="text-xs text-gray-400 font-medium">mins</span>
                    </div>
                  </div>
                </div>

                {/* Attendees Rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                  {/* Team Attendees */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#003366] mb-1">
                      Team Attendees
                    </label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {(activeMeeting.attendees_prime || []).map((att) => (
                        <span key={att} className="inline-flex items-center gap-1 text-[11px] bg-[#003366]/10 text-[#003366] px-2 py-0.5 rounded-none font-medium">
                          {att}
                          <button onClick={() => handleRemovePrimeAttendee(att)} className="hover:text-red-500">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={primeInput}
                        onChange={(e) => setPrimeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPrimeAttendee();
                          }
                        }}
                        placeholder="Add team attendee..."
                        className="flex-1 text-xs bg-[#FFFCFB] border border-gray-200 rounded-none px-2 py-1 focus:outline-none focus:border-[#C9AB4C]"
                      />
                      <button onClick={handleAddPrimeAttendee} className="btn-outline !py-1 !px-2.5 !text-xs rounded-none">
                        Add
                      </button>
                    </div>
                  </div>

                  {/* External Attendees */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#C9AB4C] mb-1">
                      External Attendees
                    </label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {(activeMeeting.attendees_external || []).map((att) => (
                        <span key={att} className="inline-flex items-center gap-1 text-[11px] bg-[#C9AB4C]/15 text-gray-800 px-2 py-0.5 rounded-none font-medium">
                          {att}
                          <button onClick={() => handleRemoveExternalAttendee(att)} className="hover:text-red-500">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={externalInput}
                        onChange={(e) => setExternalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddExternalAttendee();
                          }
                        }}
                        placeholder="Add external attendee..."
                        className="flex-1 text-xs bg-[#FFFCFB] border border-gray-200 rounded-none px-2 py-1 focus:outline-none focus:border-[#C9AB4C]"
                      />
                      <button onClick={handleAddExternalAttendee} className="btn-outline !py-1 !px-2.5 !text-xs rounded-none">
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Executive Summary
                  </label>
                  <AutoResizeTextarea
                    value={activeMeeting.summary}
                    onChange={(e) => setActiveMeeting({ ...activeMeeting, summary: e.target.value })}
                    placeholder="Enter short summary based on discussion points..."
                    className="w-full text-xs text-gray-700 bg-[#FFFCFB]/60 border border-gray-200 rounded-none p-2.5 focus:outline-none focus:border-[#C9AB4C] leading-relaxed"
                  />
                </div>
              </div>

              {/* 3 TABS: Discussion Points vs Meeting Notes vs Transcript */}
              <div className="flex border-b border-gray-200 bg-[#FFFCFB]">
                <button
                  type="button"
                  onClick={() => setDetailTab("discussion")}
                  className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                    detailTab === "discussion"
                      ? "border-[#003366] text-[#003366] bg-white"
                      : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Discussion Points
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("notes")}
                  className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                    detailTab === "notes"
                      ? "border-[#003366] text-[#003366] bg-white"
                      : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Meeting Notes
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("transcript")}
                  className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                    detailTab === "transcript"
                      ? "border-[#003366] text-[#003366] bg-white"
                      : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Transcript
                </button>
              </div>

              {detailTab === "transcript" ? (
                /* Transcript Tab */
                <div className="bg-[#FFFCFB] border border-gray-200/90 rounded-none p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-serif font-bold text-lg text-[#003366] italic">
                        Full Raw Transcript
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Spoken dialogue and speaker turns captured during the recording session.
                      </p>
                    </div>
                    {activeMeeting.transcript && (
                      <button
                        type="button"
                        onClick={() => handleCopyTranscript(activeMeeting.transcript || "")}
                        className="btn-outline !py-1 !px-2.5 !text-[11px] rounded-none flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedTranscript ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedTranscript ? "Copied" : "Copy Transcript"}</span>
                      </button>
                    )}
                  </div>

                  {activeMeeting.transcript?.trim() ? (
                    <AutoResizeTextarea
                      value={activeMeeting.transcript || ""}
                      onChange={(e) => setActiveMeeting({ ...activeMeeting, transcript: e.target.value })}
                      placeholder="Full raw transcript text..."
                      className="w-full text-xs font-mono text-gray-700 bg-[#FFFCFB] border border-gray-200 rounded-none p-3.5 focus:outline-none focus:border-[#C9AB4C] leading-relaxed min-h-[320px]"
                      rows={14}
                    />
                  ) : (
                    <div className="border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                      <FileText size={22} className="mx-auto text-[#003366]" />
                      <p className="mt-2 text-sm font-medium text-slate-600">No transcript attached to this meeting</p>
                      <p className="mt-1 text-xs text-slate-400">Audio recordings or uploaded transcripts appear here.</p>
                    </div>
                  )}
                </div>
              ) : detailTab === "notes" ? (
                /* Meeting Notes Tab */
                <div className="bg-[#FFFCFB] border border-gray-200/90 rounded-none p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-serif font-bold text-lg text-[#003366] italic">
                        Meeting Notes
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Notes captured in the workspace during the meeting session.
                      </p>
                    </div>
                  </div>

                  {/* Timestamped Notes List Preview */}
                  {(() => {
                    const rawNotes = activeMeeting.meeting_notes || "";
                    const lines = rawNotes.split("\n").map((l) => l.trim()).filter(Boolean);
                    if (lines.length === 0) {
                      return (
                        <div className="border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                          <MessageCircle size={22} className="mx-auto text-[#003366]" />
                          <p className="mt-2 text-sm font-medium text-slate-600">No meeting notes recorded</p>
                          <p className="mt-1 text-xs text-slate-400">Notes captured in the workspace stay linked to the meeting time.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                        {lines.map((line, idx) => {
                          const match = line.match(/^(\[\d{2}:\d{2}(?::\d{2})?\])\s*(.*)$/);
                          const timestamp = match ? match[1] : null;
                          const noteText = match ? match[2] : line;
                          return (
                            <div key={idx} className="flex items-start gap-2.5 border border-slate-200 bg-white p-3 shadow-2xs">
                              {timestamp ? (
                                <span className="text-[#003366] font-mono text-[11px] font-semibold shrink-0 border border-[#003366]/15 px-2 py-0.5 bg-slate-50">
                                  {timestamp}
                                </span>
                              ) : (
                                <span className="text-[#C9AB4C] font-mono text-[11px] font-semibold shrink-0 border border-[#C9AB4C]/20 px-2 py-0.5 bg-amber-50/50">
                                  #{idx + 1}
                                </span>
                              )}
                              <span className="text-xs text-slate-700 flex-1 leading-relaxed break-words">
                                {noteText}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Discussion Points Matrix Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif font-bold text-lg text-[#003366] italic">
                      Discussion Points Matrix
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddNewItem}
                        className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1 text-[#003366] hover:bg-[#003366] hover:text-white transition-all rounded-none cursor-pointer"
                      >
                        <Plus size={13} /> Add Topic
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeMeeting.transcript?.trim()) {
                            alert("No transcript found for this meeting archive to discover topics from.");
                            return;
                          }
                          setShowDiscoverTopicsModal(true);
                          if (missedTopics.length === 0) {
                            void handleDiscoverTopics("");
                          }
                        }}
                        className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 rounded-none cursor-pointer"
                      >
                        <Sparkles size={13} className="text-[#c9ab4c]" />
                        <span>Discover Topics</span>
                      </button>
                    </div>
                  </div>

                {/* Dynamic Cards */}
                {activeMeeting.items.length === 0 ? (
                  <div className="border border-dashed border-slate-300 bg-white/60 p-8 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-600">No discussion topics recorded yet</p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddNewItem}
                        className="btn-outline !py-1.5 !px-3 !text-xs flex items-center gap-1 text-[#003366] hover:bg-[#003366] hover:text-white transition-all rounded-none cursor-pointer"
                      >
                        <Plus size={13} /> Add Topic Manually
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeMeeting.transcript?.trim()) {
                            alert("No transcript found for this meeting archive to discover topics from.");
                            return;
                          }
                          setShowDiscoverTopicsModal(true);
                          if (missedTopics.length === 0) {
                            void handleDiscoverTopics("");
                          }
                        }}
                        className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 rounded-none cursor-pointer"
                      >
                        <Sparkles size={13} className="text-[#c9ab4c]" />
                        <span>Discover Topics</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  activeMeeting.items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="bg-[#FFFCFB] border border-gray-200/90 rounded-none p-5 shadow-2xs space-y-3 relative group"
                  >
                    {/* Top Header: Topic (Editable in-place) & Top-Right Move/Remove Controls */}
                    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2.5">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-[11px] font-bold font-mono text-[#C9AB4C] bg-[#FAF9F7] px-2 py-0.5 rounded-none border border-gray-200 shrink-0">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.topic}
                          onChange={(e) => handleUpdateItem(idx, "topic", e.target.value)}
                          placeholder="Topic Title..."
                          className="w-full font-serif font-bold text-base text-[#003366] bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#C9AB4C] focus:outline-none py-0.5 transition-colors"
                        />
                      </div>

                      {/* Top-Right Move and Remove Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveItem(idx, "up")}
                          disabled={idx === 0}
                          title="Move Topic Up"
                          className="p-1 text-gray-400 hover:text-[#003366] disabled:opacity-20 hover:bg-[#FFFCFB] rounded-none"
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveItem(idx, "down")}
                          disabled={idx === activeMeeting.items.length - 1}
                          title="Move Topic Down"
                          className="p-1 text-gray-400 hover:text-[#003366] disabled:opacity-20 hover:bg-[#FFFCFB] rounded-none"
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove Topic"
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-none transition-colors ml-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Evidence Quote */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Evidence / Transcript Timestamp
                      </label>
                      <input
                        type="text"
                        value={item.evidence}
                        onChange={(e) => handleUpdateItem(idx, "evidence", e.target.value)}
                        placeholder="[00:00] Quote or contextual anchor..."
                        className="w-full text-[11px] text-gray-500 italic bg-[#FFFCFB] border-l-2 border-[#C9AB4C] px-2.5 py-1 border border-gray-200/80 rounded-none focus:outline-none focus:border-[#C9AB4C]"
                      />
                    </div>

                    {/* Row for Discussion Point, Action Plan, Target Date, Person in Charge */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs pt-1">
                      {/* Discussion Point (4 cols) */}
                      <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                          Discussion Point
                        </label>
                        <AutoResizeTextarea
                          value={item.discussion_point}
                          onChange={(e) => handleUpdateItem(idx, "discussion_point", e.target.value)}
                          placeholder="Key debate or takeaway..."
                          className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none p-2 text-xs focus:outline-none focus:border-[#C9AB4C]"
                        />
                      </div>

                      {/* Action Plan (4 cols) */}
                      <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#003366] mb-1">
                          Action Plan
                        </label>
                        <AutoResizeTextarea
                          value={item.action_plan}
                          onChange={(e) => handleUpdateItem(idx, "action_plan", e.target.value)}
                          placeholder="Action item or next step..."
                          className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none p-2 text-xs focus:outline-none focus:border-[#003366]"
                        />
                      </div>

                      {/* Target Date (2 cols) */}
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                          Target Date
                        </label>
                        <DatePickerInput
                          value={item.target_date}
                          onChange={(val) => handleUpdateItem(idx, "target_date", val)}
                        />
                      </div>

                      {/* Person in Charge (2 cols) */}
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                          In Charge
                        </label>
                        <input
                          type="text"
                          value={item.person_in_charge}
                          onChange={(e) => handleUpdateItem(idx, "person_in_charge", e.target.value)}
                          placeholder="Assignee..."
                          className="w-full bg-[#FFFCFB] border border-gray-200 rounded-none px-2 py-1 text-xs focus:outline-none focus:border-[#C9AB4C]"
                        />
                      </div>
                    </div>

                    {/* Quick Task Action Bar */}
                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                      <span className="text-[10px] text-gray-400 font-mono">
                        Topic #{idx + 1}
                      </span>
                      {item.clickUpTaskId ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToTasks && onNavigateToTasks(item.clickUpTaskId!)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs rounded-none cursor-pointer"
                          title="Already added to ClickUp. Click to view in Tasks portal"
                        >
                          <CheckCircle size={13} className="text-emerald-600" />
                          <span>Added to Tasks</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickAddTaskData({
                              isOpen: true,
                              data: {
                                name:
                                  item.action_plan && item.action_plan !== "None"
                                    ? item.action_plan
                                    : item.topic || `Action from Topic #${idx + 1}`,
                                description: item.discussion_point || "",
                                topic: item.topic || "",
                                evidence: item.evidence || "",
                                meetingTitle: activeMeeting?.title || "Meeting Archive",
                                meetingDate: activeMeeting?.date,
                                dueDate: item.target_date || "",
                                priority: "normal",
                                assigneeName: item.person_in_charge || "",
                                discussionPointId: String(item.id || `dp_${activeMeeting?.id}_${idx + 1}`),
                                existingTaskId: item.clickUpTaskId,
                                existingTaskUrl: item.clickUpUrl,
                              },
                              topicIndex: idx,
                            });
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-[#003366] bg-[#FFFCFB] border border-[#003366]/30 hover:border-[#003366] hover:bg-blue-50/50 transition-colors shadow-2xs rounded-none cursor-pointer"
                        >
                          <CheckSquare size={13} className="text-[#c9ab4c]" />
                          <span>Add to Tasks</span>
                        </button>
                      )}
                    </div>
                  </div>
                )))}
              </div>
              )}
            </>
          ) : (
            <div className="bg-[#FFFCFB] border border-gray-200 rounded-none p-12 text-center text-gray-400 text-xs">
              Select a meeting from the archive list on the left to view details and discussion points.
            </div>
          )}
        </div>

      </div>

      {showArchiveDetails && activeMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001E3C]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="archive-details-title">
          <div className="w-full max-w-sm border border-slate-200 bg-[#FFFCFB] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div><h2 id="archive-details-title" className="text-sm font-bold uppercase tracking-[0.14em] text-[#003366]">Meeting Archive Details</h2><p className="mt-1 text-[11px] text-slate-500">Reference information only.</p></div>
              <button type="button" onClick={() => setShowArchiveDetails(false)} aria-label="Close archive details" className="text-slate-400 hover:text-[#003366]"><X size={16} /></button>
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Space</dt><dd className="mt-1 text-[#003366]">{activeMeeting.clickup_space_name || "Not recorded"}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">List</dt><dd className="mt-1 text-[#003366]">{activeMeeting.clickup_list_name || "Not recorded"}</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</dt><dd className="mt-1 text-[#003366]">{activeMeeting.archive_status || "Completed On Time"}</dd></div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Start Time</dt><dd className="mt-1 text-[#003366] font-medium">{formatDisplayTime(activeMeeting.start_time)}</dd></div>
                <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">End Time</dt><dd className="mt-1 text-[#003366] font-medium">{formatDisplayTime(activeMeeting.end_time)}</dd></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Meeting Duration</dt><dd className="mt-1 text-[#003366] font-medium">{getMeetingDurationMinutes(activeMeeting)} mins</dd></div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Meeting Cost</dt>
                  <dd className="mt-1 text-base font-serif font-bold text-[#003366]">
                    ₱{((getMeetingDurationMinutes(activeMeeting) / 60) * TOTAL_AI_PHP_PER_HOUR).toFixed(2)}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>
      )}

      <EmailMeetingModal
        isOpen={showEmailModal && !!activeMeeting}
        onClose={() => setShowEmailModal(false)}
        fromEmail={userEmail}
        meeting={activeMeeting ? {
          title: activeMeeting.title,
          date: activeMeeting.date,
          metadata: {
            client_name: activeMeeting.title,
            date: activeMeeting.date,
            meeting_type: activeMeeting.meeting_type,
            location: activeMeeting.location,
            attendees_prime: activeMeeting.attendees_prime,
            attendees_external: activeMeeting.attendees_external,
          },
          items: activeMeeting.items,
          summary: activeMeeting.summary,
        } : { metadata: {}, items: [] }}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && activeMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001E3C]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="w-full max-w-md border border-slate-200 bg-[#FFFCFB] p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 size={18} />
                <h2 id="delete-modal-title" className="text-sm font-bold uppercase tracking-wider">
                  Delete Meeting Archive
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-[#003366]"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Are you sure you want to permanently delete this meeting archive?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200">
                <div className="font-serif font-bold text-sm text-[#003366] line-clamp-1">{activeMeeting.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{formatEchoDate(activeMeeting.date)} • {activeMeeting.items.length} discussion topics</div>
              </div>
              <p className="text-[11px] text-slate-500">
                This will remove the meeting record from ClickUp and the archive database. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="btn-outline !py-1.5 !px-3 !text-xs rounded-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-1.5 text-xs rounded-none shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting && <Loader2 size={12} className="animate-spin" />}
                <span>{isDeleting ? "Deleting..." : "Delete Archive"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Meeting Archive Modal */}
      {activeMeeting && (
        <MoveMeetingModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          meeting={activeMeeting}
          spaces={meetingSpaces}
          onMeetingMoved={async (updated) => {
            setActiveMeeting(updated);
            if (onMoveMeeting) {
              await onMoveMeeting(updated);
            } else {
              await onUpdateMeeting(updated);
            }
          }}
        />
      )}

      {/* Quick Add Task to ClickUp Modal */}
      <QuickAddTaskModal
        isOpen={quickAddTaskData.isOpen}
        onClose={() => setQuickAddTaskData({ isOpen: false, data: {} })}
        initialData={quickAddTaskData.data}
        onTaskCreated={(created) => {
          if (activeMeeting && quickAddTaskData.topicIndex !== undefined) {
            const idx = quickAddTaskData.topicIndex;
            const updatedItems = [...activeMeeting.items];
            if (updatedItems[idx]) {
              updatedItems[idx] = {
                ...updatedItems[idx],
                clickUpTaskId: created.id,
                clickUpUrl: created.url,
              };
              const updatedMeeting = { ...activeMeeting, items: updatedItems };
              setActiveMeeting(updatedMeeting);
              onUpdateMeeting(updatedMeeting);
            }
          }
        }}
        onOpenInTasks={(taskId) => {
          if (onNavigateToTasks) onNavigateToTasks(taskId);
        }}
      />

      {/* Discover & Search Topics Modal */}
      {activeMeeting && (
        <DiscoverTopicsModal
          isOpen={showDiscoverTopicsModal}
          onClose={() => setShowDiscoverTopicsModal(false)}
          missedTopics={missedTopics}
          isDiscoveringTopics={isDiscoveringTopics}
          autoDiscoverEnabled={autoDiscoverEnabled}
          onToggleAutoDiscover={() => setAutoDiscoverEnabled(!autoDiscoverEnabled)}
          topicQuery={topicQuery}
          onTopicQueryChange={setTopicQuery}
          onDiscoverTopics={handleDiscoverTopics}
          onAddTopic={handleAddDiscoveredTopic}
          onAddAllTopics={handleAddAllDiscoveredTopics}
          onDismissTopic={handleDismissDiscoveredTopic}
          transcript={activeMeeting.transcript || ""}
        />
      )}
    </div>
  );
}
