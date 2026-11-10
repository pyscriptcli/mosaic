"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Download } from "lucide-react";
import { useBrowserPageQuery } from "@/lib/browserPageCache";
import { calculateSiteAmount, sitesForSubproject } from "@/lib/projectSites";

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

export function SubprojectSites({ folderId, listId, listName, userId }: { folderId: string; listId: string; listName: string; userId?: string }) {
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

  const startColumnResize = (event: ReactPointerEvent<HTMLSpanElement>, index: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingColumn.current = { index, startX: event.clientX, startWidth: columnWidths[index] };
  };

  const moveColumnResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
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
        {sites.length > 0 && !sites.every((site) => Boolean(site.taskId)) && (
          <button type="button" onClick={() => void createClosedTasks("list")} disabled={syncing || hasPendingSiteRows} className="min-h-9 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white hover:bg-[#174778] disabled:cursor-wait disabled:opacity-60">{syncing ? "Setting up this subproject…" : hasPendingSiteRows ? "Site rows syncing…" : "Set up site rows for this subproject"}</button>
        )}
        {sites.length > 0 && !sites.every((site) => Boolean(site.taskId)) && <button type="button" onClick={() => void createClosedTasks("all")} disabled={syncing || hasPendingSiteRows} className="min-h-9 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] hover:border-[#003366] disabled:cursor-wait disabled:opacity-60">Set up all subprojects</button>}
      </div>
    </header>
    {syncMessage && <p role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">{syncMessage}</p>}
    {syncError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{syncError}</p>}
    {hasPendingSiteRows && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">Site rows are syncing to ClickUp. Editing unlocks as each row finishes syncing.</p>}
    {hasFailedSiteRows && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">Some site rows could not sync to ClickUp. Retry setup for this subproject to try those rows again.</p>}
    {sites.length ? <div><div className="space-y-2 p-3 md:hidden">{sites.map((site) => <article key={`mobile-${site.tradeArea}-${site.siteNo}`} className="border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-[#003366]">{site.siteNo} · {site.siteName}</p><p className="mt-1 text-[10px] text-slate-500">{site.priority}</p></div><span className="text-[10px] text-slate-500">{site.taskId ? "ClickUp linked" : "Not linked"}</span></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{(["lessor", "status", "monthlyRate", "pfStructure", "amount"] as const).map((field) => <label key={field} className="text-[10px] font-semibold text-slate-500">{editableSiteFieldLabels[field]}{field === "lessor" || field === "status" ? <textarea aria-label={`${editableSiteFieldLabels[field]} for site ${site.siteNo}`} value={site[field] || ""} disabled={!site.taskId} onChange={(event) => updateSiteField(site, field, event.currentTarget.value)} onBlur={() => flushSiteField(site, field)} rows={1} className="mt-1 min-h-9 w-full resize-y border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-800 disabled:bg-slate-50" /> : <input aria-label={`${editableSiteFieldLabels[field]} for site ${site.siteNo}`} value={field === "pfStructure" ? numericSiteValue(site[field], "months") : field === "amount" || focusedCurrencyField !== `${site.taskId}:${field}` ? formatSitePhp(site[field]) : numericSiteValue(site[field], "php")} readOnly={field === "amount"} disabled={!site.taskId} type={field === "pfStructure" ? "number" : "text"} inputMode="decimal" onFocus={field === "monthlyRate" ? (event) => { setFocusedCurrencyField(`${site.taskId}:${field}`); event.currentTarget.select(); } : undefined} onChange={(event) => updateSiteField(site, field, event.currentTarget.value)} onBlur={() => { setFocusedCurrencyField(""); flushSiteField(site, field); }} className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 read-only:bg-slate-50 disabled:bg-slate-50" />}</label>)}</div></article>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-xs"><colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead className="bg-slate-50 text-[10px] font-semibold text-slate-600"><tr>{siteColumns.map((column, index) => <th key={column} scope="col" className="relative border border-slate-200/70 px-3 py-2.5">{column}<span
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
          readOnly={field === "amount"}
          title={field === "amount" ? "Calculated from Monthly Rate (Php) × PF months" : undefined}
          disabled={!site.taskId}
          onFocus={field === "monthlyRate" ? (event) => { setFocusedCurrencyField(`${site.taskId}:${field}`); event.currentTarget.select(); } : undefined}
          onChange={(event) => updateSiteField(site, field, field === "monthlyRate" ? sanitizeSiteNumber(event.currentTarget.value) : event.currentTarget.value)}
          onBlur={() => { flushSiteField(site, field); if (field === "monthlyRate") setFocusedCurrencyField(null); }}
          className={`block min-h-7 w-full min-w-0 border border-transparent bg-transparent px-1.5 py-1 text-xs leading-5 tabular-nums text-slate-700 hover:border-slate-200/70 focus:border-[#C9A33B] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C9A33B] read-only:cursor-default read-only:hover:border-transparent disabled:cursor-not-allowed disabled:text-slate-500 ${field === "pfStructure" ? "pr-14" : ""}`}
        />{field === "pfStructure" && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-6 flex items-center text-[10px] text-slate-500">months</span>}</div>}
      </td>)}
    </tr>)}</tbody></table></div></div> : <div className="px-4 py-8 text-center"><h3 className="text-sm font-semibold text-[#003366]">No site records mapped to this subproject</h3><p className="mt-1 text-xs text-slate-500">The imported file currently covers Commonwealth, Katipunan, North Harbour, Mandaluyong D. Guevara, and Buendia Filmore.</p></div>}
  </section>;
}
