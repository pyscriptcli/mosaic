"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Stepper, Stage } from "@/components/Stepper";
import { StudioRecoveryBanner } from "@/components/StudioRecoveryBanner";
import { useStudioRecorderContext } from "@/components/StudioRecorderProvider";
import type { StudioNote, StudioDisplayMode } from "@/types/studio";
import { clearSession } from "@/lib/studioStorage";
import { 
  processSource, 
  generateMinutes, 
  saveMeeting, 
  fetchMeetings,
  deleteMeeting,
  exportWord, 
  exportPdf,
  askEcho,
  fetchClickUpTasks,
  getStoredApiKey,
  setStoredApiKey,
  getStoredOpenAiKey,
  setStoredOpenAiKey,
  getStoredOpenRouterKey,
  setStoredOpenRouterKey,
  getStoredGeminiKey,
  setStoredGeminiKey,
  getStoredClickUpToken,
  setStoredClickUpToken,
  getStoredClickUpListId,
  setStoredClickUpListId,
  discoverClickUpLists,
  AudioTelemetry
} from "@/lib/api";
import { Sidebar, NavView } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { DashboardView } from "@/components/DashboardView";
import type { ClickUpTask } from "@/components/TasksView";
import { QuickAddTaskModal } from "@/components/QuickAddTaskModal";
import { FinalizeMeetingModal } from "@/components/FinalizeMeetingModal";
import { DiscoverTopicsModal } from "@/components/DiscoverTopicsModal";
import { EmailMeetingModal } from "@/components/EmailMeetingModal";
import { LoginView } from "@/components/LoginView";
import { ArchivedMeeting } from "@/types/meeting";
import { mergeMeetings } from "@/lib/meetingsData";
import { formatEchoDate } from "@/lib/dateUtils";
import type { DiscoveredTopicItem } from "@/app/api/discover-topics/route";
import { navRouteForView, navViewForPath } from "@/lib/navRoutes";
import { clearBrowserPageCache, prefetchPageApis, useBrowserPageQuery } from "@/lib/browserPageCache";
import { 
  Upload, 
  X, 
  ChevronUp, 
  ChevronDown, 
  Plus, 
  FileText, 
  CheckSquare,
  Download, 
  Loader2, 
  Sparkles, 
  MessageSquarePlus, 
  Edit3, 
  UserCheck, 
  ChevronRight,
  Mic,
  Square,
  Key,
  Save,
  Send,
  Maximize2,
  FileCheck,
  ArrowDownCircle,
  Calendar,
  Users,
  CheckCircle,
  CheckCircle2,
  Clock,
  ListOrdered,
  RotateCcw,
  Lock,
  Search,
  Zap,
  Tag,
  MessageCircle,
  Copy,
  Check,
  ChartNoAxesColumnIncreasing
} from "lucide-react";

const PanelLoading = () => <section role="status" aria-live="polite" className="mx-auto w-full max-w-7xl border border-slate-200 bg-[#FFFCFB] p-4 text-xs text-slate-500">Opening workspace…</section>;
const StudioPanel = dynamic(() => import("@/components/StudioPanel").then((module) => module.StudioPanel), { loading: PanelLoading });
const UniversalEchoDrawer = dynamic(() => import("@/components/UniversalEchoDrawer").then((module) => module.UniversalEchoDrawer), { loading: PanelLoading });
const ProjectWorkspace = dynamic(() => import("@/components/ProjectWorkspace").then((module) => module.ProjectWorkspace), { loading: PanelLoading });
const ContractsWorkspace = dynamic(() => import("@/components/ContractsWorkspace").then((module) => module.ContractsWorkspace), { loading: PanelLoading });
const MeetingsView = dynamic(() => import("@/components/MeetingsView").then((module) => module.MeetingsView), { loading: PanelLoading });
const TasksPageView = dynamic(() => import("@/components/TasksPageView"), { loading: PanelLoading });
const MarketInsightsView = dynamic(() => import("@/components/MarketInsightsView").then((module) => module.MarketInsightsView), { loading: PanelLoading });
const DemandsView = dynamic(() => import("@/components/DemandsView").then((module) => module.DemandsView), { loading: PanelLoading });
const BusinessAnalysisView = dynamic(() => import("@/components/business-analysis/BusinessAnalysisView").then((module) => module.BusinessAnalysisView), { loading: PanelLoading });
const FormsPortal = dynamic(() => import("@/components/forms/FormsPortal"), { loading: PanelLoading });

const VENUE_OPTIONS = [
  "GreatWork Mega Tower 32F - Secret Room",
  "GreatWork Mega Tower 32F - Small Meeting Room",
  "GreatWork Mega Tower 24F - Meeting Room",
  "GreatWork Mega Tower 32F - Board Room",
  "GreatWork Mega Tower 32F - Co-working",
  "Online Meeting",
  "Other / Custom..."
];

type SignedInUser = { id: number | string; username: string; email: string; color?: string; profilePicture?: string | null; initials?: string };
type GovernanceSnapshot = { allowedPages: NavView[]; sidebarOrder: NavView[]; isAdmin: boolean; askEchoEnabled: boolean; allowedFeatures: string[] };
let activeBrowserUser: SignedInUser | null = null;
const governanceByUser = new Map<string, GovernanceSnapshot>();

function formatMeetingDate(value?: string) {
  if (!value) return "Automatic";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatMeetingTime(value?: string) {
  if (!value) return "On start";
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

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
        className="w-full border-b border-gray-300 py-1.5 pr-8 text-xs font-semibold text-gray-700 bg-transparent focus:outline-none focus:border-[#003366] transition-colors" 
        value={value} 
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} 
      />
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={handleIconClick}
          className="text-gray-400 hover:text-[#003366] p-1 transition-colors"
          title="Open calendar date picker"
        >
          <Calendar size={15} />
        </button>
        <input 
          ref={dateInputRef}
          type="date" 
          tabIndex={-1}
          aria-hidden="true"
          className="absolute right-0 top-0 w-4 h-4 opacity-0 pointer-events-none"
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value);
            }
          }} 
        />
      </div>
    </div>
  );
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  // ClickUp OAuth Authentication State
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">(activeBrowserUser ? "authenticated" : "loading");
  const [authUser, setAuthUser] = useState<SignedInUser | null>(activeBrowserUser);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          const nextUser = data.user as SignedInUser;
          if (activeBrowserUser && String(activeBrowserUser.id) !== String(nextUser.id)) {
            void clearBrowserPageCache(String(activeBrowserUser.id));
            governanceByUser.delete(String(activeBrowserUser.id));
          }
          activeBrowserUser = nextUser;
          setAuthUser(data.user);
          setAuthStatus("authenticated");
          return;
        }
      }
    } catch (err) {
      console.error("[Auth] Check failed:", err);
    }
    if (activeBrowserUser) {
      void clearBrowserPageCache(String(activeBrowserUser.id));
      governanceByUser.delete(String(activeBrowserUser.id));
    }
    activeBrowserUser = null;
    setAuthUser(null);
    setAuthStatus("unauthenticated");
  };

  useEffect(() => {
    if (!activeBrowserUser) void checkAuth();
  }, []);

  useEffect(() => {
    if (authStatus !== "unauthenticated") return;
    const desktop = (window as Window & { mosaicDesktop?: { scheduleReminder: (input: { enabled: boolean; intervalSeconds: number; taskNames: string[] }) => void } }).mosaicDesktop;
    desktop?.scheduleReminder({ enabled: false, intervalSeconds: 1, taskNames: [] });
  }, [authStatus]);

  const studioRecorder = useStudioRecorderContext();

  const handleSignOut = async () => {
    if (studioRecorder.status === "recording" || studioRecorder.status === "paused") {
      studioRecorder.stop();
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("[Auth] Logout failed:", err);
    }
    if (activeBrowserUser) {
      void clearBrowserPageCache(String(activeBrowserUser.id));
      governanceByUser.delete(String(activeBrowserUser.id));
    }
    activeBrowserUser = null;
    setAuthUser(null);
    setAuthStatus("unauthenticated");
    window.location.href = "/";
  };

  const [stage, setStage] = useState<Stage>("Input");
  const notetakerRef = useRef<HTMLDivElement>(null);
  const [isNotetakerFullscreen, setIsNotetakerFullscreen] = useState(false);
  const [missedTopics, setMissedTopics] = useState<DiscoveredTopicItem[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [isDiscoveringTopics, setIsDiscoveringTopics] = useState(false);
  const [autoDiscoverEnabled, setAutoDiscoverEnabled] = useState(true);
  const [hasAutoDiscovered, setHasAutoDiscovered] = useState(false);
  const [reviewTab, setReviewTab] = useState<"discussion" | "notes" | "transcript">("discussion");
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<StudioDisplayMode>("panel");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDiscoverTopicsModal, setShowDiscoverTopicsModal] = useState(false);
  const [finalizeAction, setFinalizeAction] = useState<"export" | "archive" | "all">("export");
  const [archiveSpaceId, setArchiveSpaceId] = useState("");
  const [archiveSpaces, setArchiveSpaces] = useState<Array<{ id: string; name: string; teamName: string }>>([]);
  const [loadingArchiveSpaces, setLoadingArchiveSpaces] = useState(false);
  const [audioTelemetry, setAudioTelemetry] = useState<AudioTelemetry | null>(null);

  const openFinalizeModal = (action: "export" | "archive" | "all" = "export") => {
    setFinalizeAction(action);
    setShowFinalizeModal(true);
    if (archiveSpaces.length === 0 && !loadingArchiveSpaces) {
      setLoadingArchiveSpaces(true);
      discoverClickUpLists()
        .then((data) => {
          const spaces = data.spaces || [];
          setArchiveSpaces(spaces);
          if (spaces.length > 0 && !archiveSpaceId) {
            setArchiveSpaceId(spaces[0].id);
          }
        })
        .catch(() => setArchiveSpaces([]))
        .finally(() => setLoadingArchiveSpaces(false));
    }
  };

  useEffect(() => {
    if (!isLoading) { setLoadingProgress(0); return; }
    setLoadingProgress(12);
    const timer = window.setInterval(() => setLoadingProgress((value) => Math.min(value + 8, 92)), 700);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!showArchiveModal) return;
    setLoadingArchiveSpaces(true);
    discoverClickUpLists().then((data) => setArchiveSpaces(data.spaces || [])).catch(() => setArchiveSpaces([])).finally(() => setLoadingArchiveSpaces(false));
  }, [showArchiveModal]);

  // System Key state
  const [apiKey, setApiKey] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [clickupTokenInput, setClickupTokenInput] = useState("");
  const [clickupListIdInput, setClickupListIdInput] = useState("");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

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

  useEffect(() => {
    const key = getStoredApiKey();
    if (key) {
      setApiKey(key);
      setKeyInput(key);
    }
    setOpenaiKeyInput(getStoredOpenAiKey());
    setOpenrouterKeyInput(getStoredOpenRouterKey());
    setGeminiKeyInput(getStoredGeminiKey());
    setClickupTokenInput(getStoredClickUpToken());
    setClickupListIdInput(getStoredClickUpListId());
  }, []);

  const saveKey = () => {
    setStoredApiKey(keyInput.trim());
    setApiKey(keyInput.trim());
    setStoredOpenAiKey(openaiKeyInput.trim());
    setStoredOpenRouterKey(openrouterKeyInput.trim());
    setStoredGeminiKey(geminiKeyInput.trim());
    setStoredClickUpToken(clickupTokenInput.trim());
    setStoredClickUpListId(clickupListIdInput.trim());
    setShowKeyModal(false);
  };

  // Unified Meeting Source state
  // Live recording is the primary meeting path. Upload remains available as a secondary path.
  const [sourceTab, setSourceTab] = useState<"source" | "record">("record");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [additionalMeetingNotes, setAdditionalMeetingNotes] = useState("");
  const [recordedDurationSeconds, setRecordedDurationSeconds] = useState<number | null>(null);

  // Navigation Shell & View State
  const [currentView, setCurrentView] = useState<NavView>(() => navViewForPath(pathname || "") || "dashboard");

  useEffect(() => {
    const handleFullscreenChange = () => setIsNotetakerFullscreen(document.fullscreenElement === notetakerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleNotetakerFullscreen = async () => {
    if (!notetakerRef.current) return;
    if (document.fullscreenElement === notetakerRef.current) await document.exitFullscreen();
    else await notetakerRef.current.requestFullscreen();
  };
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isUniversalEchoOpen, setIsUniversalEchoOpen] = useState(false);
  const [archivedMeetings, setArchivedMeetings] = useState<ArchivedMeeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Page Access Governance state
  const warmGovernance = authUser ? governanceByUser.get(String(authUser.id)) : undefined;
  const [allowedPages, setAllowedPages] = useState<NavView[]>(warmGovernance?.allowedPages || []);
  const [governanceStatus, setGovernanceStatus] = useState<"loading" | "ready" | "error">(warmGovernance ? "ready" : "loading");
  const [sidebarOrder, setSidebarOrder] = useState<NavView[]>([
    "dashboard", "business-analysis", "project", "notebook", "reports", "market-insights", "demands", "meetings", "minutes", "forms", "delta",
  ]);
  const [isAdminUser, setIsAdminUser] = useState(warmGovernance?.isAdmin || false);
  const [askEchoEnabled, setAskEchoEnabled] = useState(warmGovernance?.askEchoEnabled || false);
  const [allowedFeatures, setAllowedFeatures] = useState<string[]>(warmGovernance?.allowedFeatures || []);

  const canReadMeetings = isAdminUser || authUser?.email?.toLowerCase().trim() === "admin@primephilippines.com" || allowedPages.includes("meetings") || allowedPages.includes("dashboard");
  const meetingsQuery = useBrowserPageQuery<{ meetings: ArchivedMeeting[] }>(
    authUser?.id ? String(authUser.id) : undefined,
    "meetings:all",
    async () => {
      const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || undefined : undefined;
      const result = await fetchMeetings(undefined, personalListId);
      return { meetings: Array.isArray(result.meetings) ? result.meetings : [] };
    },
    governanceStatus === "ready" && canReadMeetings && (currentView === "dashboard" || currentView === "meetings" || currentView === "minutes"),
  );

  useEffect(() => {
    const nextMeetings = meetingsQuery.data?.meetings;
    if (!nextMeetings) return;
    setArchivedMeetings(nextMeetings);
    if (nextMeetings.length > 0) setSelectedMeetingId((current) => current || nextMeetings[0].id);
  }, [meetingsQuery.data]);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/") {
      const legacyView = new URLSearchParams(window.location.search).get("view");
      const legacyRoute = legacyView && navRouteForView(legacyView as NavView);
      if (legacyRoute) {
        setCurrentView(legacyView as NavView);
        const target = new URL(window.location.href);
        target.pathname = legacyRoute;
        target.searchParams.delete("view");
        router.replace(`${target.pathname}${target.search}${target.hash}`);
      } else {
        setCurrentView("dashboard");
      }
      return;
    }
    const routeView = navViewForPath(pathname);
    if (routeView) setCurrentView(routeView);
  }, [pathname, router]);

  // Fetch page governance and role access
  useEffect(() => {
    let active = true;
    const refreshGovernance = async () => {
      const cached = authUser ? governanceByUser.get(String(authUser.id)) : undefined;
      if (!cached) setGovernanceStatus("loading");
      try {
        const response = await fetch("/api/forms/config", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401 && authUser) {
            void clearBrowserPageCache(String(authUser.id));
            governanceByUser.delete(String(authUser.id));
            activeBrowserUser = null;
            setAuthUser(null);
            setAuthStatus("unauthenticated");
          }
          throw new Error("Page access could not be loaded.");
        }
        const data = await response.json();
        if (!Array.isArray(data.allowedPages)) throw new Error("Page access data is incomplete.");
        if (!active) return;

        const pages = data.allowedPages as NavView[];
        const isOwner = authUser?.email?.toLowerCase().trim() === "admin@primephilippines.com";
        const hasFullPageAccess = Boolean(data.isAdmin) || isOwner;
        const nextSnapshot: GovernanceSnapshot = {
          allowedPages: pages,
          sidebarOrder: Array.isArray(data.config?.sidebarOrder) && data.config.sidebarOrder.length > 0 ? data.config.sidebarOrder as NavView[] : [],
          isAdmin: Boolean(data.isAdmin),
          askEchoEnabled: data.config?.features?.askEchoEnabled === true,
          allowedFeatures: Array.isArray(data.allowedFeatures) ? data.allowedFeatures : [],
        };
        if (cached && (JSON.stringify(cached.allowedPages) !== JSON.stringify(nextSnapshot.allowedPages) || cached.isAdmin !== nextSnapshot.isAdmin)) {
          void clearBrowserPageCache(String(authUser?.id));
        }
        if (authUser) governanceByUser.set(String(authUser.id), nextSnapshot);
        setIsAdminUser(Boolean(data.isAdmin));
        setAskEchoEnabled(data.config?.features?.askEchoEnabled === true);
        setAllowedFeatures(Array.isArray(data.allowedFeatures) ? data.allowedFeatures : []);
        setAllowedPages(pages);
        setCurrentView((prev) => {
          if (prev === "forms-admin" || hasFullPageAccess) return prev;
          if (prev === "project" && pages.includes("tasks")) return prev;
          if (prev === "delta" && (pages.includes("project") || pages.includes("tasks"))) return prev;
          if (!pages.includes(prev)) return pages[0] || "forms";
          return prev;
        });
        if (nextSnapshot.sidebarOrder.length > 0) setSidebarOrder(nextSnapshot.sidebarOrder);
        setGovernanceStatus("ready");
      } catch {
        if (!active) return;
        if (!cached) setGovernanceStatus("error");
      }
    };

    refreshGovernance();
    window.addEventListener("echo-config-updated", refreshGovernance);
    return () => {
      active = false;
      window.removeEventListener("echo-config-updated", refreshGovernance);
    };
  }, [authUser]);

  const isPageAllowed = (view: NavView) => {
    if (view === "forms-admin") return false;
    if (isAdminUser || authUser?.email?.toLowerCase().trim() === "admin@primephilippines.com") return true;
    if (view === "project") return allowedPages.includes("project") || allowedPages.includes("tasks");
    if (view === "delta") return allowedPages.includes("delta") || allowedPages.includes("project") || allowedPages.includes("tasks");
    if (view === "notebook") return allowedPages.includes("notebook") || allowedPages.includes("tasks");
    return allowedPages.includes(view);
  };

  useEffect(() => {
    if (governanceStatus !== "ready" || !pathname) return;
    const routeView = navViewForPath(pathname);
    if (!routeView || isPageAllowed(routeView)) return;
    const fallbackView = allowedPages.find((page) => navRouteForView(page)) || "forms";
    router.replace(navRouteForView(fallbackView) || "/forms");
  }, [allowedPages, authUser, governanceStatus, isAdminUser, pathname, router]);

  const handleSelectView = (view: NavView) => {
    if (view === "forms-admin") {
      if (isAdminUser || authUser?.email?.toLowerCase() === "admin@primephilippines.com") {
        setCurrentView("forms-admin");
      }
      return;
    }
    if (isPageAllowed(view)) {
      if (authUser) prefetchPageApis(String(authUser.id), view);
      setCurrentView(view);
      const route = navRouteForView(view);
      if (route && route !== pathname) router.push(route);
    }
  };

  // Ensure scroll position resets to top when entering or switching notetaker views
  useEffect(() => {
    if (currentView === "minutes") {
      const mainEl = document.querySelector("main");
      if (mainEl) mainEl.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }, [currentView, stage, sourceTab]);

  // Universal Search Tasks State
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);

  const searchTasksLoaded = useRef(false);
  const loadUniversalSearchTasks = async () => {
    if (searchTasksLoaded.current || authStatus !== "authenticated" || !isPageAllowed("tasks")) return;
    searchTasksLoaded.current = true;
    try {
      const data = await fetchClickUpTasks();
      if (Array.isArray(data.tasks)) setTasks(data.tasks);
    } catch (error) {
      searchTasksLoaded.current = false;
      console.warn("Universal search tasks could not be loaded:", error);
    }
  };

  // App Meeting Data
  const [transcript, setTranscript] = useState("");
  const [metadata, setMetadata] = useState<any>({
    date: new Date().toISOString().split("T")[0],
    start_time: new Date().toTimeString().slice(0, 5),
    end_time: "",
    meeting_type: "Internal",
    location: "GreatWork Mega Tower 32F - Secret Room",
    custom_location: "",
    client_name: "",
    prepared_by: "Dave Policarpio",
    prep_designation: "Executive Member",
    workspace: "",
    department: "",
    space_id: "",
    confirmed_by: "Client Rep or Lead",
    conf_designation: "Designation / Title"
  });

  // PRIME Team Attendees (Tag Chips)
  const [primeAttendees, setPrimeAttendees] = useState<string[]>([]);
  const [newPrimeAttendee, setNewPrimeAttendee] = useState("");

  // External Attendees (Tag Chips)
  const [externalAttendees, setExternalAttendees] = useState<string[]>([]);
  const [newExternalAttendee, setNewExternalAttendee] = useState("");

  // Review state
  const [momItems, setMomItems] = useState<any[]>([]);
  const [otherDiscussions, setOtherDiscussions] = useState("");
  const [showReviewAssist, setShowReviewAssist] = useState(true);

  // Handle Drag and Drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      handleUnifiedSourceSubmission(file);
    }
  };

  // PRIME Attendees chip handlers
  const addPrimeAttendee = () => {
    if (newPrimeAttendee.trim() && !primeAttendees.includes(newPrimeAttendee.trim())) {
      setPrimeAttendees([...primeAttendees, newPrimeAttendee.trim()]);
      setNewPrimeAttendee("");
    }
  };

  const removePrimeAttendee = (name: string) => {
    setPrimeAttendees(primeAttendees.filter((a) => a !== name));
  };

  // External Attendees chip handlers
  const addExternalAttendee = () => {
    if (newExternalAttendee.trim() && !externalAttendees.includes(newExternalAttendee.trim())) {
      setExternalAttendees([...externalAttendees, newExternalAttendee.trim()]);
      setNewExternalAttendee("");
    }
  };

  const removeExternalAttendee = (name: string) => {
    setExternalAttendees(externalAttendees.filter((a) => a !== name));
  };

  // Compute effective metadata including custom location and attendees lists
  const getEffectiveMetadata = () => {
    const effectiveLocation = metadata.location === "Other / Custom..."
      ? (metadata.custom_location?.trim() || "Custom Venue")
      : metadata.location;

    return {
      ...metadata,
      location: effectiveLocation,
      prime_attendees: primeAttendees.join(", "),
      external_attendees: externalAttendees.join(", ")
    };
  };

  const handleRecordingStart = (startTime: string) => {
    setMetadata((prev: any) => ({ ...prev, start_time: startTime, end_time: "" }));
  };

  const handleRecordingStop = (endTime: string) => {
    setMetadata((prev: any) => ({ ...prev, end_time: endTime }));
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // File Selection (Auto-processed immediately upon selection)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      handleUnifiedSourceSubmission(file);
    }
  };

  // Unified submission: handles files (audio, pdf, docx, txt) OR direct pasted text
  const handleUnifiedSourceSubmission = async (fileOverride?: File, preparedTranscript?: string, notesOverride?: string) => {
    const fileToUse = fileOverride || selectedFile;
    const hasFile = !!fileToUse;
    const hasText = pastedText.trim().length > 0;
    const notesToUse = notesOverride !== undefined ? notesOverride : additionalMeetingNotes;

    if (!hasFile && !hasText) {
      alert("Please upload a file (audio, document, PDF, text) or paste meeting text.");
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStudioOpen(false);
    setIsLoading(true);
    setLoadingText("Analyzing source content...");

    try {
      const res = await processSource(
        preparedTranscript
          ? { text: preparedTranscript }
          : { file: fileToUse, text: !fileToUse && hasText ? pastedText : undefined },
        (status) => setLoadingText(status),
        abortController.signal
      );

      const rawTranscript = preparedTranscript || res.transcript || "";
      const fullTranscript = notesToUse && notesToUse.trim()
        ? `=== MEETING NOTES ===\n${notesToUse.trim()}\n\n=== TRANSCRIPT ===\n${rawTranscript}`
        : rawTranscript;

      setTranscript(fullTranscript);
      if (res.telemetry) {
        setAudioTelemetry(res.telemetry);
        if (res.telemetry.originalDurationSec > 0) {
          setRecordedDurationSeconds(Math.round(res.telemetry.originalDurationSec));
        }
      }
      if (res.metadata) {
        setMetadata((prev: any) => ({
          ...prev,
          ...res.metadata,
          location: res.metadata.location && VENUE_OPTIONS.includes(res.metadata.location) 
            ? res.metadata.location 
            : prev.location
        }));
        // Attendees are always entered manually by the user. Do not infer or
        // auto-populate internal/external attendees from transcript metadata.
      }

      // Automatically synthesize minutes draft
      setLoadingText("Synthesizing structured Minutes of the Meeting...");
      const topics = "1. Project Updates\n2. Key Decisions\n3. Action Items";
      const momRes = await generateMinutes(
        rawTranscript || pastedText,
        topics,
        notesToUse
      );

      if (!metadata.end_time) setMetadata((current: any) => ({ ...current, end_time: new Date().toTimeString().slice(0, 5) }));

      setMomItems(
        (momRes.matched_items || []).map((item: any, idx: number) => ({
          id: item.id || `dp_${Date.now()}_${idx}`,
          ...item,
        }))
      );
      setMissedTopics(
        Array.isArray(momRes.recommended_missed_points)
          ? momRes.recommended_missed_points.map((item: any) => ({
              topic_title: String(item.topic_title || item.topic || "Untitled Topic").trim(),
              discussion_point: String(item.discussion_point || "Review and refine discussion details from meeting transcript.").trim(),
              evidence_quote: String(item.evidence_quote || item.quote || "").trim(),
              action_plan: String(item.action_plan || "None").trim(),
              indicative_delivery_date: String(item.indicative_delivery_date || item.target_date || "TBD").trim(),
              person_in_charge: String(item.person_in_charge || item.pic || "Unassigned").trim(),
              confidence: item.confidence || "High",
            }))
          : []
      );
      setHasAutoDiscovered(false);
      setOtherDiscussions(momRes.other_discussions || "");
      setStage("Review");
    } catch (err: any) {
      if (err?.name === "AbortError" || abortController.signal.aborted) {
        console.log("Audio processing aborted by user");
        return;
      }
      alert(`Source processing notice:\n\n${err.message}`);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendToNotetaker = (file: File, notes: StudioNote[], preparedTranscript?: string) => {
    setSelectedFile(file);
    if (studioRecorder.elapsedSeconds > 0) {
      setRecordedDurationSeconds(studioRecorder.elapsedSeconds);
    }
    const currentSessionId = studioRecorder.sessionId;
    if (currentSessionId) {
      clearSession(currentSessionId).catch(() => {});
    }
    const notesText = notes && notes.length > 0
      ? notes.map((n) => `${n.timestamp} ${n.text}`).join("\n")
      : "";
    if (notesText) {
      setAdditionalMeetingNotes(notesText);
    }
    setCurrentView("minutes");
    setStage("Input");
    setIsStudioOpen(false);
    setStudioMode("panel");
    handleUnifiedSourceSubmission(file, preparedTranscript, notesText);
  };

  const handleGenerateMinutes = async () => {
    const content = transcript || pastedText;
    if (!content) {
      alert("Please provide meeting audio, a document, or text first.");
      return;
    }
    setIsLoading(true);
    setLoadingText("Synthesizing structured minutes...");
    try {
      const topics = "1. Project Updates\n2. Next Steps";
      const res = await generateMinutes(content, topics, additionalMeetingNotes);
      if (!metadata.end_time) setMetadata((current: any) => ({ ...current, end_time: new Date().toTimeString().slice(0, 5) }));
      setMomItems(
        (res.matched_items || []).map((item: any, idx: number) => ({
          id: item.id || `dp_${Date.now()}_${idx}`,
          ...item,
        }))
      );
      setOtherDiscussions(res.other_discussions || "");
      setStage("Review");
    } catch (err: any) {
      alert(`Synthesis notice:\n\n${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Review table operations
  const addRow = () => {
    setMomItems([
      ...momItems,
      {
        id: `dp_${Date.now()}_${momItems.length}`,
        topic_title: "",
        discussion_point: "",
        evidence_quote: "",
        action_plan: "None",
        indicative_delivery_date: new Date().toISOString().split("T")[0],
        person_in_charge: "Unassigned"
      }
    ]);
  };

  const removeRow = (index: number) => {
    setMomItems(momItems.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, dir: number) => {
    if (index + dir < 0 || index + dir >= momItems.length) return;
    const newItems = [...momItems];
    const temp = newItems[index];
    newItems[index] = newItems[index + dir];
    newItems[index + dir] = temp;
    setMomItems(newItems);
  };

  const addMissedTopic = (index: number = 0) => {
    const suggestion = missedTopics[index];
    if (!suggestion) return;
    setMomItems([
      ...momItems,
      {
        id: `dp_${Date.now()}_${momItems.length}`,
        topic_title: suggestion.topic_title,
        discussion_point: suggestion.discussion_point || "Review and complete the discussion details.",
        evidence_quote: suggestion.evidence_quote || "",
        action_plan: suggestion.action_plan || "None",
        indicative_delivery_date: suggestion.indicative_delivery_date || "TBD",
        person_in_charge: suggestion.person_in_charge || "Unassigned"
      }
    ]);
    setMissedTopics((topics) => topics.filter((_, i) => i !== index));
  };

  const addAllMissedTopics = () => {
    if (!missedTopics.length) return;
    const newItems = missedTopics.map((suggestion, idx) => ({
      id: `dp_${Date.now()}_${momItems.length + idx}`,
      topic_title: suggestion.topic_title,
      discussion_point: suggestion.discussion_point || "Review and complete the discussion details.",
      evidence_quote: suggestion.evidence_quote || "",
      action_plan: suggestion.action_plan || "None",
      indicative_delivery_date: suggestion.indicative_delivery_date || "TBD",
      person_in_charge: suggestion.person_in_charge || "Unassigned"
    }));
    setMomItems([...momItems, ...newItems]);
    setMissedTopics([]);
  };

  const dismissMissedTopic = (index: number) => {
    setMissedTopics((topics) => topics.filter((_, i) => i !== index));
  };

  const discoverTopics = async (queryOverride?: string) => {
    if (!transcript || isDiscoveringTopics) return;
    setIsDiscoveringTopics(true);
    const activeQuery = queryOverride !== undefined ? queryOverride : topicQuery;
    try {
      const response = await fetch("/api/discover-topics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getStoredApiKey() || ""
        },
        body: JSON.stringify({
          transcript,
          query: activeQuery,
          existingTopics: momItems.map((item) => item.topic_title)
        })
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

  // Auto-discover uncaptured topics upon entering Review stage if enabled
  useEffect(() => {
    if (stage === "Review" && autoDiscoverEnabled && !hasAutoDiscovered && transcript?.trim() && !isDiscoveringTopics) {
      if (missedTopics.length === 0) {
        setHasAutoDiscovered(true);
        discoverTopics("");
      }
    }
  }, [stage, autoDiscoverEnabled, hasAutoDiscovered, transcript, missedTopics.length, isDiscoveringTopics]);

  // Export handlers with effective metadata
  const handleExportWord = async () => {
    const effectiveMeta = getEffectiveMetadata();
    if (!effectiveMeta.client_name?.trim()) {
      openFinalizeModal("export");
      return;
    }
    setIsLoading(true);
    setLoadingText("Generating Word Document (.docx)...");
    try {
      await exportWord(effectiveMeta, momItems, otherDiscussions);
      setShowFinalizeModal(false);
      setShowExportModal(false);
    } catch (err: any) {
      alert("Failed to export Word document.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPdf = async () => {
    const effectiveMeta = getEffectiveMetadata();
    if (!effectiveMeta.client_name?.trim()) {
      openFinalizeModal("export");
      return;
    }
    setIsLoading(true);
    setLoadingText("Generating PDF (.pdf)...");
    try {
      await exportPdf(effectiveMeta, momItems, otherDiscussions);
      setShowFinalizeModal(false);
      setShowExportModal(false);
    } catch (err: any) {
      alert("Failed to export PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  const activeMediaFile = selectedFile || studioRecorder.recordedFile;

  const handleExportRecording = () => {
    if (!activeMediaFile) return;
    const url = URL.createObjectURL(activeMediaFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeMediaFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveToDb = async (overrideSpaceId?: string, options?: { listId?: string; isConfidential?: boolean }) => {
    const effectiveMeta = getEffectiveMetadata();
    if (!effectiveMeta.client_name?.trim()) {
      openFinalizeModal("archive");
      return;
    }
    const isConfidential = Boolean(options?.isConfidential);
    const targetListId = options?.listId;
    const spaceToUse = overrideSpaceId || metadata.space_id || archiveSpaceId;
    if (!isConfidential && !spaceToUse) { 
      openFinalizeModal("archive"); 
      return; 
    }
    setIsLoading(true);
    setLoadingText(isConfidential ? "Saving meeting to Private list in ClickUp..." : "Saving meeting to ClickUp...");
    try {
      const effectiveMeta = getEffectiveMetadata();
      const calcDurationSeconds = recordedDurationSeconds || (audioTelemetry?.originalDurationSec ? Math.round(audioTelemetry.originalDurationSec) : undefined);
      let fallbackMinutes: number | undefined;
      if (effectiveMeta.start_time && effectiveMeta.end_time) {
        const [sh, sm] = effectiveMeta.start_time.split(":").map(Number);
        const [eh, em] = effectiveMeta.end_time.split(":").map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff > 0) fallbackMinutes = diff;
        }
      }
      const finalDurationMinutes = calcDurationSeconds ? Math.max(1, Math.round(calcDurationSeconds / 60)) : fallbackMinutes;
      const finalDurationSeconds = calcDurationSeconds || (finalDurationMinutes ? finalDurationMinutes * 60 : undefined);

      const recType = (selectedFile?.type.startsWith("video/") || studioRecorder.mediaType === "video") ? "video" : "audio";
      const recFormat = selectedFile ? selectedFile.name.split(".").pop() : (studioRecorder.mediaType === "video" ? "webm" : "mp3");

      const payloadMeta = {
        ...effectiveMeta,
        recording_type: recType,
        recording_format: recFormat,
        ...(finalDurationMinutes ? { duration_minutes: finalDurationMinutes } : {}),
        ...(finalDurationSeconds ? { duration_seconds: finalDurationSeconds } : {}),
        ...(spaceToUse ? { space_id: spaceToUse } : {}),
        ...(targetListId ? { list_id: targetListId } : {}),
        is_confidential: isConfidential,
      };
      const res = await saveMeeting(payloadMeta, momItems, otherDiscussions, transcript, additionalMeetingNotes);
      const newMeetingId = res.meeting_id || `MOM-${Date.now()}`;
      const newRecord: ArchivedMeeting = {
        id: newMeetingId,
        meeting_id: newMeetingId,
        title: effectiveMeta.client_name || "Executive Meeting",
        date: effectiveMeta.date || new Date().toISOString().split("T")[0],
        recording_type: recType,
        recording_format: recFormat,
        meeting_type: (effectiveMeta.meeting_type as any) || "Internal",
        duration_minutes: finalDurationMinutes,
        duration_seconds: finalDurationSeconds,
        location: effectiveMeta.location || "",
        attendees_prime: primeAttendees,
        attendees_external: externalAttendees,
        summary: otherDiscussions,
        meeting_notes: additionalMeetingNotes,
        items: momItems.map((item, idx) => ({
          id: item.id || `item-${idx}`,
          topic: item.topic_title || `Topic ${idx + 1}`,
          evidence: item.evidence_quote || "",
          discussion_point: item.discussion_point || "",
          action_plan: item.action_plan || "",
          target_date: item.indicative_delivery_date || "",
          person_in_charge: item.person_in_charge || "Unassigned"
        })),
        transcript: transcript,
        created_at: new Date().toISOString(),
        clickup_space_id: res.clickup?.spaceId,
        clickup_space_name: res.clickup?.spaceName,
        clickup_list_id: res.clickup?.listId,
        clickup_list_name: res.clickup?.listName,
        clickup_task_url: res.clickup?.taskUrl || (res.clickup?.taskId ? `https://app.clickup.com/t/${res.clickup.taskId}` : undefined),
        archive_status: res.clickup?.archiveStatus,
        is_confidential: isConfidential,
      };
      setArchivedMeetings((prev) => [newRecord, ...prev.filter((m) => m.id !== newMeetingId)]);
      setSelectedMeetingId(newMeetingId);
      const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || undefined : undefined;
      fetchMeetings(undefined, personalListId).then((data) => {
        if (data.meetings && Array.isArray(data.meetings)) {
          setArchivedMeetings(data.meetings);
        }
      }).catch(() => {});
      const target = res.clickup ? `\nWorkspace: ${res.clickup.workspace}\nDepartment: ${res.clickup.department}\nList: ${res.clickup.listName}\nTask: ${res.clickup.taskUrl || res.clickup.taskId}` : "";
      if (!options) {
        setShowFinalizeModal(false);
        setShowArchiveModal(false); 
        alert((res.message || "Successfully saved meeting to ClickUp!") + target);
      }
      return res;
    } catch (err: any) {
      alert(err?.message || "Unable to save meeting to ClickUp.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Stage accessibility conditions
  const isReviewAllowed = !!transcript || pastedText.trim().length > 0 || momItems.length > 0;
  // Counts for the Review summary statistics
  const actionItemsCount = momItems.filter((i) => i.action_plan && i.action_plan !== "None").length;
  const assignedCount = momItems.filter((i) => i.person_in_charge && i.person_in_charge !== "Unassigned").length;

  // ClickUp Session Loading Gate
  if (authStatus === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FAF9F7]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-serif italic text-3xl font-semibold tracking-wide text-[#1b1d1e]">
              Mosaic
            </span>
            <span className="w-2 h-2 bg-[#C9AB4C]"></span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#003366]">
            <Loader2 className="w-4 h-4 animate-spin text-[#C9AB4C]" />
            <span>Verifying ClickUp Session...</span>
          </div>
        </div>
      </div>
    );
  }

  // ClickUp Authentication Gate
  if (authStatus === "unauthenticated") {
    return <LoginView onLoginSuccess={() => checkAuth()} />;
  }

  const loadingSteps = ["Getting your recording ready", "Transcribing the audio", "Finding the key details", "Preparing your meeting notes"];
  const loadingStepIndex = loadingText.toLowerCase().includes("synth") || loadingText.toLowerCase().includes("minutes") ? 3 : loadingText.toLowerCase().includes("metadata") || loadingText.toLowerCase().includes("details") ? 2 : loadingText.toLowerCase().includes("transcrib") ? 1 : 0;
  const isMeetingWorkspace = currentView === "minutes" && stage === "Input" && sourceTab === "record";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary font-sans text-[#1b1d1e]">
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-[#FFFCFB]/85 z-50 flex flex-col items-center justify-center backdrop-blur-xs">
          <div className="w-full max-w-sm px-6 py-7 bg-[#FFFCFB] border border-[#C9A84C]/50 shadow-lg">
            <div className="flex items-center gap-3 mb-6"><div className="w-9 h-9 rounded-full border-2 border-[#003366] border-t-transparent animate-spin" /><div><p className="text-base font-semibold text-[#003366]">Working on your meeting</p><p className="text-xs text-gray-500 mt-0.5">{loadingSteps[loadingStepIndex]}</p></div></div>
            <div className="space-y-3">{loadingSteps.map((step, index) => <div key={step} className="flex items-center gap-3 text-sm"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${index < loadingStepIndex ? "bg-green-600 text-white" : index === loadingStepIndex ? "bg-[#003366] text-white" : "border border-gray-300 text-gray-400"}`}>{index < loadingStepIndex ? "✓" : index + 1}</span><span className={index <= loadingStepIndex ? "text-[#003366]" : "text-gray-400"}>{step}</span></div>)}</div>
          </div>
          <button
            type="button"
            onClick={handleCancelProcessing}
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-all rounded-none cursor-pointer"
          >
            Cancel Processing
          </button>
        </div>
      )}

      {/* Unified Finalize & Export Modal */}
      <FinalizeMeetingModal
        isOpen={showFinalizeModal}
        onClose={() => setShowFinalizeModal(false)}
        metadata={metadata}
        onUpdateMetadata={setMetadata}
        primeAttendees={primeAttendees}
        onUpdatePrimeAttendees={setPrimeAttendees}
        externalAttendees={externalAttendees}
        onUpdateExternalAttendees={setExternalAttendees}
        onExportWord={handleExportWord}
        onExportPdf={handleExportPdf}
        onEmailPdf={() => setShowEmailModal(true)}
        onExportRecording={activeMediaFile ? handleExportRecording : undefined}
        recordingName={activeMediaFile ? activeMediaFile.name : null}
        onArchiveClickUp={(spaceId, options) => handleSaveToDb(spaceId, options)}
        archiveSpaces={archiveSpaces}
        loadingArchiveSpaces={loadingArchiveSpaces}
        selectedSpaceId={archiveSpaceId}
        onSelectSpaceId={setArchiveSpaceId}
        isProcessing={isLoading}
        processingText={loadingText}
        initialAction={finalizeAction}
        canExport={allowedFeatures.includes("meetings-export")}
      />

      <EmailMeetingModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        fromEmail={authUser?.email}
        meeting={{
          title: getEffectiveMetadata().client_name,
          date: getEffectiveMetadata().date,
          metadata: getEffectiveMetadata(),
          items: momItems,
          summary: otherDiscussions,
        }}
      />



      {/* Collapsible Sidebar (Deep Charcoal & Gold, Expanded by default) */}
      <Sidebar
        currentView={currentView}
        onSelectView={(view) => handleSelectView(view)}
        onPreloadView={(view) => { if (authUser && isPageAllowed(view)) prefetchPageApis(String(authUser.id), view); }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        user={authUser}
        onSignOut={handleSignOut}
        allowedPages={allowedPages}
        sidebarOrder={sidebarOrder}
        isAdmin={isAdminUser}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Persistent Slim Topbar */}
        <Topbar
          meetings={archivedMeetings}
          tasks={tasks}
          userId={authUser?.id ? String(authUser.id) : undefined}
          onOpenSearch={() => { void loadUniversalSearchTasks(); }}
          onOpenUniversalEcho={() => setIsUniversalEchoOpen(true)}
          onSelectMeeting={(meetingId) => {
            if (isPageAllowed("meetings")) {
              setSelectedMeetingId(meetingId);
              setCurrentView("meetings");
            }
          }}
          onSelectTask={(taskId) => {
            if (isPageAllowed("tasks")) {
              setFocusedTaskId(taskId);
              setCurrentView("tasks");
            }
          }}
          onOpenStudio={() => {
            if (isPageAllowed("minutes")) {
              setIsStudioOpen(true);
              setStudioMode("panel");
              setIsUniversalEchoOpen(false);
            }
          }}
          onGoToNotetaker={() => {
            if (isPageAllowed("minutes")) {
              setCurrentView("minutes");
              setStage("Input");
            }
          }}
          onNavigateToPage={(page) => handleSelectView(page as NavView)}
          allowedPages={allowedPages as any}
          isAdmin={isAdminUser}
          askEchoEnabled={askEchoEnabled}
          allowedFeatures={allowedFeatures}
          studioRecording={{
            active: studioRecorder.status === "recording" || studioRecorder.status === "paused",
            isMinimized: isStudioOpen && studioMode === "minimized" && (studioRecorder.status === "recording" || studioRecorder.status === "paused"),
            elapsedSeconds: studioRecorder.elapsedSeconds,
            isPaused: studioRecorder.status === "paused",
            onRestore: () => {
              setCurrentView("minutes");
              setStage("Input");
              setSourceTab("record");
              setIsStudioOpen(true);
              setStudioMode("fullscreen");
            },
          }}
        />

        {/* Studio Recovery Banner for crash resilience */}
        <StudioRecoveryBanner
          activeSessionId={studioRecorder.sessionId}
          isRecording={studioRecorder.status === "recording" || studioRecorder.status === "paused"}
          onProcessSession={(file) => {
            setSelectedFile(file);
            setCurrentView("minutes");
            setStage("Input");
            handleUnifiedSourceSubmission(file);
          }}
        />

        {/* Scrollable View Content (Maximized full width without big margin borders) */}
        <main className={`flex-1 min-h-0 ${isMeetingWorkspace ? "h-full overflow-hidden flex flex-col p-0" : currentView === "minutes" ? "overflow-y-auto p-0" : "overflow-y-auto px-4 py-5 md:px-8"}`}>
          {governanceStatus === "loading" ? (
            <div role="status" className="flex min-h-[400px] items-center justify-center p-8 text-sm text-slate-600">
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin text-[#C9AB4C]" />
              Checking page access…
            </div>
          ) : governanceStatus === "error" ? (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <div className="max-w-md border border-slate-200 bg-[#FFFCFB] p-8 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800">Page access is unavailable</h2>
                <p className="mt-2 text-xs text-slate-600">We couldn’t confirm your access. Try loading the page access settings again.</p>
                <button type="button" onClick={() => window.dispatchEvent(new Event("echo-config-updated"))} className="mt-5 border border-[#003366] bg-[#003366] px-4 py-2 text-xs font-semibold text-white hover:bg-[#002244] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9AB4C]">
                  Try again
                </button>
              </div>
            </div>
          ) : !isPageAllowed(currentView) ? (
            <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
              <div className="max-w-md w-full bg-[#FFFCFB] border border-slate-200 p-8 text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
                <p className="text-xs text-slate-600 mt-2">
                  Your account ({authUser?.email || "current user"}) does not have permission to access the <strong>{currentView.toUpperCase()}</strong> page.
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Please contact your administrator to request access.
                </p>
                {allowedPages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectView(allowedPages[0])}
                    className="mt-6 px-4 py-2 bg-[#003366] text-white text-xs font-bold hover:bg-[#002244] transition-colors cursor-pointer"
                  >
                    Go to {allowedPages[0].toUpperCase()}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
          <div className={isMeetingWorkspace ? "h-full w-full flex flex-col min-h-0 overflow-hidden" : currentView === "minutes" ? "min-h-full w-full flex flex-col" : "w-full pb-12"}>
            
            {/* VIEW 1: DASHBOARD */}
            {currentView === "dashboard" && (
              <DashboardView
                meetings={archivedMeetings}
                onOpenMeeting={(meetingId) => {
                  setSelectedMeetingId(meetingId);
                  setCurrentView("meetings");
                }}
                onNewMinutes={() => {
                  setCurrentView("minutes");
                  setStage("Input");
                }}
              />
            )}

            {currentView === "project" && <ProjectWorkspace userId={authUser?.id ? String(authUser.id) : undefined} />}
            {currentView === "delta" && <ContractsWorkspace />}

            {/* VIEW: TASKS (CLICKUP PORTAL) */}
            {(currentView === "tasks" || currentView === "notebook") && (
              <TasksPageView
                key={currentView}
                userId={authUser?.id ? String(authUser.id) : undefined}
                currentUserName={authUser?.username}
                currentView={currentView}
                canAccessTasks={isPageAllowed("tasks")}
                canAccessNotebook={isPageAllowed("notebook")}
                onNavigateToMeetings={() => setCurrentView("meetings")}
                onSelectMeeting={(meetingTitle) => {
                  const match = archivedMeetings.find((m) =>
                    m.title.toLowerCase().includes(meetingTitle.toLowerCase())
                  );
                  if (match) setSelectedMeetingId(match.id);
                  setCurrentView("meetings");
                }}
                focusedTaskId={focusedTaskId}
                onClearFocusedTask={() => setFocusedTaskId(null)}
              />
            )}

            {currentView === "reports" && (
              <section className="mx-auto flex min-h-[60vh] w-full max-w-5xl items-center justify-center px-5 py-12">
                <div className="w-full max-w-xl border border-slate-200 border-t-2 border-t-[#C9A84C] bg-[#FFFCFB] px-6 py-8 text-center shadow-sm">
                  <ChartNoAxesColumnIncreasing aria-hidden="true" className="mx-auto h-8 w-8 text-[#003366]" />
                  <h1 className="mt-4 font-serif text-2xl italic text-[#003366]">Reports</h1>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Under development. We’re exploring technology options and implementation approaches for this workspace.
                  </p>
                </div>
              </section>
            )}

            {currentView === "market-insights" && <MarketInsightsView userId={authUser?.id ? String(authUser.id) : undefined} />}
            {currentView === "demands" && <DemandsView userId={authUser?.id ? String(authUser.id) : undefined} sector={pathname?.startsWith("/demands/retail") ? "retail" : pathname?.startsWith("/demands/industrial") ? "industrial" : "all"} />}
            {currentView === "business-analysis" && <BusinessAnalysisView userId={authUser?.id ? String(authUser.id) : undefined} meetings={archivedMeetings} onLoadMeetings={async () => {
              const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || undefined : undefined;
              const result = await fetchMeetings(undefined, personalListId);
              return Array.isArray(result.meetings) ? result.meetings : [];
            }} />}

            {/* VIEW 2: MEETINGS ARCHIVES */}
            {currentView === "meetings" && (
              <MeetingsView
                meetings={archivedMeetings}
                userEmail={authUser?.email}
                selectedMeetingId={selectedMeetingId}
                onSelectMeeting={(meetingId) => setSelectedMeetingId(meetingId)}
                onSelectMeetingSpace={async (spaceId) => {
                  try {
                    const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || undefined : undefined;
                    const data = await fetchMeetings(spaceId, personalListId);
                    const meetingsList = data.meetings || [];
                    setArchivedMeetings(meetingsList);
                    if (meetingsList.length > 0) {
                      setSelectedMeetingId(meetingsList[0].id);
                    } else {
                      setSelectedMeetingId(null);
                    }
                  } catch (error: any) {
                    console.warn("Unable to load meeting space:", error);
                    alert(error.message || "Unable to load meetings for the selected space.");
                  }
                }}
                canExport={allowedFeatures.includes("meetings-export")}
                onNavigateToTasks={(taskId) => {
                  setFocusedTaskId(taskId);
                  setCurrentView("tasks");
                }}
                onUpdateMeeting={async (updated, previousMeeting) => {
                  const response = await fetch("/api/meetings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ meeting: updated, previousMeeting }),
                  });
                  if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || "Unable to save changes to ClickUp.");
                  }
                  setArchivedMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
                }}
                onMoveMeeting={async (updated) => {
                  setArchivedMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
                  const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || undefined : undefined;
                  fetchMeetings(undefined, personalListId).then((data) => {
                    if (data.meetings && Array.isArray(data.meetings)) {
                      setArchivedMeetings(data.meetings);
                    }
                  }).catch(() => {});
                }}
                onDeleteMeeting={async (meetingId) => {
                  await deleteMeeting(meetingId);
                  setArchivedMeetings((prev) => {
                    const nextList = prev.filter((m) => m.id !== meetingId && m.meeting_id !== meetingId);
                    if (selectedMeetingId === meetingId) {
                      setSelectedMeetingId(nextList.length > 0 ? nextList[0].id : null);
                    }
                    return nextList;
                  });
                }}
                onNewMinutes={() => {
                  setCurrentView("minutes");
                  setStage("Input");
                }}
                onProcessInterrupted={(file, notes) => {
                  setSelectedFile(file);
                  if (notes) {
                    setAdditionalMeetingNotes(notes);
                  }
                  setCurrentView("minutes");
                  setStage("Input");
                  handleUnifiedSourceSubmission(file, undefined, notes);
                }}
              />
            )}

            {/* VIEW 3: MINUTES GENERATOR */}
            {currentView === "minutes" && (
              <div ref={notetakerRef} className={`relative flex ${isMeetingWorkspace ? "h-full min-h-0 overflow-hidden" : "min-h-full"} flex-col bg-[#F7F9FC] font-sans text-gray-800`}>
                {/* Header bar (Uniform text-2xl font-serif) */}
                <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-[#FFFCFB] px-5 py-3 sm:flex-row sm:items-center md:px-7 shrink-0">
                  <div>
                    <h1 className="text-2xl font-serif font-bold text-[#003366] italic">Notetaker Workspace</h1>
                    <p className="text-xs font-bold tracking-wider text-gray-400 uppercase mt-0.5">
                      Turn recordings, audio, documents, or text into structured meeting minutes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {selectedFile && (selectedFile.type.startsWith("video/") || selectedFile.name.includes("echo-video")) && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = URL.createObjectURL(selectedFile);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = selectedFile.name;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          }, 1000);
                        }}
                        className="btn-outline !px-3 !py-2 !text-[10px] flex items-center gap-1.5 border-emerald-600 text-emerald-800 hover:bg-emerald-50 cursor-pointer shadow-2xs font-semibold"
                        title="Download the recorded meeting video file"
                      >
                        <Download size={12} className="text-emerald-700" />
                        <span>Download Video</span>
                      </button>
                    )}
                    {stage === "Input" && (
                      <div className="flex items-center gap-2">
                        {selectedFile && <button type="button" onClick={() => handleUnifiedSourceSubmission()} disabled={isLoading} className="btn-outline !px-3 !py-2 !text-[10px]"><RotateCcw size={12} /> Re-process</button>}
                      </div>
                    )}
                  </div>
                </div>

                <Stepper 
                  currentStage={stage} 
                  onStageChange={setStage} 
                  isReviewAllowed={isReviewAllowed} 
                  onUpload={() => setSourceTab(sourceTab === "record" ? "source" : "record")} 
                  canUpload={allowedFeatures.includes("notetaker-upload")}
                  onDiscoverTopics={() => setShowDiscoverTopicsModal(true)}
                  discoveredTopicsCount={missedTopics.length}
                  onToggleFullscreen={() => void toggleNotetakerFullscreen()} 
                  isFullscreen={isNotetakerFullscreen}
                  onSaveExport={() => openFinalizeModal("all")}
                />

      {/* STAGE 1: INPUT */}
      <div className={`flex min-h-0 flex-1 ${isMeetingWorkspace ? "h-full overflow-hidden p-2 md:p-2.5" : "p-2.5 md:p-3.5"}`}>
        {stage === "Input" && (
          <div className={`w-full ${sourceTab === "source" ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start min-h-full" : "h-full flex flex-col flex-1 min-h-0"}`}>
            
            {/* Left Panel: Meeting Source (Uniform bg-[#FFFCFB] rounded-none card) */}
            <div className={`flex min-h-0 flex-col ${sourceTab === "record" ? "w-full h-full flex-1 overflow-hidden" : "bg-[#FFFCFB] border border-gray-200/90 p-4 shadow-2xs"}`}>
              {sourceTab === "source" && <div className="flex justify-between items-center pb-2.5 mb-3 border-b border-gray-100">
                <span className="font-serif font-bold text-base text-[#003366] italic">Upload or paste existing material</span>
              </div>}
              
              <div className={`flex flex-col flex-1 ${sourceTab === "record" ? "h-full min-h-0" : ""}`}>
                
                {/* TAB 1: MERGED DRAG-AND-DROP UPLOAD & PASTE SOURCE */}
                {sourceTab === "source" && (
                  <div className="flex flex-col gap-3.5">
                    
                    {/* Drag-and-Drop Area (Auto-processes upon drop/selection) */}
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative border border-dashed p-4 transition-all flex flex-col items-center justify-center text-center cursor-pointer rounded-none ${
                        isDragging 
                          ? "border-[#003366] bg-[#eef1f6] shadow-xs" 
                          : selectedFile
                            ? "border-green-600/40 bg-green-50/20"
                            : "border-gray-300 bg-[#FFFCFB] hover:border-[#003366]/50 hover:bg-[#FFFCFB]"
                      }`}
                    >
                      <input 
                        type="file" 
                        accept="audio/*,video/mp4,application/pdf,.docx,.doc,.txt,.srt,.vtt,text/plain" 
                        onChange={handleFileSelect} 
                        className="hidden" 
                        id="unified-file-upload" 
                      />

                      {!selectedFile ? (
                        <label htmlFor="unified-file-upload" className="cursor-pointer flex flex-col items-center w-full py-1">
                          <div className="w-9 h-9 rounded-none bg-[#003366]/5 flex items-center justify-center mb-2">
                            {isDragging ? (
                              <ArrowDownCircle size={22} className="text-[#003366] animate-bounce" />
                            ) : (
                              <Upload size={18} className="text-[#003366]" />
                            )}
                          </div>
                          <p className="text-xs font-bold text-[#003366] uppercase tracking-wide mb-0.5">
                            {isDragging ? "Drop your file here to process immediately" : "Drag and drop your meeting file here"}
                          </p>
                          <p className="text-[11px] text-gray-500 mb-2">
                            or <span className="text-[#003366] font-bold underline">Browse files</span> to automatically transcribe & generate
                          </p>
                          <div className="flex flex-wrap justify-center gap-1.5 text-[9px] text-gray-400 uppercase font-semibold">
                            <span className="bg-[#FFFCFB] border border-gray-200 px-1.5 py-0.5">Audio: MP3, WAV, M4A</span>
                            <span className="bg-[#FFFCFB] border border-gray-200 px-1.5 py-0.5">Documents: PDF, Word (.docx)</span>
                            <span className="bg-[#FFFCFB] border border-gray-200 px-1.5 py-0.5">Transcripts: TXT, SRT, VTT</span>
                          </div>
                        </label>
                      ) : (
                        <div className="w-full flex items-center justify-between bg-[#FFFCFB] border border-gray-200 p-2.5 shadow-2xs">
                          <div className="flex items-center gap-2.5 text-xs font-semibold text-[#003366] truncate text-left">
                            <FileCheck size={18} className="text-green-600 shrink-0" />
                            <div className="truncate">
                              <p className="truncate font-bold text-xs text-[#003366]">{selectedFile.name}</p>
                              <p className="text-gray-400 text-[10px]">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Auto-processed
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {(selectedFile.type.startsWith("video/") || selectedFile.name.includes("echo-video")) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const url = URL.createObjectURL(selectedFile);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = selectedFile.name;
                                  document.body.appendChild(a);
                                  a.click();
                                  setTimeout(() => {
                                    URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                  }, 1000);
                                }}
                                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer px-1.5 py-0.5 flex items-center gap-1"
                                title="Download video file"
                              >
                                <Download size={12} /> Download
                              </button>
                            )}
                            <label htmlFor="unified-file-upload" className="text-[11px] font-bold text-[#003366] hover:underline cursor-pointer px-1.5 py-0.5">
                              Replace
                            </label>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(null);
                              }}
                              className="text-gray-400 hover:text-red-500 p-1 hover:bg-[#FFFCFB] rounded-none cursor-pointer"
                              title="Remove file"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* OR Divider */}
                    <div className="relative flex items-center justify-center my-0.5">
                      <div className="border-t border-gray-200 w-full"></div>
                      <span className="bg-[#FFFCFB] px-2.5 text-[9px] uppercase font-bold tracking-widest text-gray-400 shrink-0">
                        OR PASTE TRANSCRIPT / TEXT
                      </span>
                      <div className="border-t border-gray-200 w-full"></div>
                    </div>

                    {/* Direct Text Paste Area */}
                    <div className="border border-gray-200 bg-[#FFFCFB] p-3">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Paste Meeting Text / Notes / Transcript
                        </label>
                        {pastedText && (
                          <button 
                            type="button" 
                            onClick={() => setPastedText("")}
                            className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
                          >
                            Clear Text
                          </button>
                        )}
                      </div>
                      <textarea 
                        rows={3}
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste raw transcript, meeting notes, chat logs, or key bullet points directly here..."
                        className="w-full border border-gray-200 p-2 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] focus:outline-none focus:border-[#C9AB4C] transition-colors leading-relaxed rounded-none"
                      />
                      {pastedText.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleUnifiedSourceSubmission()}
                          disabled={isLoading}
                          className="mt-2.5 w-full btn-primary !py-1.5 !text-xs flex items-center justify-center gap-1.5 rounded-none cursor-pointer"
                        >
                          <Sparkles size={13} />
                          <span>Process Text & Generate Minutes</span>
                        </button>
                      )}
                    </div>

                  </div>
                )}

                {/* TAB 2: RECORD LIVE (Studio Mode Launcher) */}
                {sourceTab === "record" && (
                  <StudioPanel
                    isOpen
                    embedded
                    recorder={studioRecorder}
                    askEchoEnabled={askEchoEnabled}
                    allowedFeatures={allowedFeatures}
                    mode="fullscreen"
                    onRecordingStart={handleRecordingStart}
                    onRecordingStop={handleRecordingStop}
                    meetingDetails={(
                      <section className="border border-[#D9E1EA] border-t-2 border-t-[#C9A84C] bg-white shadow-2xs" aria-labelledby="meeting-information-heading">
                        <div className="border-b border-slate-200 px-3 py-1.5 flex items-center justify-between">
                          <h3 id="meeting-information-heading" className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#003366]">Meeting Details</h3>
                          <span className="text-[9px] text-slate-400">Context for Minutes</span>
                        </div>
                        <div className="space-y-2 p-2.5">
                          {/* Row 1: Meeting Name */}
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                              Meeting Name <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              value={metadata.client_name || ""}
                              onChange={(event) => setMetadata({ ...metadata, client_name: event.target.value })}
                              placeholder="e.g. Q3 Commercial Real Estate Strategy"
                              className="w-full border border-slate-200 bg-[#FFFCFB] px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#C9A84C] transition-colors"
                            />
                          </div>

                          {/* Row 2: Date & Venue side-by-side */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                                Meeting Date
                              </label>
                              <input
                                type="date"
                                value={metadata.date || ""}
                                onChange={(event) => setMetadata({ ...metadata, date: event.target.value })}
                                className="w-full border border-slate-200 bg-[#FFFCFB] px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#C9A84C] transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                                Location / Venue
                              </label>
                              <select
                                value={metadata.location || VENUE_OPTIONS[0]}
                                onChange={(event) => setMetadata({ ...metadata, location: event.target.value })}
                                className="w-full border border-slate-200 bg-[#FFFCFB] px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
                              >
                                {VENUE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {metadata.location === "Other / Custom..." && (
                            <input
                              aria-label="Custom venue"
                              value={metadata.custom_location || ""}
                              onChange={(event) => setMetadata({ ...metadata, custom_location: event.target.value })}
                              placeholder="Enter venue or meeting link..."
                              className="w-full border border-[#C9A84C] bg-[#FFFCFB] px-2 py-1 text-xs outline-none"
                            />
                          )}

                          {/* Row 3: Meeting Type */}
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                              Meeting Type
                            </label>
                            <div className="grid grid-cols-3 gap-1 w-full">
                              {(["Internal", "External", "Team"] as const).map((type) => {
                                const isSelected = (metadata.meeting_type || "Internal").toLowerCase() === type.toLowerCase();
                                return (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => setMetadata({ ...metadata, meeting_type: type })}
                                    className={`py-1 px-1.5 text-[11px] font-semibold text-center transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-[#003366] text-white shadow-2xs"
                                        : "bg-white border border-slate-200 text-slate-600 hover:text-[#003366] hover:border-slate-300"
                                    }`}
                                  >
                                    {type}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Row 4: Time Start & Time End */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 p-1">
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                                <span className="text-[8px] text-slate-400 font-medium">Auto on record</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="time"
                                  value={metadata.start_time || ""}
                                  onChange={(e) => setMetadata({ ...metadata, start_time: e.target.value })}
                                  className="w-full min-w-0 border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-mono font-bold text-[#003366] outline-none focus:border-[#C9A84C]"
                                />
                                {metadata.start_time && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Start time captured" />
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">End Time</label>
                                <span className="text-[8px] text-slate-400 font-medium">Auto on stop</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="time"
                                  value={metadata.end_time || ""}
                                  onChange={(e) => setMetadata({ ...metadata, end_time: e.target.value })}
                                  className="w-full min-w-0 border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-mono font-bold text-[#003366] outline-none focus:border-[#C9A84C]"
                                />
                                {metadata.end_time ? (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="End time captured" />
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic shrink-0 whitespace-nowrap">On stop</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Row 5: Team Attendees */}
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-[#003366] mb-0.5">
                              Team Attendees
                            </label>
                            {primeAttendees.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {primeAttendees.map((name) => (
                                  <span key={name} className="inline-flex items-center gap-1 bg-[#003366] text-[#c9ab4c] font-bold text-[10px] px-1.5 py-0.5 shadow-2xs">
                                    {name}
                                    <X size={10} onClick={() => removePrimeAttendee(name)} className="cursor-pointer text-white hover:text-red-300" />
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Add team attendee..."
                                value={newPrimeAttendee}
                                onChange={(e) => setNewPrimeAttendee(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addPrimeAttendee();
                                  }
                                }}
                                className="flex-1 min-w-0 border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#003366]"
                              />
                              <button
                                type="button"
                                onClick={addPrimeAttendee}
                                className="shrink-0 border border-[#003366] px-2.5 py-1 text-[11px] font-bold text-[#003366] hover:bg-[#003366] hover:text-white transition-colors cursor-pointer"
                              >
                                ADD
                              </button>
                            </div>
                          </div>

                          {/* Row 6: External Attendees */}
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-[#C9A84C] mb-0.5">
                              External Attendees
                            </label>
                            {externalAttendees.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {externalAttendees.map((name) => (
                                  <span key={name} className="inline-flex items-center gap-1 bg-[#003366] text-white font-bold text-[10px] px-1.5 py-0.5 shadow-2xs">
                                    {name}
                                    <X size={10} onClick={() => removeExternalAttendee(name)} className="cursor-pointer text-white hover:text-red-300" />
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Add external attendee..."
                                value={newExternalAttendee}
                                onChange={(e) => setNewExternalAttendee(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addExternalAttendee();
                                  }
                                }}
                                className="flex-1 min-w-0 border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#C9A84C]"
                              />
                              <button
                                type="button"
                                onClick={addExternalAttendee}
                                className="shrink-0 border border-[#003366] px-2.5 py-1 text-[11px] font-bold text-[#003366] hover:bg-[#003366] hover:text-white transition-colors cursor-pointer"
                              >
                                ADD
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Routing & Ownership */}
                          <details className="group border border-slate-200 bg-slate-50/40">
                            <summary className="cursor-pointer list-none px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#003366] flex items-center justify-between select-none hover:bg-slate-100/50 transition-colors">
                              <span>Routing and ownership</span>
                              <span className="text-[#C9A84C] group-open:rotate-45 transition-transform font-bold text-xs">+</span>
                            </summary>
                            <div className="space-y-1.5 border-t border-slate-200 bg-white p-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                <input aria-label="Department" value={metadata.department || ""} onChange={(event) => setMetadata({ ...metadata, department: event.target.value })} placeholder="Department (e.g. CRD)" className="w-full min-w-0 border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#C9A84C]" />
                                <input aria-label="ClickUp workspace" value={metadata.workspace || ""} onChange={(event) => setMetadata({ ...metadata, workspace: event.target.value })} placeholder="ClickUp workspace" className="w-full min-w-0 border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#C9A84C]" />
                              </div>
                              <input aria-label="ClickUp space ID" value={metadata.space_id || ""} onChange={(event) => setMetadata({ ...metadata, space_id: event.target.value })} placeholder="ClickUp Space ID" className="w-full border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#C9A84C]" />
                              <div className="grid grid-cols-2 gap-1.5">
                                <input aria-label="Prepared by" value={metadata.prepared_by || "Dave Policarpio"} onChange={(event) => setMetadata({ ...metadata, prepared_by: event.target.value })} placeholder="Prepared by" className="w-full min-w-0 border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#C9A84C]" />
                                <input aria-label="Confirmed by" value={metadata.confirmed_by || "Client Rep or Lead"} onChange={(event) => setMetadata({ ...metadata, confirmed_by: event.target.value })} placeholder="Confirmed by" className="w-full min-w-0 border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#C9A84C]" />
                              </div>
                            </div>
                          </details>
                        </div>
                      </section>
                    )}
                    onChangeMode={setStudioMode}
                    onClose={() => setIsStudioOpen(false)}
                    onSendToNotetaker={handleSendToNotetaker}
                    onOpenSource={(page, recordId, url) => {
                      if (page === "meetings") setSelectedMeetingId(recordId);
                      if (page === "tasks") setFocusedTaskId(recordId);
                      if (["meetings", "tasks", "notebook", "forms", "demands", "market-insights"].includes(page)) setCurrentView(page as NavView);
                      else if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  />
                )}

              </div>
            {sourceTab === "source" && (<>
            {/* Meeting Information for uploaded material. Live meeting information sits inside the recording status column. */}
            <div className="bg-[#FFFCFB] border border-gray-200/90 rounded-none p-4 shadow-2xs flex flex-col">
              <div className="flex justify-between items-center pb-2.5 mb-3 border-b border-gray-100">
                <span className="font-serif font-bold text-base text-[#003366] italic">
                  2. Meeting Information
                </span>
                {transcript && (
                  <button onClick={handleGenerateMinutes} className="btn-outline !py-1 !px-2.5 !text-[11px] rounded-none shadow-2xs flex items-center gap-1">
                    <Sparkles size={12} /> Re-Generate
                  </button>
                )}
              </div>

              <div className="space-y-3.5">
                
                {/* Date and Times */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Date</label>
                    <input 
                      type="date" 
                      value={metadata.date || ""}
                      onChange={(e) => setMetadata({ ...metadata, date: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Start Time</label>
                    <input 
                      type="time" 
                      value={metadata.start_time || "09:00"}
                      onChange={(e) => setMetadata({ ...metadata, start_time: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">End Time</label>
                    <input 
                      type="time" 
                      value={metadata.end_time || "10:00"}
                      onChange={(e) => setMetadata({ ...metadata, end_time: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                    />
                  </div>
                </div>

                {/* Meeting Type & Venue */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Meeting Type</label>
                    <select 
                      value={metadata.meeting_type || "Internal"} 
                      onChange={(e) => setMetadata({ ...metadata, meeting_type: e.target.value })} 
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none cursor-pointer"
                    >
                      <option value="Internal">Internal</option>
                      <option value="External">External</option>
                      <option value="Team">Team Meeting</option>
                      <option value="Client Pitch">Client Pitch</option>
                      <option value="Board Meeting">Board Meeting</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Venue / Location</label>
                    <select 
                      value={metadata.location || VENUE_OPTIONS[0]} 
                      onChange={(e) => setMetadata({ ...metadata, location: e.target.value })} 
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none cursor-pointer"
                    >
                      {VENUE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>

                    {/* Custom Venue Input when Other / Custom... is selected */}
                    {metadata.location === "Other / Custom..." && (
                      <div className="mt-2">
                        <input 
                          type="text" 
                          placeholder="Enter custom venue name or address..."
                          value={metadata.custom_location || ""}
                          onChange={(e) => setMetadata({ ...metadata, custom_location: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-[#c9ab4c] outline-none transition-colors rounded-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Meeting name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Meeting Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Acme Corp or Internal Mosaic Project"
                    value={metadata.client_name || ""}
                    onChange={(e) => setMetadata({ ...metadata, client_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div><label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">ClickUp Workspace</label><input value={metadata.workspace || ""} onChange={(e) => setMetadata({ ...metadata, workspace: e.target.value })} placeholder="Workspace name" className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200" /></div>
                  <div><label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Department</label><input value={metadata.department || ""} onChange={(e) => setMetadata({ ...metadata, department: e.target.value })} placeholder="e.g. CRD or IT" className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200" /></div>
                  <div><label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">ClickUp Space ID</label><input value={metadata.space_id || ""} onChange={(e) => setMetadata({ ...metadata, space_id: e.target.value })} placeholder="Required for archive" className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200" /></div>
                </div>

                {/* Team Attendees & External Attendees */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  
                  {/* Team Attendees */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Team Attendees
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-[#FFFCFB] border border-gray-200 min-h-[36px] items-center">
                      {primeAttendees.map((name) => (
                        <span key={name} className="bg-[#003366] text-[#c9ab4c] font-bold text-[11px] tracking-wider px-2 py-0.5 rounded-none flex items-center gap-1 shadow-2xs">
                          {name}
                          <X 
                            size={11} 
                            onClick={() => removePrimeAttendee(name)} 
                            className="cursor-pointer text-white hover:text-red-300" 
                          />
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input 
                          type="text" 
                          placeholder="+ Add Name"
                          value={newPrimeAttendee}
                          onChange={(e) => setNewPrimeAttendee(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPrimeAttendee();
                            }
                          }}
                          className="text-[11px] py-0.5 px-1.5 border border-dashed border-gray-300 focus:outline-none focus:border-[#003366] w-20 bg-[#FFFCFB]"
                        />
                        <button type="button" onClick={addPrimeAttendee} className="text-xs text-[#003366] hover:bg-gray-200 p-0.5">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* External Attendees */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      External Attendees
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-[#FFFCFB] border border-gray-200 min-h-[36px] items-center">
                      {externalAttendees.map((name) => (
                        <span key={name} className="bg-[#003366] text-white font-bold text-[11px] tracking-wider px-2 py-0.5 rounded-none flex items-center gap-1 shadow-2xs">
                          {name}
                          <X 
                            size={11} 
                            onClick={() => removeExternalAttendee(name)} 
                            className="cursor-pointer text-white hover:text-red-300" 
                          />
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input 
                          type="text" 
                          placeholder="+ Add Name"
                          value={newExternalAttendee}
                          onChange={(e) => setNewExternalAttendee(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addExternalAttendee();
                            }
                          }}
                          className="text-[11px] py-0.5 px-1.5 border border-dashed border-gray-300 focus:outline-none focus:border-[#003366] w-20 bg-[#FFFCFB]"
                        />
                        <button type="button" onClick={addExternalAttendee} className="text-xs text-[#003366] hover:bg-gray-200 p-0.5">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Prepared By & Confirmed By */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Prepared By</label>
                    <input 
                      type="text" 
                      value={metadata.prepared_by || "Dave Policarpio"}
                      onChange={(e) => setMetadata({ ...metadata, prepared_by: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Confirmed By</label>
                    <input 
                      type="text" 
                      value={metadata.confirmed_by || "Client Rep or Lead"}
                      onChange={(e) => setMetadata({ ...metadata, confirmed_by: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#FFFCFB] border border-gray-200 focus:bg-[#FFFCFB] focus:border-[#C9AB4C] outline-none transition-colors rounded-none" 
                    />
                  </div>
                </div>

              </div>
            </div>
            </>)}

            </div>

          </div>
        )}

        {/* STAGE 2: REVIEW (FULL WIDTH DISCUSSION POINTS MATRIX & ACTIONS) */}
        {stage === "Review" && (
          <div className="flex flex-col gap-5 w-full">

            {/* 3 TABS HEADER: DISCUSSION POINTS VS MEETING NOTES VS TRANSCRIPT */}
            <div className="flex border-b border-[#003366]/20 bg-[#FFFCFB]">
              <button
                type="button"
                onClick={() => setReviewTab("discussion")}
                className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                  reviewTab === "discussion"
                    ? "border-[#003366] text-[#003366] bg-white"
                    : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Discussion Points
              </button>
              <button
                type="button"
                onClick={() => setReviewTab("notes")}
                className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                  reviewTab === "notes"
                    ? "border-[#003366] text-[#003366] bg-white"
                    : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Meeting Notes
              </button>
              <button
                type="button"
                onClick={() => setReviewTab("transcript")}
                className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
                  reviewTab === "transcript"
                    ? "border-[#003366] text-[#003366] bg-white"
                    : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                Transcript
              </button>
            </div>

            {reviewTab === "transcript" ? (
              /* TRANSCRIPT TAB */
              <div className="border border-gray-200 bg-[#FFFCFB] p-5 shadow-2xs rounded-none space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-lg font-serif text-[#003366] italic">Full Raw Transcript</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Spoken dialogue and speaker turns captured during the recording session.
                    </p>
                  </div>
                  {transcript && (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(transcript);
                        setCopiedTranscript(true);
                        setTimeout(() => setCopiedTranscript(false), 2000);
                      }}
                      className="btn-outline !py-1 !px-2.5 !text-[11px] rounded-none flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedTranscript ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      <span>{copiedTranscript ? "Copied" : "Copy Transcript"}</span>
                    </button>
                  )}
                </div>
                {transcript?.trim() ? (
                  <AutoResizeTextarea
                    rows={12}
                    className="w-full text-xs font-mono text-gray-700 bg-[#FFFCFB] border border-gray-200 rounded-none p-3.5 focus:outline-none focus:border-[#C9AB4C] leading-relaxed min-h-[300px]"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Full raw transcript text..."
                  />
                ) : (
                  <div className="border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                    <FileText size={22} className="mx-auto text-[#003366]" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No transcript available</p>
                    <p className="mt-1 text-xs text-slate-400">Audio recordings or uploaded transcripts appear here.</p>
                  </div>
                )}
              </div>
            ) : reviewTab === "notes" ? (
              /* MEETING NOTES TAB */
              <div className="border border-gray-200 bg-[#FFFCFB] p-5 shadow-2xs rounded-none space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-lg font-serif text-[#003366] italic">Meeting Notes</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Notes captured in the workspace during the meeting session.
                    </p>
                  </div>
                </div>

                {/* Timestamped Notes Preview */}
                {(() => {
                  const rawNotes = additionalMeetingNotes || "";
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
              <>
            {/* EXECUTIVE MINUTES MATRIX */}
            <div className="border border-[#003366]/20 bg-[#FFFCFB] shadow-2xs overflow-hidden rounded-none">
              
              {/* Header */}
              <div className="bg-[#003366] text-white px-5 py-3.5 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 bg-[#c9ab4c]"></div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">
                    Discussion Points & Action Items
                  </span>
                </div>
                <span className="text-[11px] text-gray-300 font-semibold tracking-wider uppercase">
                  {momItems.length} {momItems.length === 1 ? "Topic" : "Topics"}
                </span>
              </div>

              {/* Discussion Cards Container */}
              <div className="p-4 bg-[#FFFCFB] space-y-4">
                {momItems.length === 0 ? (
                  <div className="p-10 text-center bg-[#FFFCFB] border border-gray-200 rounded-none">
                    <p className="text-gray-500 text-xs mb-3">No minutes items generated yet.</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={addRow} className="btn-primary !text-xs !py-1.5 !px-3 rounded-none cursor-pointer">
                        <Plus size={13} className="inline mr-1" /> Add First Topic Manually
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!transcript?.trim()) {
                            alert("No transcript available to discover topics from.");
                            return;
                          }
                          setShowDiscoverTopicsModal(true);
                          if (missedTopics.length === 0) {
                            void discoverTopics("");
                          }
                        }}
                        className="btn-outline !text-xs !py-1.5 !px-3 rounded-none flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles size={13} className="text-[#c9ab4c]" /> Discover Topics
                      </button>
                    </div>
                  </div>
                ) : (
                  momItems.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="p-4 bg-[#FFFCFB] border border-gray-200 shadow-2xs hover:border-[#003366]/40 transition-colors relative rounded-none"
                    >
                      {/* 1. TOPIC AS HEADER + MOVE/REMOVE BUTTONS */}
                      <div className="flex items-start justify-between gap-4 pb-2.5 border-b border-gray-100">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-[family-name:--font-bebas] text-xl text-[#c9ab4c] tracking-wider shrink-0 select-none">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="flex-1">
                            <input 
                              type="text" 
                              className="w-full font-serif text-base text-[#003366] font-bold italic bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#003366] focus:outline-none transition-colors py-0.5 rounded-none" 
                              value={item.topic_title || ""} 
                              placeholder="Topic title (e.g., Project Updates & Milestones)..."
                              onChange={(e) => {
                                const newItems = [...momItems];
                                newItems[idx].topic_title = e.target.value;
                                setMomItems(newItems);
                              }}
                            />
                          </div>
                        </div>

                        {/* Top-Right Move/Remove */}
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button 
                            type="button" 
                            onClick={() => moveRow(idx, -1)} 
                            disabled={idx === 0}
                            title="Move topic up"
                            className="p-1 border border-gray-200 bg-[#FFFCFB] hover:bg-[#003366] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors text-gray-500 rounded-none"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => moveRow(idx, 1)} 
                            disabled={idx === momItems.length - 1}
                            title="Move topic down"
                            className="p-1 border border-gray-200 bg-[#FFFCFB] hover:bg-[#003366] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors text-gray-500 rounded-none"
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => removeRow(idx)} 
                            title="Remove topic"
                            className="p-1 border border-gray-200 bg-[#FFFCFB] hover:bg-red-500 hover:text-white transition-colors text-gray-400 hover:border-red-500 rounded-none ml-0.5"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>

                      {/* 2. EVIDENCE SECTION */}
                      <div className="pt-2.5 pb-3">
                        <label className="block text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">
                          Evidence Quote / Context Reference
                        </label>
                        <AutoResizeTextarea
                          rows={2}
                          className="w-full border-l-2 border-[#c9ab4c] bg-[#FFFCFB] p-2 text-xs italic text-gray-700 focus:outline-none focus:bg-[#FFFCFB] focus:border-[#003366] transition-colors leading-relaxed rounded-none"
                          value={item.evidence_quote || ""}
                          placeholder='[00:00] Direct context or source reference quote...'
                          onChange={(e) => {
                            const newItems = [...momItems];
                            newItems[idx].evidence_quote = e.target.value;
                            setMomItems(newItems);
                          }}
                        />
                      </div>

                      {/* 3. ROW FOR DISCUSSION POINT, ACTION PLAN, TARGET DATE, PERSON IN CHARGE */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start pt-2.5 border-t border-gray-100">
                        
                        {/* Discussion Point */}
                        <div className="lg:col-span-5">
                          <label className="block text-[9px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                            Discussion Point
                          </label>
                          <AutoResizeTextarea
                            rows={3}
                            className="w-full border border-gray-200 p-2 text-xs bg-[#FFFCFB] text-gray-700 leading-relaxed focus:outline-none focus:border-[#C9AB4C] transition-colors shadow-2xs rounded-none"
                            value={item.discussion_point || ""}
                            placeholder="Detail discussions, key arguments, and conclusions..."
                            onChange={(e) => {
                              const newItems = [...momItems];
                              newItems[idx].discussion_point = e.target.value;
                              setMomItems(newItems);
                            }}
                          />
                        </div>

                        {/* Action Plan */}
                        <div className="lg:col-span-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[9px] font-bold tracking-widest uppercase text-gray-500">
                              Action Plan
                            </label>
                            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-none ${
                              item.action_plan && item.action_plan !== "None"
                                ? "bg-[#003366] text-[#c9ab4c]"
                                : "bg-[#FFFCFB] text-gray-400"
                            }`}>
                              {item.action_plan && item.action_plan !== "None" ? "Action" : "Info"}
                            </span>
                          </div>
                          <AutoResizeTextarea
                            rows={3}
                            className="w-full border border-gray-200 p-2 text-xs bg-[#FFFCFB] text-gray-700 leading-relaxed focus:outline-none focus:border-[#C9AB4C] transition-colors shadow-2xs rounded-none"
                            value={item.action_plan || ""}
                            placeholder="Next steps or operational action..."
                            onChange={(e) => {
                              const newItems = [...momItems];
                              newItems[idx].action_plan = e.target.value;
                              setMomItems(newItems);
                            }}
                          />
                        </div>

                        {/* Target Date */}
                        <div className="lg:col-span-2">
                          <label className="block text-[9px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                            Target Date
                          </label>
                          <DatePickerInput
                            value={item.indicative_delivery_date || ""}
                            onChange={(val) => {
                              const newItems = [...momItems];
                              newItems[idx].indicative_delivery_date = val;
                              setMomItems(newItems);
                            }}
                          />
                          <span className="text-[9px] text-gray-400 mt-0.5 block">Pick or type date</span>
                        </div>

                        {/* Person in Charge */}
                        <div className="lg:col-span-2">
                          <label className="block text-[9px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                            Person in Charge
                          </label>
                          <div className="flex items-center gap-1.5 border border-gray-200 bg-[#FFFCFB] px-2 py-1.5 rounded-none">
                            <Users size={12} className="text-[#c9ab4c] shrink-0" />
                            <input 
                              type="text" 
                              className="w-full text-xs font-semibold text-gray-800 bg-transparent focus:outline-none" 
                              value={item.person_in_charge || ""} 
                              placeholder="e.g. Dave Policarpio"
                              onChange={(e) => {
                                const newItems = [...momItems];
                                newItems[idx].person_in_charge = e.target.value;
                                setMomItems(newItems);
                              }} 
                            />
                          </div>
                        </div>

                      </div>

                      {/* Quick Task Action Bar */}
                      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400 font-mono">
                          Topic #{idx + 1}
                        </span>
                        {item.clickUpTaskId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedTaskId(item.clickUpTaskId);
                              setCurrentView("tasks");
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs rounded-none cursor-pointer"
                            title="Already added to ClickUp. Click to view or edit in Tasks portal"
                          >
                            <CheckCircle2 size={13} className="text-emerald-600" />
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
                                      : item.topic_title || `Action from Topic #${idx + 1}`,
                                  description: item.discussion_point || "",
                                  topic: item.topic_title || "",
                                  evidence: item.evidence_quote || "",
                                  meetingTitle: metadata.client_name || "Executive Meeting",
                                  meetingDate: metadata.date,
                                  dueDate: item.indicative_delivery_date || "",
                                  priority: "normal",
                                  assigneeName: item.person_in_charge || "",
                                  discussionPointId: item.id || `dp_${idx + 1}`,
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
                  ))
                )}
              </div>

              {/* Table / Card List Footer */}
              <div className="p-3.5 bg-[#FFFCFB] border-t border-gray-200 flex items-center gap-2">
                <button onClick={addRow} className="btn-primary !py-2 !px-4 text-xs rounded-none cursor-pointer">
                  <Plus size={14} className="inline mr-1.5 -mt-0.5" /> Add Topic
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!transcript?.trim()) {
                      alert("No transcript available to discover topics from.");
                      return;
                    }
                    setShowDiscoverTopicsModal(true);
                    if (missedTopics.length === 0) {
                      void discoverTopics("");
                    }
                  }}
                  className="btn-outline !py-2 !px-4 text-xs flex items-center gap-1.5 rounded-none text-[#003366] hover:bg-[#003366] hover:text-white transition-colors cursor-pointer"
                >
                  <Sparkles size={14} className="text-[#c9ab4c]" />
                  <span>Discover Topics</span>
                </button>
              </div>

            </div>

            {/* Other Discussions */}
            <div className="border border-gray-200 bg-[#FFFCFB] p-5 shadow-2xs rounded-none">
              <h3 className="text-lg font-serif text-[#003366] italic mb-1.5">Other Discussions & Peripheral Notes</h3>
              <p className="text-[11px] text-gray-500 mb-3">
                Summary of housekeeping topics, general announcements, administrative items, and non-action discussions.
              </p>
              <textarea 
                className="w-full border border-gray-200 p-3 text-xs bg-[#FFFCFB] focus:bg-[#FFFCFB] min-h-[100px] focus:outline-none focus:border-[#C9AB4C] transition-colors leading-relaxed shadow-2xs rounded-none" 
                value={otherDiscussions}
                onChange={(e) => setOtherDiscussions(e.target.value)}
                placeholder="Summary paragraph of all general discussions and administrative updates..."
              />
            </div>
            </>
            )}

          </div>
        )}

              </div>
            </div>
          )}
          </div>
          {(currentView === "forms" || currentView === "forms-admin") && (
            <FormsPortal initialTab={currentView === "forms-admin" ? "admin" : "track"} user={authUser ? { username: authUser.username, email: authUser.email } : null} />
          )}
            </>
          )}
        </main>
      </div>

            {/* Discover & Search Topics Modal */}
      <DiscoverTopicsModal
        isOpen={showDiscoverTopicsModal}
        onClose={() => setShowDiscoverTopicsModal(false)}
        missedTopics={missedTopics}
        isDiscoveringTopics={isDiscoveringTopics}
        autoDiscoverEnabled={autoDiscoverEnabled}
        onToggleAutoDiscover={() => setAutoDiscoverEnabled(!autoDiscoverEnabled)}
        topicQuery={topicQuery}
        onTopicQueryChange={setTopicQuery}
        onDiscoverTopics={discoverTopics}
        onAddTopic={addMissedTopic}
        onAddAllTopics={addAllMissedTopics}
        onDismissTopic={dismissMissedTopic}
        transcript={transcript}
      />

      {/* Quick Add Task to ClickUp Modal */}
      <QuickAddTaskModal
        isOpen={quickAddTaskData.isOpen}
        onClose={() => setQuickAddTaskData({ isOpen: false, data: {} })}
        initialData={quickAddTaskData.data}
        onTaskCreated={(created) => {
          if (quickAddTaskData.topicIndex !== undefined) {
            const idx = quickAddTaskData.topicIndex;
            const updated = [...momItems];
            if (updated[idx]) {
              updated[idx].clickUpTaskId = created.id;
              updated[idx].clickUpUrl = created.url;
              setMomItems(updated);
            }
          }
        }}
        onOpenInTasks={(taskId) => {
          setFocusedTaskId(taskId);
          setCurrentView("tasks");
        }}
      />

      {/* Universal Slide-Over AI Assistant Drawer */}
      {askEchoEnabled && allowedFeatures.includes("ask-echo") && <UniversalEchoDrawer
        isOpen={isUniversalEchoOpen}
        onClose={() => setIsUniversalEchoOpen(false)}
        meetings={archivedMeetings}
        onOpenSource={(page, recordId, url) => {
          if (page === "meetings") setSelectedMeetingId(recordId);
          if (page === "tasks") setFocusedTaskId(recordId);
          if (["meetings", "tasks", "notebook", "forms", "demands", "market-insights"].includes(page)) setCurrentView(page as NavView);
          else if (url) window.open(url, "_blank", "noopener,noreferrer");
          setIsUniversalEchoOpen(false);
        }}
      />}

    </div>
  );
}

