"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardList,
  Settings2,
  FileEdit,
  PackageSearch,
  ShieldCheck,
  Save,
  Plus,
  X,
  AlertTriangle,
  Lock,
  Check,
  RotateCcw,
  Users,
  Mail,
  BarChart3,
  Download,
  ChevronUp,
  ChevronDown,
  PhilippinePeso,
  Zap,
  Coins,
  Clock,
  RefreshCw,
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import FormsCreateView from "./FormsCreateView";
import FormsTrackView from "./FormsTrackView";
import FormsApprovalsView from "./FormsApprovalsView";
import { isFormsOwner } from "@/lib/forms/owner";
import { APPROVED_MODELS, DEFAULT_AI_POLICY, type AiPolicy } from "@/lib/ask-echo/limits";
import { REPOSITORY_FORMS, REPOSITORY_FORM_MAPPINGS } from "./forms.config";
import { ALL_FEATURES, FEATURE_CATALOG, type FeatureId } from "@/lib/access-control";

export type PortalTab = "create" | "track" | "approvals" | "admin";
export type Role = "owner" | "admin" | "approver" | "requestor";
export type FormType = "rfp" | "po" | "pcv";
export type AppPage = "dashboard" | "project" | "tasks" | "notebook" | "reports" | "market-insights" | "demands" | "meetings" | "minutes" | "forms" | "delta" | "business-analysis" | "bsc";

export const APP_PAGE_LIST: Array<{ id: AppPage; label: string; desc: string }> = [
  { id: "dashboard", label: "Dashboard", desc: "Executive overview & meeting metrics" },
  { id: "project", label: "Project", desc: "Focused project workspace" },
  { id: "tasks", label: "Tasks", desc: "ClickUp tasks portal & action items" },
  { id: "notebook", label: "Notebook", desc: "Daily logs & team completeness dashboard" },
  { id: "reports", label: "Reports", desc: "Reporting workspace under development" },
  { id: "market-insights", label: "Market Insights", desc: "Weekly brief & shared market source archive" },
  { id: "demands", label: "Demands", desc: "Demand pipeline, table & coverage" },
  { id: "meetings", label: "Meetings", desc: "Archived meetings & transcripts" },
  { id: "minutes", label: "Notetaker", desc: "Studio, live recording & minutes synthesis" },
  { id: "forms", label: "Forms", desc: "Submit, track & approve company requests" },
  { id: "delta", label: "Contract Review", desc: "Compare lease drafts and export a local review register" },
  { id: "business-analysis", label: "Business Analysis", desc: "Personal IT requirements, notes, and delivery planning" },
];
const DEFAULT_ACCESS_PAGE_LIST = APP_PAGE_LIST.filter((page) => page.id !== "business-analysis");

export const OWNER_EMAIL = "admin@primephilippines.com";
const FORM_LABELS: Record<string, string> = {
  rfp: "Request for Payment",
  po: "Purchase Order",
  pcv: "Petty Cash Voucher",
  "it-helpdesk-support-form": "Helpdesk Support Form",
  "it-bug-error-report-form": "Bug/Error Report Form",
  "it-asset-request-form": "IT Asset Request Form",
};
const STAGES = [
  "Team Leader Endorsement",
  "Finance Verification",
  "Disbursement Preparation",
  "Executive Sign-Off",
  "Payment Released",
  "Completed",
];

export interface AdminUser {
  email: string;
  name: string;
  role: Exclude<Role, "owner">;
  department: string;
  active: boolean;
}

export interface FormMapping {
  id: string;
  department: string;
  formType: string;
  formLabel?: string;
  listId: string;
  approvers: Array<{ stage: number; emails: string[]; requireAll: boolean }>;
}

export interface UserPagePermission {
  email: string;
  name?: string;
  allowedPages: AppPage[];
  allowedFeatures?: FeatureId[];
}

export type EmailEvent = "submitted" | "approved" | "revision_requested" | "completed";
export interface FormEmailTemplate {
  id: string;
  department: string;
  formType: string;
  event: EmailEvent;
  enabled: boolean;
  subject: string;
  body: string;
}

export interface FormsConfig {
  admins: AdminUser[];
  members: AdminUser[];
  departments: string[];
  mappings: FormMapping[];
  pagePermissions?: UserPagePermission[];
  defaultPageAccess?: AppPage[];
  defaultFeatureAccess?: FeatureId[];
  sidebarOrder?: AppPage[];
  emailTemplates?: FormEmailTemplate[];
  allowedSignInDomains: string[];
  aiPolicy?: AiPolicy;
  features?: { askEchoEnabled: boolean };
  formFeatures?: { rfpAutofill: boolean; pdfPreview: boolean; emailNotifications: boolean };
}

const DEFAULT_CONFIG: FormsConfig = {
  admins: [],
  members: [],
  departments: ["Finance", "Procurement", "Operations", "Human Resources", "Marketing", "IT", "General"],
  mappings: REPOSITORY_FORM_MAPPINGS,
  pagePermissions: [],
  defaultPageAccess: ["forms", "delta"],
  defaultFeatureAccess: ALL_FEATURES,
  sidebarOrder: APP_PAGE_LIST.map((page) => page.id),
  emailTemplates: [],
  allowedSignInDomains: ["primephilippines.com"],
  aiPolicy: DEFAULT_AI_POLICY,
  formFeatures: { rfpAutofill: true, pdfPreview: true, emailNotifications: true },
  features: { askEchoEnabled: true },
};

function normalizeEmail(email?: string) {
  return (email || "").trim().toLowerCase();
}

export function AdminConfiguration({ userEmail, username }: { userEmail: string; username?: string }) {
  const [config, setConfig] = useState<FormsConfig>(DEFAULT_CONFIG);
  const [selectedDepartment, setSelectedDepartment] = useState(DEFAULT_CONFIG.departments[0]);
  const [selectedForm, setSelectedForm] = useState<string>("rfp");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newFormName, setNewFormName] = useState("");
  const [newFormListId, setNewFormListId] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<Exclude<Role, "owner">>("requestor");
  const [newMemberDepartment, setNewMemberDepartment] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("requestor");
  const [openDepartments, setOpenDepartments] = useState<Record<string, boolean>>({ Finance: true });
  const [formsSubtab, setFormsSubtab] = useState<"routing" | "features">("routing");
  const [settingsTab, setSettingsTab] = useState<"rbac" | "configurations" | "email" | "ai" | "telemetry" | "navigation" | "project-atlas">("rbac");
  const [emailEvent, setEmailEvent] = useState<EmailEvent>("submitted");
  const [emailTestStatus, setEmailTestStatus] = useState("");
  const [newSignInDomain, setNewSignInDomain] = useState("");
  const [aiUsage, setAiUsage] = useState<{ today: { requests: number; tokens: number }; month: { requests: number; tokens: number }; recentLimitHits: number; credentialConfigured: boolean } | null>(null);
  const [telemetryRange, setTelemetryRange] = useState(() => ({ start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) }));
  const [telemetry, setTelemetry] = useState<any>(null);
  const [costCurrency, setCostCurrency] = useState<"PHP" | "USD">("PHP");
  const [atlasSync, setAtlasSync] = useState<{ configured: boolean; latestRun: { status: string; conclusion: string | null; htmlUrl: string; runNumber: number; createdAt: string; updatedAt: string } | null; error?: string } | null>(null);
  const [atlasSyncing, setAtlasSyncing] = useState(false);
  const [atlasSyncNotice, setAtlasSyncNotice] = useState("");

  // Page Access Governance state
  const [newPageUserEmail, setNewPageUserEmail] = useState("");
  const [newPageUserName, setNewPageUserName] = useState("");
  const [newPageSelectedPages, setNewPageSelectedPages] = useState<AppPage[]>([
    "forms",
  ]);
  const [newPageSelectedFeatures, setNewPageSelectedFeatures] = useState<FeatureId[]>(ALL_FEATURES);

  const isOwner = isFormsOwner({ email: userEmail, username });

  useEffect(() => {
    fetch("/api/forms/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.config) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...data.config,
            members: data.config.members || [],
            pagePermissions: data.config.pagePermissions || [],
            defaultPageAccess: data.config.defaultPageAccess || ["forms"],
            defaultFeatureAccess: data.config.defaultFeatureAccess || ALL_FEATURES,
            emailTemplates: data.config.emailTemplates || [],
            sidebarOrder: data.config.sidebarOrder || DEFAULT_CONFIG.sidebarOrder,
          });
        }
      })
      .catch(() => setNotice("Could not load Admin configuration from Supabase."));
  }, []);

  useEffect(() => {
    if (settingsTab !== "ai") return;
    fetch("/api/admin/ai").then((response) => response.ok ? response.json() : null).then((data) => data && setAiUsage(data)).catch(() => {});
  }, [settingsTab]);

  useEffect(() => {
    if (settingsTab !== "telemetry") return;
    const start = new Date(`${telemetryRange.start}T00:00:00`).toISOString();
    const end = new Date(`${telemetryRange.end}T23:59:59.999`).toISOString();
    fetch(`/api/admin/telemetry?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).then((response) => response.ok ? response.json() : null).then(setTelemetry).catch(() => setTelemetry(null));
  }, [settingsTab, telemetryRange]);

  const loadAtlasSyncStatus = async () => {
    const response = await fetch("/api/admin/project-atlas-sync", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load Project Atlas sync status.");
    setAtlasSync(result);
  };

  const atlasRunStatus = atlasSync?.latestRun?.status;
  useEffect(() => {
    if (settingsTab !== "project-atlas") return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch("/api/admin/project-atlas-sync", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load Project Atlas sync status.");
        if (!active) return;
        setAtlasSync(result);
        setAtlasSyncNotice("");
        if (result.latestRun?.status === "queued" || result.latestRun?.status === "in_progress") timer = window.setTimeout(poll, 5000);
      } catch (error) {
        if (active) setAtlasSyncNotice(error instanceof Error ? error.message : "Could not load Project Atlas sync status.");
      }
    };
    void poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [settingsTab, atlasRunStatus]);

  const syncProjectAtlas = async () => {
    setAtlasSyncing(true);
    setAtlasSyncNotice("");
    try {
      const response = await fetch("/api/admin/project-atlas-sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start Project Atlas sync.");
      setAtlasSyncNotice("Sync started. The Atlas copy will update in the background.");
      await loadAtlasSyncStatus();
    } catch (error) {
      setAtlasSyncNotice(error instanceof Error ? error.message : "Could not start Project Atlas sync.");
    } finally {
      setAtlasSyncing(false);
    }
  };

  const save = async (next: FormsConfig = config) => {
    setConfig(next);
    const res = await fetch("/api/forms/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) window.dispatchEvent(new CustomEvent("echo-config-updated"));
    setNotice(res.ok ? "Configuration saved." : "Could not save configuration to Supabase.");
    window.setTimeout(() => setNotice(""), 3500);
  };

  const mapping = useMemo(
    () =>
      config.mappings.find(
        (item) => item.department === selectedDepartment && item.formType === selectedForm
      ),
    [config.mappings, selectedDepartment, selectedForm]
  );

  const ensureMapping = () =>
    mapping || {
      id: `${selectedDepartment}-${selectedForm}`,
      department: selectedDepartment,
      formType: selectedForm,
      formLabel:
        selectedForm === "it-asset-request-form"
          ? "IT Asset Request Form"
          : FORM_LABELS[selectedForm as FormType],
      listId: "",
      approvers: STAGES.map((_, stage) => ({ stage, emails: [], requireAll: false })),
    };

  const updateMapping = (next: FormMapping) => {
    const updated = {
      ...config,
      mappings: [...config.mappings.filter((item) => item.id !== next.id), next],
    };
    setConfig(updated);
    setNotice("Unsaved routing changes");
  };

  if (
    !isOwner &&
    !config.admins.some((admin) => admin.active && normalizeEmail(admin.email) === normalizeEmail(userEmail))
  ) {
    return (
      <div className="panel max-w-3xl">
        <AlertTriangle className="text-amber-600 mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Admin access required</h2>
        <p className="text-sm text-gray-500 mt-2">
          This configuration area is restricted to the protected Owner and active Forms Admins.
        </p>
      </div>
    );
  }

  const addAdmin = () => {
    const email = normalizeEmail(newAdminEmail);
    if (
      !isOwner ||
      !email ||
      email === OWNER_EMAIL ||
      config.admins.some((admin) => normalizeEmail(admin.email) === email)
    )
      return;
    save({
      ...config,
      admins: [
        ...config.admins,
        { email, name: newAdminName.trim() || email, role: "admin", department: "", active: true },
      ],
    });
    setNewAdminEmail("");
    setNewAdminName("");
  };

  const addDepartment = () => {
    const value = newDepartment.trim();
    if (value && !config.departments.includes(value)) {
      save({ ...config, departments: [...config.departments, value] });
    }
    setNewDepartment("");
  };

  const addCustomForm = () => {
    const name = newFormName.trim();
    const listId = newFormListId.trim();
    if (!name || !listId) return;
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const key =
      selectedDepartment === "IT" && normalized === "helpdesk-support-form"
        ? "it-helpdesk-support-form"
        : selectedDepartment === "IT" && normalized === "bug-error-report-form"
        ? "it-bug-error-report-form"
        : normalized;
    const next = {
      id: `${selectedDepartment}-${key}`,
      department: selectedDepartment,
      formType: key,
      formLabel: name,
      listId,
      approvers: STAGES.map((_, stage) => ({ stage, emails: [], requireAll: false })),
    };
    save({ ...config, mappings: [...config.mappings.filter((item) => item.id !== next.id), next] });
    setNewFormName("");
    setNewFormListId("");
  };

  const addMember = () => {
    const email = normalizeEmail(newMemberEmail);
    if (!email || config.members.some((member) => normalizeEmail(member.email) === email) || email === OWNER_EMAIL)
      return;
    const member: AdminUser = {
      email,
      name: newMemberName.trim() || email,
      role: newMemberRole,
      department: newMemberDepartment,
      active: true,
    };
    save({
      ...config,
      members: [...config.members, member],
      admins: newMemberRole === "admin" ? [...config.admins, member] : config.admins,
    });
    setNewMemberEmail("");
    setNewMemberName("");
  };

  // Page Access Governance Handlers
  const addPagePermission = () => {
    const email = normalizeEmail(newPageUserEmail);
    if (!email) return;
    if (email === OWNER_EMAIL) {
      alert("The Owner (Dave Policarpio) has permanent master access to all application pages.");
      return;
    }
    const existingRules = config.pagePermissions || [];
    const updatedRules = [
      ...existingRules.filter((r) => normalizeEmail(r.email) !== email),
      {
        email,
        name: newPageUserName.trim() || email,
        allowedPages: newPageSelectedPages.length > 0 ? newPageSelectedPages : ["forms" as AppPage],
        allowedFeatures: newPageSelectedFeatures,
      },
    ];
    save({ ...config, pagePermissions: updatedRules });
    setNewPageUserEmail("");
    setNewPageUserName("");
    setNewPageSelectedPages(["forms"]);
    setNewPageSelectedFeatures(config.defaultFeatureAccess || ALL_FEATURES);
  };

  const toggleFeatureForUser = (userEmailToToggle: string, feature: FeatureId) => {
    const norm = normalizeEmail(userEmailToToggle);
    const updatedRules = (config.pagePermissions || []).map((rule) => {
      if (normalizeEmail(rule.email) !== norm) return rule;
      const current = rule.allowedFeatures || config.defaultFeatureAccess || ALL_FEATURES;
      const next = current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature];
      return { ...rule, allowedFeatures: next };
    });
    save({ ...config, pagePermissions: updatedRules });
  };

  const toggleDefaultFeature = (feature: FeatureId) => {
    const current = config.defaultFeatureAccess || ALL_FEATURES;
    const next = current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature];
    if (!next.length) return;
    save({ ...config, defaultFeatureAccess: next });
  };

  const togglePageForUser = (userEmailToToggle: string, page: AppPage) => {
    const norm = normalizeEmail(userEmailToToggle);
    const existingRules = config.pagePermissions || [];
    const currentRule = existingRules.find((r) => normalizeEmail(r.email) === norm);
    if (!currentRule) return;

    let nextPages: AppPage[];
    if (currentRule.allowedPages.includes(page)) {
      if (currentRule.allowedPages.length <= 1) {
        alert("A user must have at least one allowed page. To grant full access, click 'Grant All' or remove the rule.");
        return;
      }
      nextPages = currentRule.allowedPages.filter((p) => p !== page);
    } else {
      nextPages = [...currentRule.allowedPages, page];
    }

    const updatedRules = existingRules.map((r) =>
      normalizeEmail(r.email) === norm ? { ...r, allowedPages: nextPages } : r
    );
    save({ ...config, pagePermissions: updatedRules });
  };

  const setPresetForUser = (userEmailToSet: string, pages: AppPage[]) => {
    const norm = normalizeEmail(userEmailToSet);
    const existingRules = config.pagePermissions || [];
    const updatedRules = existingRules.map((r) =>
      normalizeEmail(r.email) === norm ? { ...r, allowedPages: pages } : r
    );
    save({ ...config, pagePermissions: updatedRules });
  };

  const removePagePermission = (userEmailToRemove: string) => {
    const norm = normalizeEmail(userEmailToRemove);
    const existingRules = config.pagePermissions || [];
    const updatedRules = existingRules.filter((r) => normalizeEmail(r.email) !== norm);
    save({ ...config, pagePermissions: updatedRules });
  };

  const handleUpdateDefaultPages = (pages: AppPage[]) => {
    save({
      ...config,
      defaultPageAccess: pages.filter((page) => page !== "business-analysis").length > 0 ? pages.filter((page) => page !== "business-analysis") : ["forms"],
    });
  };

  const toggleDefaultPage = (page: AppPage) => {
    if (page === "business-analysis") return;
    const current = config.defaultPageAccess || ["forms"];
    let next: AppPage[];
    if (current.includes(page)) {
      if (current.length <= 1) {
        alert("New and unlisted users must have at least one permitted page (e.g. Forms).");
        return;
      }
      next = current.filter((p) => p !== page);
    } else {
      next = [...current, page];
    }
    save({
      ...config,
      defaultPageAccess: next,
    });
  };

  const current = ensureMapping();
  const emailTemplateId = `${selectedDepartment}-${selectedForm}-${emailEvent}`;
  const emailTemplate = (config.emailTemplates || []).find((item) => item.id === emailTemplateId) || {
    id: emailTemplateId,
    department: selectedDepartment,
    formType: selectedForm,
    event: emailEvent,
    enabled: true,
    subject: "Request Status Update ({{form_id}})",
    body: "Hi {{requestor_first_name}},\n\nYour {{form_name}} request has been updated.\n\nRequest ID: {{form_id}}\nSubmitted: {{submitted_at}}\nLast updated: {{status_updated_at}}\nStatus: {{status_label}}\nDepartment: {{department}}\nRequest title: {{request_title}}\nAmount: {{amount}}\nPurpose: {{purpose}}\n\nCompleted stage: {{completed_stage}}\nApproved by: {{approver_name}}\nCompleted: {{completed_at}}\n\nCurrent stage: {{current_stage}}\nStarted: {{current_stage_started_at}}\n\n{{status_message}}\n{{next_step_message}}\n\nTrack request: {{track_status_url}}",
  };
  const updateEmailTemplate = (patch: Partial<FormEmailTemplate>) => {
    const next = { ...emailTemplate, ...patch };
    const updated = { ...config, emailTemplates: [...(config.emailTemplates || []).filter((item) => item.id !== next.id), next] };
    setConfig(updated);
    setNotice("Unsaved email template changes");
  };

  const sendTestEmail = async () => {
    setEmailTestStatus("Sending test…");
    try {
      const response = await fetch("/api/forms/email-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department: selectedDepartment, formType: selectedForm, event: emailEvent }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || result.error || "Test email failed");
      setEmailTestStatus(`Sent to ${result.recipient || userEmail}. Check that inbox and Resend → Emails.`);
    } catch (error: any) {
      setEmailTestStatus(error.message || "Test email failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-serif italic font-bold text-[#003366]">Forms & System Administration</h1>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">
            RBAC, Page Access Governance, and Six-Stage Approval Routing
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => save()}>
          <Save size={14} /> Save Configuration
        </button>
      </div>

      {notice && (
        <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-xs font-semibold">
          {notice}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-5 items-start">
        <aside className="w-full md:w-56 shrink-0 bg-[#003366] text-[#FFFCFB] p-2 shadow-[4px_0_18px_rgba(0,51,102,0.12)]">
          <div className="px-3 py-3 border-b border-[#31577D] text-[10px] uppercase tracking-[0.18em] text-[#B8CDE0]">Admin workspace</div>
          <nav className="mt-2 space-y-1">
            {(["rbac", "navigation", "configurations", "email", "ai", "telemetry", "project-atlas"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setSettingsTab(item)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${settingsTab === item ? "bg-[#174778] text-[#FFBF00] border-l-2 border-[#C9A84C]" : "text-[#D7E3EF] hover:bg-[#174778] hover:text-[#FFFCFB]"}`}>
                <span className="truncate">{item === "rbac" ? "Users & Access" : item === "navigation" ? "Workspace Sidebar" : item === "configurations" ? "Forms & Routing" : item === "email" ? "Email & Notifications" : item === "ai" ? "Ask Echo" : item === "project-atlas" ? "Project Atlas" : "System Health"}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 w-full space-y-4">

      <section className={`space-y-4 ${settingsTab !== "navigation" ? "hidden" : ""}`}>
        <div className="panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-serif italic text-[#003366]">Sidebar order</h2>
              <p className="mt-1 text-xs text-[#181D1E]/65">Choose the order of the main workspace navigation. Changes apply to every user who can access those pages.</p>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-[#003366]/60">Drag-free controls</span>
          </div>
          <div className="mt-5 max-w-2xl space-y-2">
            {(config.sidebarOrder || DEFAULT_CONFIG.sidebarOrder || []).map((pageId, index, order) => {
              const page = APP_PAGE_LIST.find((item) => item.id === pageId);
              if (!page) return null;
              const move = (direction: -1 | 1) => {
                const target = index + direction;
                if (target < 0 || target >= order.length) return;
                const next = [...order];
                [next[index], next[target]] = [next[target], next[index]];
                setConfig({ ...config, sidebarOrder: next });
              };
              return <div key={page.id} className="flex items-center gap-3 border border-[#003366]/15 bg-[#FFFCFB] px-3 py-3">
                <span className="w-6 text-center text-xs font-bold text-[#003366]/55">{index + 1}</span>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#003366]">{page.label}</div><div className="text-xs text-[#181D1E]/55">{page.desc}</div></div>
                <button type="button" aria-label={`Move ${page.label} up`} disabled={index === 0} onClick={() => move(-1)} className="border border-[#003366]/20 p-2 text-[#003366] disabled:cursor-not-allowed disabled:opacity-25"><ChevronUp size={15} /></button>
                <button type="button" aria-label={`Move ${page.label} down`} disabled={index === order.length - 1} onClick={() => move(1)} className="border border-[#003366]/20 p-2 text-[#003366] disabled:cursor-not-allowed disabled:opacity-25"><ChevronDown size={15} /></button>
              </div>;
            })}
          </div>
          <p className="mt-4 text-xs text-[#181D1E]/60">Use Save Configuration above to publish the new order.</p>
        </div>
      </section>

      <section className={`space-y-4 ${settingsTab !== "project-atlas" ? "hidden" : ""}`}>
        <div className="panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-serif italic text-[#003366]">Project Atlas repository copy</h2>
              <p className="mt-1 max-w-2xl text-xs text-[#181D1E]/65">Mosaic keeps a snapshot of the Project Atlas repository in its root <code>project-atlas/</code> folder. Project Atlas on GitHub remains the source of truth; this action refreshes the snapshot from its latest <code>main</code> commit.</p>
            </div>
            <button type="button" onClick={() => void syncProjectAtlas()} disabled={atlasSyncing || atlasSync?.latestRun?.status === "queued" || atlasSync?.latestRun?.status === "in_progress" || atlasSync?.configured === false} className="btn-primary flex shrink-0 items-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-55">
              <RefreshCw size={14} className={atlasSyncing || atlasSync?.latestRun?.status === "queued" || atlasSync?.latestRun?.status === "in_progress" ? "animate-spin" : ""} />
              {atlasSyncing || atlasSync?.latestRun?.status === "queued" || atlasSync?.latestRun?.status === "in_progress" ? "Syncing Atlas" : "Sync latest from Atlas"}
            </button>
          </div>
          {atlasSyncNotice && <p role="status" aria-live="polite" className="mt-4 border border-[#003366]/15 bg-white px-3 py-2 text-xs text-[#003366]">{atlasSyncNotice}</p>}
          <div className="mt-5 border-t border-[#003366]/10 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#003366]">
              {atlasSync?.latestRun?.status === "queued" || atlasSync?.latestRun?.status === "in_progress" ? <RefreshCw size={15} className="animate-spin text-amber-600" /> : atlasSync?.latestRun?.conclusion === "success" ? <CheckCircle2 size={16} className="text-emerald-700" /> : atlasSync?.latestRun?.conclusion ? <AlertTriangle size={16} className="text-red-700" /> : <span className="h-2 w-2 rounded-full bg-slate-400" />}
              {!atlasSync ? "Checking sync status…" : atlasSync.configured === false ? "Sync is not configured" : atlasSync.latestRun?.status === "queued" ? "Sync queued" : atlasSync.latestRun?.status === "in_progress" ? "Sync running" : atlasSync.latestRun?.conclusion === "success" ? "Latest sync completed" : atlasSync.latestRun?.conclusion ? "Latest sync failed" : "No sync run found yet"}
            </div>
            {atlasSync?.latestRun && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#181D1E]/65"><span>Run #{atlasSync.latestRun.runNumber}</span><span>Updated {new Date(atlasSync.latestRun.updatedAt).toLocaleString()}</span><a href={atlasSync.latestRun.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#003366] underline underline-offset-2">Open GitHub Actions <ExternalLink size={12} /></a></div>}
            {atlasSync?.configured === false && <p className="mt-2 text-xs text-amber-800">Add <code>PROJECT_ATLAS_SYNC_TOKEN</code> to the Mosaic deployment. It needs Actions: write permission for the Mosaic repository.</p>}
            <p className="mt-3 text-[11px] text-[#181D1E]/55">The copy runs as a GitHub Actions job and commits changes to Mosaic <code>main</code>. This avoids writing to Vercel’s temporary function filesystem.</p>
          </div>
        </div>
      </section>

      <section className={`space-y-4 ${settingsTab !== "telemetry" ? "hidden" : ""}`}>
        <div className="panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="flex items-center gap-2 text-lg font-serif italic text-[#003366]"><BarChart3 size={18} /> API telemetry</h2><p className="mt-1 text-xs text-[#181D1E]/65">Monitor processing speed, providers, fallbacks, and failures.</p></div>
            <button type="button" onClick={() => { const start = new Date(`${telemetryRange.start}T00:00:00`).toISOString(); const end = new Date(`${telemetryRange.end}T23:59:59.999`).toISOString(); window.location.href = `/api/admin/telemetry?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&format=jsonl`; }} className="btn-primary flex items-center gap-2 text-xs"><Download size={14} /> Export full report</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-[#181D1E]">From<input type="date" value={telemetryRange.start} onChange={(event) => setTelemetryRange((current) => ({ ...current, start: event.target.value }))} className="mt-1 block w-full border border-[#003366]/30 bg-[#FFFCFB] px-3 py-2" /></label>
            <label className="text-xs text-[#181D1E]">To<input type="date" value={telemetryRange.end} onChange={(event) => setTelemetryRange((current) => ({ ...current, end: event.target.value }))} className="mt-1 block w-full border border-[#003366]/30 bg-[#FFFCFB] px-3 py-2" /></label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[["Events", telemetry?.summary?.totalEvents || 0], ["Success", telemetry?.summary?.successfulEvents || 0], ["Failures", telemetry?.summary?.failedEvents || 0], ["Avg processing", `${telemetry?.summary?.averageProcessingMs || 0} ms`], ["Fallback rate", `${telemetry?.summary?.fallbackRate || 0}%`]].map(([label, value]) => <div key={String(label)} className="panel"><div className="text-[10px] uppercase tracking-widest text-[#003366]/60">{label}</div><div className="mt-1 text-xl text-[#003366]">{value}</div></div>)}
        </div>

        <div className="panel space-y-3">
          <div>
            <h3 className="text-base font-serif italic font-bold text-[#003366]">ClickUp sync and data loading</h3>
            <p className="mt-1 text-xs text-[#181D1E]/65">One report for centralized sync runs, list outcomes, and ClickUp API activity across app routes.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Sync operations", telemetry?.summary?.clickupPerformance?.syncRuns || 0],
              ["Lists synced / requested", `${telemetry?.summary?.clickupPerformance?.listsSynced || 0} / ${telemetry?.summary?.clickupPerformance?.listsRequested || 0}`],
              ["Sync failures", telemetry?.summary?.clickupPerformance?.syncFailures || 0],
              ["Lists still pending", telemetry?.summary?.clickupPerformance?.listsPending || 0],
              ["Avg operation duration", `${telemetry?.summary?.clickupPerformance?.averageMs || 0} ms`],
              ["API requests", telemetry?.summary?.clickupPerformance?.requests || 0],
              ["API failures", telemetry?.summary?.clickupPerformance?.failures || 0],
              ["95th percentile", `${telemetry?.summary?.clickupPerformance?.p95Ms || 0} ms`],
              ["Cache hit rate", `${telemetry?.summary?.clickupPerformance?.cacheHitRate || 0}%`],
            ].map(([label, value]) => <div key={String(label)} className="border border-[#003366]/10 px-3 py-2"><div className="text-[10px] uppercase tracking-widest text-[#003366]/60">{label}</div><div className="mt-1 text-lg text-[#003366]">{value}</div></div>)}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#181D1E]/70">
            <span>Avg queue wait: <strong className="text-[#003366]">{telemetry?.summary?.clickupPerformance?.averageQueueMs || 0} ms</strong></span>
            <span>Avg rate wait: <strong className="text-[#003366]">{telemetry?.summary?.clickupPerformance?.averageRateWaitMs || 0} ms</strong></span>
            <span>Avg upstream response: <strong className="text-[#003366]">{telemetry?.summary?.clickupPerformance?.averageUpstreamMs || 0} ms</strong></span>
            <span>Task page reads: <strong className="text-[#003366]">{telemetry?.summary?.clickupPerformance?.pageReads || 0}</strong></span>
            {telemetry?.summary?.clickupPerformance?.averageSnapshotAgeMs != null && <span>Average snapshot age: <strong className="text-[#003366]">{Math.round(telemetry.summary.clickupPerformance.averageSnapshotAgeMs / 1000)} sec</strong></span>}
          </div>
          <div className="grid gap-4 border-t border-[#003366]/10 pt-3 md:grid-cols-2">
            <div><h4 className="text-xs font-semibold text-[#003366]">Lists</h4><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#181D1E]/70">{Object.entries((telemetry?.summary?.clickupPerformance?.byList || {}) as Record<string, { requested: number; synced: number; failed: number; pending: number; records: number; reason?: string }>).map(([label, result]) => <span key={label}>{label}: <strong className="text-[#003366]">{result.synced}/{result.requested} synced</strong>, {result.pending} pending, {result.failed} failed, {result.records} records{result.reason && <span className="text-rose-700"> — {result.reason}</span>}</span>)}{!Object.keys(telemetry?.summary?.clickupPerformance?.byList || {}).length && <span>No sync runs in this range.</span>}</div></div>
            <div><h4 className="text-xs font-semibold text-[#003366]">API paths</h4><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#181D1E]/70">{Object.entries((telemetry?.summary?.clickupPerformance?.byEndpoint || {}) as Record<string, number>).map(([endpoint, count]) => <span key={endpoint}>{endpoint}: <strong className="text-[#003366]">{count}</strong></span>)}{!Object.keys(telemetry?.summary?.clickupPerformance?.byEndpoint || {}).length && <span>No ClickUp API requests in this range.</span>}</div></div>
          </div>
          <div className="border-t border-[#003366]/10 pt-3">
            <h4 className="text-xs font-semibold text-[#003366]">Durable sync runs</h4>
            <div className="mt-2 space-y-2">
              {((telemetry?.summary?.clickupPerformance?.runHistory || []) as Array<{ runId: string; trigger: string; state: string; requestedTargets: number; completedTargets: number; failedTargets: number; createdAt: string; finishedAt: string | null; targets: Array<{ list_label?: string; state?: string; records?: number; last_error?: string }> }>).slice(0, 20).map((run) => (
                <div key={run.runId} className="grid gap-2 border border-[#003366]/10 px-3 py-2 text-xs text-[#181D1E]/70 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                  <div className="min-w-0"><div className="truncate font-medium text-[#003366]" title={run.runId}>{run.runId}</div><div>{run.trigger} · {new Date(run.createdAt).toLocaleString()}</div></div>
                  <div>State: <strong className="text-[#003366]">{run.state}</strong></div>
                  <div>Lists: {run.completedTargets}/{run.requestedTargets} complete, {run.failedTargets} failed</div>
                  <div>{run.finishedAt ? `Finished ${new Date(run.finishedAt).toLocaleTimeString()}` : "Still in progress"}</div>
                  <div className="md:col-span-4">{run.targets.map((target) => `${target.list_label || "ClickUp list"}: ${target.state || "queued"}, ${target.records || 0} records${target.last_error ? `, ${target.last_error}` : ""}`).join(" · ")}</div>
                </div>
              ))}
              {!telemetry?.summary?.clickupPerformance?.runHistory?.length && <p className="text-xs text-[#181D1E]/65">No durable sync runs in this date range.</p>}
            </div>
          </div>
        </div>

        {/* AI Compute & Cost Intelligence Panel */}
        <div className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-serif italic font-bold text-[#003366]">
                <PhilippinePeso size={17} className="text-[#C9A84C]" /> AI Compute & Cost Intelligence
              </h3>
              <p className="mt-0.5 text-xs text-[#181D1E]/65">
                Exact processing spend across Groq Whisper, OpenRouter failover, and DeepSeek MoM synthesis.
              </p>
            </div>
            {/* Currency toggle */}
            <div className="inline-flex rounded-none border border-[#003366]/30 bg-[#FFFCFB] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCostCurrency("PHP")}
                className={`px-3 py-1 text-xs font-semibold transition-all ${
                  costCurrency === "PHP" ? "bg-[#003366] text-white shadow-xs" : "text-[#003366] hover:bg-gray-100"
                }`}
              >
                PHP (₱)
              </button>
              <button
                type="button"
                onClick={() => setCostCurrency("USD")}
                className={`px-3 py-1 text-xs font-semibold transition-all ${
                  costCurrency === "USD" ? "bg-[#003366] text-white shadow-xs" : "text-[#003366] hover:bg-gray-100"
                }`}
              >
                USD ($)
              </button>
            </div>
          </div>

          {/* 4 Cost Breakdown Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Spend */}
            <div className="bg-[#FFFCFB] border border-[#003366]/20 p-4 rounded-none shadow-2xs">
              <div className="flex items-center justify-between text-[#003366]/70 text-[10px] uppercase font-bold tracking-wider">
                <span>Total AI Compute Spend</span>
                <Coins size={14} className="text-[#C9A84C]" />
              </div>
              <div className="mt-2 text-2xl font-serif font-bold text-[#003366]">
                {costCurrency === "PHP"
                  ? `₱${(telemetry?.summary?.cost?.totalPhp || 0).toFixed(2)}`
                  : `$${(telemetry?.summary?.cost?.totalUsd || 0).toFixed(4)}`}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {telemetry?.summary?.totalAudioSeconds
                  ? `${Math.round(telemetry.summary.totalAudioSeconds / 60)} mins audio processed`
                  : "0 mins audio processed"}
              </div>
            </div>

            {/* STT Primary (Groq Whisper Turbo) */}
            <div className="bg-[#FFFCFB] border border-[#003366]/20 p-4 rounded-none shadow-2xs">
              <div className="flex items-center justify-between text-[#003366]/70 text-[10px] uppercase font-bold tracking-wider">
                <span>Primary STT (Groq Turbo)</span>
                <Zap size={14} className="text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-serif font-bold text-[#003366]">
                {costCurrency === "PHP"
                  ? `₱${(telemetry?.summary?.cost?.sttGroqPhp || 0).toFixed(2)}`
                  : `$${(telemetry?.summary?.cost?.sttGroqUsd || 0).toFixed(4)}`}
              </div>
              <div className="mt-1 text-xs text-gray-500 flex justify-between">
                <span>Rate: {costCurrency === "PHP" ? "₱2.28/hr" : "$0.04/hr"}</span>
                <span className="font-semibold text-emerald-700">{telemetry?.summary?.cost?.sttGroqMinutes || 0}m audio</span>
              </div>
            </div>

            {/* STT Fallback (OpenRouter Whisper) */}
            <div className="bg-[#FFFCFB] border border-[#003366]/20 p-4 rounded-none shadow-2xs">
              <div className="flex items-center justify-between text-[#003366]/70 text-[10px] uppercase font-bold tracking-wider">
                <span>STT Fallback (OpenRouter)</span>
                <Clock size={14} className="text-amber-600" />
              </div>
              <div className="mt-2 text-2xl font-serif font-bold text-[#003366]">
                {costCurrency === "PHP"
                  ? `₱${(telemetry?.summary?.cost?.sttFallbackPhp || 0).toFixed(2)}`
                  : `$${(telemetry?.summary?.cost?.sttFallbackUsd || 0).toFixed(4)}`}
              </div>
              <div className="mt-1 text-xs text-gray-500 flex justify-between">
                <span>Rate: {costCurrency === "PHP" ? "₱20.52/hr" : "$0.36/hr"}</span>
                <span className="font-semibold text-amber-700">{telemetry?.summary?.cost?.sttFallbackMinutes || 0}m fallback</span>
              </div>
            </div>

            {/* LLM MoM Synthesis (DeepSeek Chat) */}
            <div className="bg-[#FFFCFB] border border-[#003366]/20 p-4 rounded-none shadow-2xs">
              <div className="flex items-center justify-between text-[#003366]/70 text-[10px] uppercase font-bold tracking-wider">
                <span>LLM MoM Synthesis</span>
                <BarChart3 size={14} className="text-[#003366]" />
              </div>
              <div className="mt-2 text-2xl font-serif font-bold text-[#003366]">
                {costCurrency === "PHP"
                  ? `₱${(telemetry?.summary?.cost?.llmPhp || 0).toFixed(2)}`
                  : `$${(telemetry?.summary?.cost?.llmUsd || 0).toFixed(4)}`}
              </div>
              <div className="mt-1 text-xs text-gray-500 flex justify-between">
                <span>Rate: {costCurrency === "PHP" ? "~₱0.25/hr" : "~$0.0044/mtg"}</span>
                <span className="font-semibold text-[#003366]">{telemetry?.summary?.cost?.summarizeCount || 0} runs</span>
              </div>
            </div>
          </div>

          {/* Detailed Rates & Model Ledger Table */}
          <div className="overflow-x-auto border border-gray-200 mt-3">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 font-bold uppercase tracking-wider text-[#003366]/70 text-[10px]">
                <tr>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Model / Engine</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Unit Rate (USD)</th>
                  <th className="px-3 py-2">Effective Rate (PHP)</th>
                  <th className="px-3 py-2">Billing Metric</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-[#FFFCFB]">
                <tr>
                  <td className="px-3 py-2 font-semibold text-[#003366]">Primary Transcription</td>
                  <td className="px-3 py-2">Whisper Large v3 Turbo</td>
                  <td className="px-3 py-2"><span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-semibold">Groq API</span></td>
                  <td className="px-3 py-2 font-mono">$0.0400 / hr</td>
                  <td className="px-3 py-2 font-mono font-semibold text-[#003366]">₱2.28 / hr</td>
                  <td className="px-3 py-2 text-gray-500">Audio stream duration</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold text-[#003366]">MoM Summarization</td>
                  <td className="px-3 py-2">DeepSeek Chat (V3)</td>
                  <td className="px-3 py-2"><span className="bg-blue-50 text-[#003366] px-1.5 py-0.5 font-semibold">DeepSeek AI</span></td>
                  <td className="px-3 py-2 font-mono">$0.27/M in · $1.10/M out</td>
                  <td className="px-3 py-2 font-mono font-semibold text-[#003366]">~₱0.25 / hr</td>
                  <td className="px-3 py-2 text-gray-500">Tokens generated</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold text-amber-800">Transcription Fallback</td>
                  <td className="px-3 py-2">Whisper Large v3</td>
                  <td className="px-3 py-2"><span className="bg-amber-50 text-amber-800 px-1.5 py-0.5 font-semibold">OpenRouter</span></td>
                  <td className="px-3 py-2 font-mono">$0.3600 / hr</td>
                  <td className="px-3 py-2 font-mono font-semibold text-amber-800">₱20.52 / hr</td>
                  <td className="px-3 py-2 text-gray-500">Only on Groq rate limits</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[['Provider', telemetry?.summary?.byProvider], ['Source', telemetry?.summary?.bySource], ['Operation', telemetry?.summary?.byOperation]].map(([title, values]) => <div key={String(title)} className="panel"><h3 className="text-sm font-medium text-[#003366]">{title}</h3><div className="mt-3 space-y-2">{Object.entries((values || {}) as Record<string, number>).map(([key, value]) => <div key={key} className="flex justify-between border-b border-gray-100 pb-1 text-xs"><span>{key}</span><span className="font-semibold text-[#003366]">{value}</span></div>)}{!Object.keys((values || {}) as object).length && <p className="text-xs text-gray-400">No telemetry in this range.</p>}</div></div>)}
        </div>
      </section>

      <section className={`space-y-4 ${settingsTab !== "ai" ? "hidden" : ""}`}>
        <div className="panel">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-serif italic text-[#003366]">Ask Echo</h2><p className="mt-1 text-xs text-[#181D1E]/65">Choose the model and keep usage within comfortable limits.</p></div>
            <span className={`text-[10px] uppercase tracking-widest ${aiUsage?.credentialConfigured ? "text-[#003366]" : "text-red-700"}`}>{aiUsage?.credentialConfigured ? "Ready" : "API key missing"}</span>
          </div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border-l-2 border-[#C9A84C] px-3"><div className="text-[10px] uppercase tracking-widest text-[#003366]/60">Today</div><div className="mt-1 text-2xl font-normal text-[#003366]">{(aiUsage?.today.tokens || 0).toLocaleString()}</div><div className="text-xs text-[#181D1E]/55">tokens · {aiUsage?.today.requests || 0} requests</div></div>
            <div className="border-l-2 border-[#C9A84C] px-3"><div className="text-[10px] uppercase tracking-widest text-[#003366]/60">This month</div><div className="mt-1 text-2xl font-normal text-[#003366]">{(aiUsage?.month.tokens || 0).toLocaleString()}</div><div className="text-xs text-[#181D1E]/55">of {(config.aiPolicy || DEFAULT_AI_POLICY).monthlyOrganizationTokens.toLocaleString()} tokens</div></div>
            <div className="border-l-2 border-[#C9A84C] px-3"><div className="text-[10px] uppercase tracking-widest text-[#003366]/60">Remaining</div><div className="mt-1 text-2xl font-normal text-[#003366]">{Math.max(0, (config.aiPolicy || DEFAULT_AI_POLICY).monthlyOrganizationTokens - (aiUsage?.month.tokens || 0)).toLocaleString()}</div><div className="text-xs text-[#181D1E]/55">shared tokens this month</div></div>
          </div>
        </div>

        <div className="panel">
          <h3 className="text-sm font-medium text-[#003366]">Model</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs text-[#181D1E]">Main model<select value={(config.aiPolicy || DEFAULT_AI_POLICY).model} onChange={(event) => setConfig({ ...config, aiPolicy: { ...(config.aiPolicy || DEFAULT_AI_POLICY), model: event.target.value } })} className="mt-1 block w-full border border-[#003366]/30 bg-[#FFFCFB] px-3 py-2">{APPROVED_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} — {model.note}</option>)}</select></label>
            <label className="text-xs text-[#181D1E]">Backup model<select value={(config.aiPolicy || DEFAULT_AI_POLICY).fallbackModel} onChange={(event) => setConfig({ ...config, aiPolicy: { ...(config.aiPolicy || DEFAULT_AI_POLICY), fallbackModel: event.target.value } })} className="mt-1 block w-full border border-[#003366]/30 bg-[#FFFCFB] px-3 py-2">{APPROVED_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} — {model.note}</option>)}</select></label>
          </div>
          <p className="mt-3 text-[11px] text-[#181D1E]/55">The API key stays in the server settings and is never shown here.</p>
        </div>

        <div className="panel">
          <h3 className="text-sm font-medium text-[#003366]">Limits</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {([
              ["requestsPerMinute", "Requests per minute"], ["concurrentRequestsPerUser", "Replies at the same time"], ["dailyTokensPerUser", "Tokens per user each day"], ["monthlyOrganizationTokens", "Shared tokens each month"], ["maxOutputTokens", "Maximum reply tokens"], ["maxSources", "Sources per answer"],
            ] as Array<[keyof AiPolicy, string]>).map(([key, label]) => <label key={key} className="text-xs text-[#181D1E]">{label}<input type="number" min={1} value={(config.aiPolicy || DEFAULT_AI_POLICY)[key]} onChange={(event) => setConfig({ ...config, aiPolicy: { ...(config.aiPolicy || DEFAULT_AI_POLICY), [key]: Number(event.target.value) } })} className="mt-1 block w-full border border-[#003366]/30 bg-[#FFFCFB] px-3 py-2" /></label>)}
          </div>
          <p className="mt-4 text-xs text-[#181D1E]/60">Use Save Configuration at the top when you’re done.</p>
        </div>
      </section>

      {/* Role access summary */}
      <section className={`panel ${settingsTab !== "rbac" ? "hidden" : ""}`}>
        <h2 className="text-lg font-bold text-slate-800 mb-3">Role Access Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            ["Owner", "Protected control over admin membership and system security"],
            ["Admin", "Manage mappings, department assignments, and page governance"],
            ["Approver", "Review and act on assigned approval stages"],
            ["Requestor", "Submit forms and track progress of own requests"],
          ].map(([role, desc]) => (
            <div key={role} className="border border-gray-200 p-3 bg-[#FFFCFB]/50">
              <div className="font-bold text-[#003366] text-sm">{role}</div>
              <div className="text-[11px] text-gray-500 mt-1">{desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-600">
          Protected Owner: <span className="font-bold text-[#003366]">{OWNER_EMAIL}</span>
        </div>
      </section>

      <section className={`panel ${settingsTab !== "rbac" ? "hidden" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">ClickUp sign-in domains</h2>
            <p className="text-xs text-gray-500 mt-1">Only ClickUp users whose email ends with one of these domains can sign in. Enter domains without the @ symbol, separated by commas.</p>
          </div>
          <ShieldCheck size={19} className="text-[#003366]" />
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(config.allowedSignInDomains || []).map((domain) => (
            <span key={domain} className="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#003366]">
              {domain}
              <button
                type="button"
                className="cursor-pointer text-red-500 hover:text-red-700"
                onClick={() => save({ ...config, allowedSignInDomains: config.allowedSignInDomains.filter((item) => item !== domain) })}
                aria-label={`Remove ${domain}`}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {(config.allowedSignInDomains || []).length === 0 && <span className="text-xs text-gray-400">No domains configured.</span>}
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 border border-gray-300 px-3 py-2 text-sm"
            value={newSignInDomain}
            onChange={(e) => setNewSignInDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const domain = newSignInDomain.trim().toLowerCase().replace(/^@/, "");
                if (domain && !config.allowedSignInDomains.includes(domain)) save({ ...config, allowedSignInDomains: [...config.allowedSignInDomains, domain] });
                setNewSignInDomain("");
              }
            }}
            placeholder="example.com"
            aria-label="New allowed ClickUp sign-in domain"
          />
          <button
            type="button"
            className="btn-outline whitespace-nowrap"
            onClick={() => {
              const domain = newSignInDomain.trim().toLowerCase().replace(/^@/, "");
              if (domain && !config.allowedSignInDomains.includes(domain)) save({ ...config, allowedSignInDomains: [...config.allowedSignInDomains, domain] });
              setNewSignInDomain("");
            }}
          >
            <Plus size={14} className="inline mr-1" /> Add domain
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Save Configuration to apply this policy to new ClickUp sign-ins.</p>
      </section>

      {/* NEW: Page Access Governance */}
      <section className={`panel ${settingsTab !== "rbac" ? "hidden" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Lock size={18} className="text-[#003366]" /> Page Access Governance
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Govern which pages (Dashboard, Tasks, Meetings, Notetaker, Forms) can be accessed by specific users or new users by default.
            </p>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#003366] bg-blue-50 px-2 py-1 border border-blue-200">
            RBAC Governance
          </span>
        </div>

        {/* Default Page Access for New & Unlisted Users */}
        <div className="mt-4 bg-[#FFFCFB] border border-[#C9AB4C]/50 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#003366] uppercase tracking-wider flex items-center gap-1.5">
                <Users size={15} className="text-[#C9AB4C]" />
                Default Page Access for New / Unlisted Users
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Configure which pages are accessible to new members, first-time logins, or users without explicit custom rules.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleUpdateDefaultPages(["forms"])}
                className="text-[11px] font-semibold text-[#003366] bg-[#FFFCFB] hover:bg-[#FFFCFB] px-2.5 py-1 border border-slate-300 shadow-xs cursor-pointer"
              >
                Forms Only
              </button>
              <button
                type="button"
                onClick={() => handleUpdateDefaultPages(DEFAULT_ACCESS_PAGE_LIST.map((p) => p.id))}
                className="text-[11px] font-semibold text-[#003366] bg-[#FFFCFB] hover:bg-[#FFFCFB] px-2.5 py-1 border border-slate-300 shadow-xs cursor-pointer"
              >
                Grant All Pages
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#C9AB4C]/30 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-700 mr-1">
              Active Default Pages:
            </span>
            {DEFAULT_ACCESS_PAGE_LIST.map((page) => {
              const currentDefault = config.defaultPageAccess || ["forms"];
              const isAllowed = currentDefault.includes(page.id);
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => toggleDefaultPage(page.id)}
                  className={`text-[11px] px-3 py-1 border font-medium transition-all cursor-pointer ${
                    isAllowed
                      ? "bg-[#003366] text-white border-[#003366] font-semibold shadow-xs"
                      : "bg-[#FFFCFB] text-slate-400 border-slate-300 line-through hover:border-slate-400"
                  }`}
                >
                  {page.label}
                </button>
              );
            })}
            <span className="text-[11px] text-slate-500 italic ml-2">
              ({(config.defaultPageAccess || ["forms"]).filter((page) => page !== "business-analysis").length} of {DEFAULT_ACCESS_PAGE_LIST.length} permitted by default)
            </span>
          </div>
        </div>

        <div className="mt-3 border border-slate-200 bg-[#FFFCFB] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#003366]">Default Feature Access</div>
          <p className="mt-1 text-xs text-slate-500">Feature access applies after page access and global feature toggles.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ALL_FEATURES.map((feature) => {
              const enabled = (config.defaultFeatureAccess || ALL_FEATURES).includes(feature);
              return <button key={feature} type="button" aria-pressed={enabled} onClick={() => toggleDefaultFeature(feature)} className={`border px-2.5 py-1 text-[11px] ${enabled ? "border-[#003366] bg-[#003366] font-semibold text-white" : "border-slate-300 text-slate-500"}`}>{FEATURE_CATALOG[feature].label}</button>;
            })}
            <span className="self-center text-[11px] italic text-slate-500">{(config.defaultFeatureAccess || ALL_FEATURES).length} of {ALL_FEATURES.length} enabled by default</span>
          </div>
        </div>

        {/* Add / Restrict User Page Access Form */}
        <div className="mt-4 bg-[#FFFCFB] border border-slate-200 p-4">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Add or Restrict User Page Access
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Select Member or Enter Email
              </label>
              <div className="space-y-1.5">
                {config.members.length > 0 && (
                  <select
                    className="w-full border border-gray-300 px-2.5 py-1.5 text-xs bg-[#FFFCFB] focus:outline-none"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const m = config.members.find((item) => normalizeEmail(item.email) === val);
                      if (m) {
                        setNewPageUserEmail(m.email);
                        setNewPageUserName(m.name);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">-- Quick pick from existing people --</option>
                    {config.members.map((m) => (
                      <option key={m.email} value={normalizeEmail(m.email)}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="email"
                  placeholder="user@primephilippines.com"
                  value={newPageUserEmail}
                  onChange={(e) => setNewPageUserEmail(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-1.5 text-xs bg-[#FFFCFB] focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                User Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Jane Doe"
                value={newPageUserName}
                onChange={(e) => setNewPageUserName(e.target.value)}
                className="w-full border border-gray-300 px-3 py-1.5 text-xs bg-[#FFFCFB] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-5 flex flex-col justify-end">
              <div className="text-[11px] font-semibold text-slate-600 mb-1">
                Allowed Pages:
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {APP_PAGE_LIST.map((page) => {
                  const isChecked = newPageSelectedPages.includes(page.id);
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          if (newPageSelectedPages.length > 1) {
                            setNewPageSelectedPages(newPageSelectedPages.filter((p) => p !== page.id));
                          }
                        } else {
                          setNewPageSelectedPages([...newPageSelectedPages, page.id]);
                        }
                      }}
                      className={`text-[11px] px-2 py-1 border font-medium transition-colors cursor-pointer ${
                        isChecked
                          ? "bg-[#003366] text-white border-[#003366]"
                          : "bg-[#FFFCFB] text-slate-600 border-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {page.label}
                    </button>
                  );
                })}
                <div className="basis-full pt-2 text-[11px] font-semibold text-slate-600">Allowed Features:</div>
                {ALL_FEATURES.map((feature) => {
                  const enabled = newPageSelectedFeatures.includes(feature);
                  const page = FEATURE_CATALOG[feature].requiredPage;
                  const unavailable = Boolean(page && !newPageSelectedPages.includes(page));
                  return <button key={feature} type="button" disabled={unavailable} aria-pressed={enabled && !unavailable} title={unavailable ? `Requires ${page}` : undefined} onClick={() => setNewPageSelectedFeatures(enabled ? newPageSelectedFeatures.filter((item) => item !== feature) : [...newPageSelectedFeatures, feature])} className={`text-[11px] px-2 py-1 border ${unavailable ? "cursor-not-allowed border-slate-200 text-slate-300" : enabled ? "border-[#C9AB4C] bg-[#C9AB4C]/20 text-[#003366]" : "border-slate-300 text-slate-600"}`}>{FEATURE_CATALOG[feature].label}</button>;
                })}
                <button
                  type="button"
                  onClick={addPagePermission}
                  className="btn-primary text-xs py-1 px-3 flex items-center gap-1 shadow-sm"
                >
                  <Plus size={13} /> Add Rule
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Configured Rules List */}
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Active User Restrictions ({config.pagePermissions?.length || 0})
          </div>

          {!config.pagePermissions || config.pagePermissions.length === 0 ? (
            <div className="border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 bg-[#FFFCFB]/50">
              No specific user overrides configured. All users without custom rules follow the default access policy configured above ({(config.defaultPageAccess || ["forms"]).length} of {APP_PAGE_LIST.length} permitted pages).
            </div>
          ) : (
            config.pagePermissions.map((rule) => (
              <div
                key={rule.email}
                className="border border-slate-200 bg-[#FFFCFB] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs"
              >
                <div className="min-w-[200px]">
                  <div className="text-xs font-bold text-[#003366]">
                    {rule.name ? `${rule.name} ` : ""}<span className="font-mono text-slate-600">({rule.email})</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Permitted pages: {rule.allowedPages.length} of {APP_PAGE_LIST.length}
                  </div>
                </div>

                {/* Page Toggle Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {APP_PAGE_LIST.map((page) => {
                    const isAllowed = rule.allowedPages.includes(page.id);
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => togglePageForUser(rule.email, page.id)}
                        title={`Click to ${isAllowed ? "restrict" : "grant"} ${page.label}`}
                        className={`text-[11px] px-2.5 py-1 border transition-all cursor-pointer ${
                          isAllowed
                            ? "bg-[#003366] text-white border-[#003366] font-semibold"
                            : "bg-[#FFFCFB] text-slate-400 border-slate-200 line-through hover:border-slate-300"
                        }`}
                      >
                        {page.label}
                      </button>
                    );
                  })}
                  <span className="basis-full pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Features</span>
                  {ALL_FEATURES.map((feature) => {
                    const isAllowed = (rule.allowedFeatures || config.defaultFeatureAccess || ALL_FEATURES).includes(feature);
                    const requiredPage = FEATURE_CATALOG[feature].requiredPage;
                    const unavailable = Boolean(requiredPage && !rule.allowedPages.includes(requiredPage));
                    return <button key={feature} type="button" disabled={unavailable} aria-pressed={isAllowed && !unavailable} onClick={() => toggleFeatureForUser(rule.email, feature)} title={unavailable ? `Requires ${requiredPage}` : `Click to ${isAllowed ? "restrict" : "grant"} ${FEATURE_CATALOG[feature].label}`} className={`text-[10px] px-2 py-1 border ${unavailable ? "cursor-not-allowed border-slate-100 text-slate-300" : isAllowed ? "border-[#C9AB4C] bg-[#C9AB4C]/20 text-[#003366] font-semibold" : "border-slate-200 text-slate-400 line-through"}`}>{FEATURE_CATALOG[feature].label}</button>;
                  })}
                </div>

                {/* Presets and Remove Rule */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPresetForUser(rule.email, ["forms"])}
                    className="text-[10px] text-slate-600 bg-[#FFFCFB] hover:bg-[#FFFCFB] px-2 py-1 border border-slate-300 cursor-pointer"
                  >
                    Forms Only
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPresetForUser(rule.email, [
                        "dashboard",
                        "tasks",
                        "meetings",
                        "minutes",
                        "forms",
                      ])
                    }
                    className="text-[10px] text-slate-600 bg-[#FFFCFB] hover:bg-[#FFFCFB] px-2 py-1 border border-slate-300 cursor-pointer"
                  >
                    Grant All
                  </button>
                  <button
                    type="button"
                    onClick={() => removePagePermission(rule.email)}
                    title="Remove restriction (restore full access)"
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Admin membership */}
      <section className={`panel ${settingsTab !== "rbac" ? "hidden" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-800">Admin Membership</h2>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">Owner only</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {config.admins.map((admin) => (
            <div key={admin.email} className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-xs bg-[#FFFCFB]">
              <span>
                {admin.name} · {admin.email}
              </span>
              {isOwner && (
                <button
                  onClick={() =>
                    save({ ...config, admins: config.admins.filter((item) => item.email !== admin.email) })
                  }
                  aria-label={`Remove ${admin.email}`}
                  className="cursor-pointer"
                >
                  <X size={13} className="text-red-500" />
                </button>
              )}
            </div>
          ))}
          {config.admins.length === 0 && (
            <span className="text-xs text-gray-400">No additional admins configured.</span>
          )}
        </div>
        {isOwner && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
            <input
              className="border border-gray-300 px-3 py-2 text-xs"
              placeholder="Admin name"
              value={newAdminName}
              onChange={(e) => setNewAdminName(e.target.value)}
            />
            <input
              className="border border-gray-300 px-3 py-2 text-xs"
              placeholder="email@primephilippines.com"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
            />
            <button className="btn-outline flex items-center justify-center gap-1 cursor-pointer" onClick={addAdmin}>
              <Plus size={14} /> Add Admin
            </button>
          </div>
        )}
      </section>

      {/* People & department assignments */}
      <section className={`panel ${settingsTab !== "rbac" ? "hidden" : ""}`}>
        <h2 className="text-lg font-bold text-slate-800 mb-3">People &amp; Department Assignments</h2>
        <div className="space-y-2 mb-4">
          {config.members.map((member) => (
            <div
              key={member.email}
              className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 px-3 py-2 text-xs bg-[#FFFCFB]"
            >
              <span>
                <b>{member.name}</b> · {member.email} ·{" "}
                <span className="uppercase text-[#003366] font-bold">{member.role}</span> ·{" "}
                {member.department || "Unassigned"}
              </span>
              <button
                onClick={() =>
                  save({ ...config, members: config.members.filter((item) => item.email !== member.email) })
                }
                aria-label={`Remove ${member.email}`}
                className="cursor-pointer"
              >
                <X size={13} className="text-red-500" />
              </button>
            </div>
          ))}
          {config.members.length === 0 && (
            <span className="text-xs text-gray-400">No people assigned yet. Add approvers and requestors here.</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <input
            className="border border-gray-300 px-3 py-2 text-xs"
            placeholder="Name"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
          />
          <input
            className="border border-gray-300 px-3 py-2 text-xs"
            placeholder="Email"
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
          />
          <select
            className="border border-gray-300 px-3 py-2 text-xs bg-[#FFFCFB]"
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value as Exclude<Role, "owner">)}
          >
            <option value="requestor">Requestor</option>
            <option value="approver">Approver</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex gap-2">
            <select
              className="border border-gray-300 px-3 py-2 text-xs bg-[#FFFCFB] flex-1"
              value={newMemberDepartment}
              onChange={(e) => setNewMemberDepartment(e.target.value)}
            >
              <option value="">Department</option>
              {config.departments.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
            <button className="btn-outline flex items-center gap-1 cursor-pointer" onClick={addMember}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className={`panel ${settingsTab !== "configurations" ? "hidden" : ""}`}>
        <h2 className="text-lg font-bold text-slate-800 mb-3">Departments</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {config.departments.map((department) => (
            <span key={department} className="inline-flex items-center gap-2 border border-gray-200 px-3 py-1.5 text-xs bg-[#FFFCFB]">
              {department}
              <button
                aria-label={`Remove ${department}`}
                onClick={() =>
                  save({
                    ...config,
                    departments: config.departments.filter((item) => item !== department),
                    mappings: config.mappings.filter((item) => item.department !== department),
                  })
                }
                className="cursor-pointer"
              >
                <X size={13} className="text-red-500" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 max-w-md">
          <input
            className="border border-gray-300 px-3 py-2 text-xs flex-1"
            placeholder="Add department"
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
          />
          <button className="btn-outline flex items-center gap-1 cursor-pointer" onClick={addDepartment}>
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      {/* Department forms & ClickUp destinations */}
      <section className={`panel ${settingsTab !== "configurations" ? "hidden" : ""}`}>
        <div className="flex gap-2 border-b border-gray-200 mb-4">
          {([['routing', 'Form Routing'], ['features', 'Features']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setFormsSubtab(id)} className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer ${formsSubtab === id ? "border-[#C9AB4C] text-[#003366]" : "border-transparent text-gray-500"}`}>{label}</button>)}
        </div>
        {formsSubtab === "features" ? <div className="space-y-3">
          <div><h2 className="text-lg font-bold text-slate-800">Form Features</h2><p className="text-xs text-gray-500 mt-1">Turn form capabilities on or off for all users.</p></div>
          <label className="flex items-center justify-between gap-4 border border-[#C9AB4C] bg-[#FFFCFB] p-4 cursor-pointer"><span><span className="block text-sm font-bold text-[#003366]">Ask Echo availability</span><span className="block text-xs text-gray-500 mt-1">Show or hide Ask Echo throughout Mosaic. Transcription remains available when disabled.</span></span><input type="checkbox" checked={config.features?.askEchoEnabled !== false} onChange={(e) => { setConfig({ ...config, features: { ...(config.features || { askEchoEnabled: true }), askEchoEnabled: e.target.checked } }); setNotice("Unsaved feature changes"); }} className="h-4 w-4 accent-[#003366]" /></label>
          {([["rfpAutofill", "RFP Autofill", "Allow requestors to prefill RFP fields from uploaded documents or demo data."], ["pdfPreview", "PDF Preview", "Allow users to generate a PDF preview before submitting."], ["emailNotifications", "Email Notifications", "Send automated request status emails to requestors."]] as const).map(([key, label, description]) => { const enabled = config.formFeatures?.[key] ?? true; return <label key={key} className="flex items-center justify-between gap-4 border border-gray-200 bg-[#FFFCFB] p-4 cursor-pointer"><span><span className="block text-sm font-bold text-[#003366]">{label}</span><span className="block text-xs text-gray-500 mt-1">{description}</span></span><input type="checkbox" checked={enabled} onChange={(e) => { const next = { ...config, formFeatures: { ...(config.formFeatures || DEFAULT_CONFIG.formFeatures!), [key]: e.target.checked } }; setConfig(next); setNotice("Unsaved feature changes"); }} className="h-4 w-4 accent-[#003366]" /></label>; })}
        </div> : <>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Department Forms &amp; ClickUp Destinations</h2>
        <p className="text-xs text-gray-500 mb-4">
          Every department/form mapping requires its own ClickUp List ID.
        </p>
        <div className="space-y-2 mb-4">
          {config.departments.map((department) => {
            const expanded = openDepartments[department] ?? false;
            const savedMappings = config.mappings.filter((item) => item.department === department);
            const catalogMappings = REPOSITORY_FORMS.filter((form) => form.department === department).map((form) => ({ id: `${department.toLowerCase()}-${form.id}`, department, formType: form.id, formLabel: form.label, listId: form.clickUpListId, approvers: [] }));
            const departmentMappings = [...catalogMappings, ...savedMappings.filter((saved) => !catalogMappings.some((catalog) => catalog.formType === saved.formType))];
            return <div key={department} className="border border-gray-200 bg-[#FFFCFB]">
              <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer" onClick={() => setOpenDepartments((state) => ({ ...state, [department]: !expanded }))}>
                <span className="text-sm font-bold text-[#003366]">{department}</span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {expanded && <div className="border-t border-gray-200 divide-y divide-gray-100">
                {(departmentMappings.length ? departmentMappings : [{ id: `${department}-new`, department, formType: "rfp", formLabel: FORM_LABELS.rfp, listId: "", approvers: [] }]).map((mapping) => <div key={mapping.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3 items-center px-4 py-3">
                  <button type="button" className="text-left text-xs font-semibold text-slate-700 cursor-pointer" onClick={() => { setSelectedDepartment(department); setSelectedForm(mapping.formType); }}>{mapping.formLabel || FORM_LABELS[mapping.formType] || mapping.formType}</button>
                  <input className="border border-gray-300 px-3 py-2 text-xs bg-white" placeholder="ClickUp List ID" value={mapping.listId || ""} onChange={(e) => updateMapping({ ...mapping, listId: e.target.value })} />
                </div>)}
              </div>}
            </div>;
          })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 border-t pt-4">
          <input
            className="border border-gray-300 px-3 py-2 text-xs"
            placeholder="New custom form name"
            value={newFormName}
            onChange={(e) => setNewFormName(e.target.value)}
          />
          <input
            className="border border-gray-300 px-3 py-2 text-xs"
            placeholder="Required ClickUp List ID"
            value={newFormListId}
            onChange={(e) => setNewFormListId(e.target.value)}
          />
          <button className="btn-outline cursor-pointer" onClick={addCustomForm}>
            Add form
          </button>
        </div>

        {/* 6-stage approvers routing */}
        <div className="space-y-2 mt-4">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Six-Stage Approver Routing
          </div>
          {STAGES.map((stageName, index) => {
            const stage = current.approvers[index] || { stage: index, emails: [], requireAll: false };
            return (
              <div
                key={stageName}
                className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_auto] gap-2 items-center border border-gray-200 p-3 bg-[#FFFCFB]"
              >
                <div>
                  <div className="text-xs font-bold text-[#003366]">
                    {index + 1}. {stageName}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {stage.requireAll ? "All assigned approvers required" : "Any one approver can advance"}
                  </div>
                </div>
                <input
                  className="border border-gray-300 px-3 py-2 text-xs"
                  placeholder="approver@primephilippines.com (comma separated)"
                  value={stage.emails.join(", ")}
                  onChange={(e) => {
                    const emails = e.target.value.split(",").map(normalizeEmail).filter(Boolean);
                    const next = {
                      ...current,
                      approvers: current.approvers.map((item) =>
                        item.stage === index ? { ...item, emails } : item
                      ),
                    };
                    updateMapping(next);
                  }}
                />
                <label className="text-[11px] flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stage.requireAll}
                    onChange={(e) => {
                      const next = {
                        ...current,
                        approvers: current.approvers.map((item) =>
                          item.stage === index ? { ...item, requireAll: e.target.checked } : item
                        ),
                      };
                      updateMapping(next);
                    }}
                  />{" "}
                  All required
                </label>
              </div>
            );
          })}
        </div>
        </>}
      </section>

      <section className={`panel ${settingsTab !== "email" ? "hidden" : ""}`}>
        <div className="flex items-center gap-2 mb-1"><Mail size={18} className="text-[#003366]" /><h2 className="text-lg font-bold text-slate-800">Automated Requestor Email</h2></div>
        <p className="text-xs text-gray-500 mb-4">Configure a separate dynamic email for each department, form, and request event.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label className="text-xs font-bold text-gray-600">Department<select className="mt-1 w-full border border-gray-300 px-3 py-2 bg-[#FFFCFB] font-normal" value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>{config.departments.map((department) => <option key={department}>{department}</option>)}</select></label>
          <label className="text-xs font-bold text-gray-600">Form<select className="mt-1 w-full border border-gray-300 px-3 py-2 bg-[#FFFCFB] font-normal" value={selectedForm} onChange={(e) => setSelectedForm(e.target.value)}>{Object.entries(FORM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}{selectedDepartment === "IT" && <option value="it-asset-request-form">IT Asset Request Form</option>}{config.mappings.filter((item) => item.department === selectedDepartment && !FORM_LABELS[item.formType] && item.formType !== "it-asset-request-form").map((item) => <option key={item.formType} value={item.formType}>{item.formLabel || item.formType}</option>)}</select></label>
          <label className="text-xs font-bold text-gray-600">Event<select className="mt-1 w-full border border-gray-300 px-3 py-2 bg-[#FFFCFB] font-normal" value={emailEvent} onChange={(e) => setEmailEvent(e.target.value as EmailEvent)}><option value="submitted">Submitted</option><option value="approved">Approved / Stage changed</option><option value="revision_requested">Revision requested</option><option value="completed">Completed</option></select></label>
        </div>
        <label className="mb-4 flex items-center gap-2 text-xs font-bold text-[#003366]"><input type="checkbox" checked={emailTemplate.enabled} onChange={(e) => updateEmailTemplate({ enabled: e.target.checked })} /> Send this email automatically</label>
        <label className="block text-xs font-bold text-gray-600 mb-3">Subject<input className="mt-1 w-full border border-gray-300 px-3 py-2 font-normal" value={emailTemplate.subject} onChange={(e) => updateEmailTemplate({ subject: e.target.value })} /></label>
        <label className="block text-xs font-bold text-gray-600">Email body<textarea rows={16} className="mt-1 w-full border border-gray-300 px-3 py-2 font-mono text-xs font-normal leading-relaxed" value={emailTemplate.body} onChange={(e) => updateEmailTemplate({ body: e.target.value })} /></label>
        <div className="mt-3 border border-slate-200 bg-[#FFFCFB] p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Dynamic fields</div><div className="flex flex-wrap gap-1.5">{["requestor_first_name", "form_name", "form_id", "department", "status_label", "request_title", "amount", "purpose", "submitted_at", "status_updated_at", "completed_stage", "approver_name", "completed_at", "current_stage", "current_stage_started_at", "status_message", "next_step_message", "track_status_url"].map((field) => <button type="button" key={field} onClick={() => updateEmailTemplate({ body: `${emailTemplate.body}{{${field}}}` })} className="border border-slate-300 bg-[#FFFCFB] px-2 py-1 text-[10px] text-[#003366]">{`{{${field}}}`}</button>)}</div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={sendTestEmail} className="border border-[#003366] bg-[#FFFCFB] px-4 py-2 text-xs font-bold text-[#003366] hover:bg-[#FFFCFB]">Send test email to my login</button>{emailTestStatus && <span className="text-xs text-slate-600">{emailTestStatus}</span>}</div>
      </section>
        </div>
    </div>
    </div>
  );
}

export default function FormsPortal({
  user,
  initialTab = "track",
}: {
  user?: { username?: string; email?: string } | null;
  initialTab?: PortalTab;
}) {
  const [tab, setTab] = useState<PortalTab>(initialTab);
  const searchParams = useSearchParams();

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const requested = searchParams.get("tab") as PortalTab | null;
    if (requested && ["create", "track", "approvals", "admin"].includes(requested)) {
      setTab(requested);
    }
  }, [searchParams]);

  const [configuredAdmins, setConfiguredAdmins] = useState<AdminUser[]>([]);
  const [configuredMembers, setConfiguredMembers] = useState<AdminUser[]>([]);
  const [serverAdmin, setServerAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/forms/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setConfiguredAdmins(data?.config?.admins || []);
        setConfiguredMembers(data?.config?.members || []);
        setServerAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {});
  }, []);

  const isAdmin =
    serverAdmin || normalizeEmail(user?.email) === OWNER_EMAIL ||
    configuredAdmins.some((admin) => admin.active && normalizeEmail(admin.email) === normalizeEmail(user?.email));

  // Do not render Settings at all for non-admin accounts, including direct URL attempts.
  if (tab === "admin" && !isAdmin) return null;

  const tabs: Array<{ id: PortalTab; label: string; icon: typeof FileEdit }> = [
    { id: "track", label: "Track Status", icon: PackageSearch },
    { id: "create", label: "New Form", icon: FileEdit },
  ];

  const canApprove = isAdmin || Boolean(user?.email && configuredMembers.some((member) =>
    member.active !== false && member.role === "approver" && normalizeEmail(member.email) === normalizeEmail(user.email)
  ));

  return (
    <div className="-mt-5 space-y-4">
      {tab === "admin" ? (
        <AdminConfiguration userEmail={user?.email || ""} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
            <div>
              <h1 className="text-2xl font-serif italic font-bold text-[#003366] flex items-center gap-2">
                <ClipboardList size={22} className="text-[#C9AB4C]" /> Forms
              </h1>
              <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">
                Requests, Tracking &amp; Approvals
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 border cursor-pointer ${
                    tab === id
                      ? "bg-[#003366] text-white border-[#003366]"
                      : "bg-[#FFFCFB] text-[#003366] border-gray-200 hover:border-[#C9AB4C]"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
              {canApprove && (
                <button
                  onClick={() => setTab("approvals")}
                  className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 border cursor-pointer ${
                    tab === "approvals"
                      ? "bg-[#003366] text-white border-[#003366]"
                      : "bg-[#FFFCFB] text-[#003366] border-gray-200 hover:border-[#C9AB4C]"
                  }`}
                >
                  <ShieldCheck size={14} />
                  Approvals
                </button>
              )}
            </div>
          </div>

          {tab === "create" && <FormsCreateView user={{ name: user?.username, email: user?.email }} />}
          {tab === "track" && <FormsTrackView />}
          {tab === "approvals" && canApprove && <FormsApprovalsView />}
        </>
      )}
    </div>
  );
}
