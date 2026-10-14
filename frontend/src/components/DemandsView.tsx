"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBrowserPageQuery } from "@/lib/browserPageCache";
import { requestCentralClickUpSync, trackClickUpLiveRefresh } from "@/lib/clickupSyncClient";
import { 
  DemandRecord, 
  DemandAssetClass, 
  DemandViewMode, 
  DatePreset, 
  DemandsFilterState, 
  NewDemandInput 
} from "@/types/demands";
import { 
  getDefaultHorizonDates, 
  filterDemands, 
  calculateDemandMetrics 
} from "@/lib/demands/demandUtils";
import { DemandsSummary } from "./demands/DemandsSummary";
import { NewDemandModal } from "./demands/NewDemandModal";
import { EditDemandTrackingModal } from "./demands/EditDemandTrackingModal";
import { DEMANDS_CLICKUP_LIST_ID, formatDemandClickUpTitle, formatDemandClickUpDescription } from "@/lib/demands/clickupSync";
import { 
  Building2,
  Table2,
  LayoutDashboard,
  FolderArchive, 
  Plus, 
  Download, 
  Search, 
  Calendar, 
  AlertCircle,
  ArrowUpDown,
  Layers, 
  RefreshCw,
  ExternalLink, 
  MapPin,
  RotateCcw,
  Pencil,
} from "lucide-react";

export interface DemandsViewProps {
  sector?: "all" | "retail" | "industrial";
  userId?: string;
}

export function DemandsView({ sector = "all", userId }: DemandsViewProps) {
  const router = useRouter();
  const activeAssetClass: DemandAssetClass = sector;

  const selectAssetClass = (assetClass: DemandAssetClass) => {
    router.push(assetClass === "all" ? "/demands" : `/demands/${assetClass}`);
  };

  const [viewMode, setViewMode] = useState<DemandViewMode>("dashboard");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [trackingDemand, setTrackingDemand] = useState<DemandRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const defaultHorizon = useMemo(() => getDefaultHorizonDates(), []);
  
  const [filters, setFilters] = useState<DemandsFilterState>({
    search: "",
    type: "",
    region: "",
    priority: "",
    status: "",
    dateStart: defaultHorizon.start,
    dateEnd: defaultHorizon.end,
    preset: defaultHorizon.preset
  });

  const [sortCol, setSortCol] = useState<string>("date");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const requestDemands = useCallback(async () => {
    const response = await fetch("/api/demands", { cache: "no-store" });
    const data: { demands?: DemandRecord[]; error?: string } = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "Unable to load demands."), { status: response.status });
    return Array.isArray(data.demands) ? data.demands : [];
  }, []);

  const demandQuery = useBrowserPageQuery<{ demands: DemandRecord[] }>(userId, "demands:all", async () => ({ demands: await requestDemands() }), Boolean(userId));
  const demands = demandQuery.data?.demands || [];
  const isLoadingDemands = demandQuery.loading;
  const loadError = demandQuery.data ? null : demandQuery.error || null;

  useEffect(() => {
    const refreshAfterSync = (event: Event) => { trackClickUpLiveRefresh(event, () => demandQuery.refresh()); };
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
  }, [demandQuery.refresh]);

  const handleSetPreset = (preset: DatePreset) => {
    let start = "";
    let end = "";
    const now = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (preset === "last-and-current") {
      start = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (preset === "last-90") {
      start = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89));
      end = formatDate(now);
    } else if (preset === "year") {
      start = formatDate(new Date(now.getFullYear(), 0, 1));
      end = formatDate(new Date(now.getFullYear(), 11, 31));
    } else if (preset === "all") {
      start = "";
      end = "";
    }

    setFilters((prev) => ({
      ...prev,
      preset,
      dateStart: start,
      dateEnd: end
    }));
  };

  const handleCustomDateChange = (field: "dateStart" | "dateEnd", value: string) => {
    setFilters((prev) => ({
      ...prev,
      preset: "custom",
      [field]: value
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: "",
      type: "",
      region: "",
      priority: "",
      status: "",
      dateStart: defaultHorizon.start,
      dateEnd: defaultHorizon.end,
      preset: defaultHorizon.preset
    });
  };

  const filteredDemands = useMemo(() => {
    const list = filterDemands(demands, filters, activeAssetClass);
    return list.sort((a, b) => {
      const valueA = a[sortCol as keyof DemandRecord];
      const valueB = b[sortCol as keyof DemandRecord];
      const comparison = sortCol === "minSqm" || sortCol === "maxSqm"
        ? (Number(valueA) || 0) - (Number(valueB) || 0)
        : String(valueA ?? "").localeCompare(String(valueB ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sortAsc ? comparison : -comparison;
    });
  }, [demands, filters, activeAssetClass, sortCol, sortAsc]);

  const metrics = useMemo(() => {
    return calculateDemandMetrics(filteredDemands, demands);
  }, [filteredDemands, demands]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const handleCreateDemand = async (input: NewDemandInput) => {
    const response = await fetch("/api/demands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save this demand.");
    if (Array.isArray(data.created) && data.created.length > 0) {
      demandQuery.update((current) => ({ demands: [...data.created, ...(current?.demands || [])] }));
    }
  };

  const handleSaveTracking = async (demand: DemandRecord, status: string, actionTaken: string) => {
    const updated = { ...demand, status, actionTaken };
    const response = await fetch("/api/demands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    const data: { demand?: DemandRecord; error?: string } = await response.json();
    if (!response.ok || !data.demand) throw new Error(data.error || "Unable to update this demand.");
    demandQuery.update((current) => ({ demands: (current?.demands || []).map((record) => record.id === demand.id ? data.demand! : record) }));
  };

  const handleRefreshDemands = async () => {
    setIsSyncing(true);
    setSyncStatusMsg("Refreshing demands from ClickUp…");
    try {
      await requestCentralClickUpSync();
      setSyncStatusMsg("Demands refreshed from ClickUp.");
    } catch (error) {
      setSyncStatusMsg(error instanceof Error ? error.message : "Unable to start ClickUp sync.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "DATE INQUIRED",
      "YEAR AND QUARTER",
      "ASSOC IN CHARGE",
      "SOURCE",
      "TYPE",
      "INDUSTRY",
      "CLIENT",
      "MIN. REQUIREMENT",
      "MAX. REQUIREMENT",
      "TARGET LOCATIONS",
      "PRIORITY",
      "PURPOSE",
      "STATUS",
      "ACTION TAKEN",
      "REMARKS"
    ];

    const rows = filteredDemands.map((d) => [
      d.date,
      d.quarter || "",
      d.assoc,
      d.source || "",
      d.type,
      d.industry,
      `"${(d.client || "").replace(/"/g, '""')}"`,
      d.minSqm,
      d.maxSqm,
      `"${(d.locations?.length ? d.locations.map((location) => `${location.gloc} / ${location.city} / ${location.area}`).join("; ") : `${d.gloc} / ${d.city} / ${d.location}`).replace(/"/g, '""')}"`,
      d.priority,
      `"${(d.purpose || "").replace(/"/g, '""')}"`,
      `"${(d.status || "").replace(/"/g, '""')}"`,
      `"${(d.actionTaken || "").replace(/"/g, '""')}"`,
      `"${(d.remarks || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Mosaic_Demands_${activeAssetClass.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 text-slate-800 antialiased">
      
      {/* 1. TOP HEADER & SUBPAGE ROUTE SWITCHER */}
      <header className="flex min-h-[58px] flex-col justify-between gap-3 border-b border-[#003366]/15 pb-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#C9AB4C]/60 bg-[#FBF7E9] text-[#003366]"><Building2 className="h-4 w-4" /></span>
          <div className="min-w-0 border-l-2 border-[#C9AB4C] py-0.5 pl-2.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Client requirements</p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-[#003366]">Demands</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-slate-300 bg-white p-0.5" role="group" aria-label="Filter by demand type">
            <button
              type="button"
              aria-pressed={activeAssetClass === "all"}
              onClick={() => selectAssetClass("all")}
              className={`inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                activeAssetClass === "all"
                  ? "bg-[#003366] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#003366] hover:bg-slate-50"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              All
            </button>

            <button
              type="button"
              aria-pressed={activeAssetClass === "retail"}
              onClick={() => selectAssetClass("retail")}
              className={`inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                activeAssetClass === "retail"
                  ? "bg-[#003366] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#003366] hover:bg-slate-50"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              Retail
            </button>

            <button
              type="button"
              aria-pressed={activeAssetClass === "industrial"}
              onClick={() => selectAssetClass("industrial")}
              className={`inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                activeAssetClass === "industrial"
                  ? "bg-[#003366] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#003366] hover:bg-slate-50"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Industrial
            </button>
          </div>

          <button type="button" onClick={handleRefreshDemands} disabled={isSyncing} aria-label="Refresh demands" title="Refresh demands" className="inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366] disabled:cursor-wait disabled:opacity-60">
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-8 min-h-8 items-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]"
          >
            <Plus className="w-4 h-4" />
            New Demand
          </button>
        </div>
      </header>



            {/* 2. HORIZON & DATE RANGE PICKER BAR (DEFAULT: LAST MONTH & CURRENT MONTH) */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
        
        {/* Left: Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
            <Calendar className="w-4 h-4 text-[#003366]" />
            <span className="sr-only">Date range</span>
          </div>

          <div className="inline-flex border border-slate-300 bg-[#FFFCFB]">
            <button
              type="button"
              onClick={() => handleSetPreset("last-and-current")}
              className={`inline-flex min-h-8 items-center border-r border-slate-200 px-2.5 text-[11px] transition-colors ${
                filters.preset === "last-and-current"
                  ? "bg-[#003366] text-white font-bold shadow-2xs"
                  : "text-slate-700 font-medium hover:bg-slate-50"
              }`}
            >
              Last + current
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset("last-90")}
              className={`inline-flex min-h-8 items-center border-r border-slate-200 px-2.5 text-[11px] transition-colors ${
                filters.preset === "last-90"
                  ? "bg-[#003366] text-white font-bold shadow-2xs"
                  : "text-slate-700 font-medium hover:bg-slate-50"
              }`}
            >
              90 days
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset("year")}
              className={`inline-flex min-h-8 items-center border-r border-slate-200 px-2.5 text-[11px] transition-colors ${
                filters.preset === "year"
                  ? "bg-[#003366] text-white font-bold shadow-2xs"
                  : "text-slate-700 font-medium hover:bg-slate-50"
              }`}
            >
              This year
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset("all")}
              className={`inline-flex min-h-8 items-center px-2.5 text-[11px] transition-colors ${
                filters.preset === "all"
                  ? "bg-[#003366] text-white font-bold shadow-2xs"
                  : "text-slate-700 font-medium hover:bg-slate-50"
              }`}
            >
              All time
            </button>
          </div>

        </div>

        {/* Right: Interactive Date Inputs & View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Custom Date Range Inputs */}
          <div className="flex items-center gap-2">
            <label className="flex h-8 items-center gap-1.5 border border-slate-200 bg-white px-2.5">
              <span className="text-[10px] uppercase font-semibold text-slate-500">From</span>
              <input
                type="date"
                value={filters.dateStart}
                onChange={(e) => handleCustomDateChange("dateStart", e.target.value)}
                className="w-[118px] bg-transparent text-[11px] text-slate-800 focus:outline-none"
              />
            </label>
            <label className="flex h-8 items-center gap-1.5 border border-slate-200 bg-white px-2.5">
              <span className="text-[10px] uppercase font-semibold text-slate-500">To</span>
              <input
                type="date"
                value={filters.dateEnd}
                onChange={(e) => handleCustomDateChange("dateEnd", e.target.value)}
                className="w-[118px] bg-transparent text-[11px] text-slate-800 focus:outline-none"
              />
            </label>
          </div>

          <div role="tablist" aria-label="Demand views" className="flex items-center border-b border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("dashboard")}
              role="tab" aria-selected={viewMode === "dashboard"}
              className={`inline-flex min-h-8 items-center gap-1.5 border-b-2 px-2.5 text-[11px] font-semibold transition-colors ${
                viewMode === "dashboard"
                  ? "border-[#C9A84C] text-[#003366]"
                  : "border-transparent text-slate-500 hover:text-[#003366]"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Overview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              role="tab" aria-selected={viewMode === "table"}
              className={`inline-flex min-h-8 items-center gap-1.5 border-b-2 px-2.5 text-[11px] font-semibold transition-colors ${
                viewMode === "table"
                  ? "border-[#C9A84C] text-[#003366]"
                  : "border-transparent text-slate-500 hover:text-[#003366]"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("clickup")}
              role="tab" aria-selected={viewMode === "clickup"}
              className={`inline-flex min-h-8 items-center gap-1.5 border-b-2 px-2.5 text-[11px] font-semibold transition-colors ${
                viewMode === "clickup"
                  ? "border-[#C9A84C] text-[#003366]"
                  : "border-transparent text-slate-500 hover:text-[#003366]"
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              Records
            </button>
          </div>

        </div>

      </div>

      {loadError && (
        <div role="alert" className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => void handleRefreshDemands()} className="font-semibold underline">Retry</button>
        </div>
      )}

      {/* REFRESH NOTIFICATION */}
      {syncStatusMsg && <p role="status" className="text-xs text-slate-500">{syncStatusMsg}</p>}

      {/* VIEW 1: EXECUTIVE VISUAL DASHBOARD */}
      {viewMode === "dashboard" && (
        <div className="space-y-3">
          <DemandsSummary
            metrics={metrics}
            statusCounts={[...filteredDemands.reduce((counts, demand) => counts.set(demand.status || "Unspecified", (counts.get(demand.status || "Unspecified") ?? 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b))}
          />

        </div>
      )}

      {/* VIEW 2: EXCEL-STYLE DENSE DATA GRID */}
      {viewMode === "table" && (
        <div className="space-y-4">
          
          {/* Table Controls & Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Search Bar */}
              <label className="flex h-9 items-center gap-2 border border-slate-200 bg-white px-2.5 focus-within:border-[#003366]">
                <Search aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search demands"
                  placeholder="Search demands"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-48 text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
              </label>

              {/* Type Filter */}
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="h-9 border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="">All Types (CL, CS, INDL)</option>
                <option value="CL">CL (Commercial Lease)</option>
                <option value="CS">CS (Commercial Space)</option>
                <option value="INDL">INDL (Industrial)</option>
              </select>

              {/* Region Filter */}
              <select
                value={filters.region}
                onChange={(e) => setFilters({ ...filters, region: e.target.value })}
                className="h-9 border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="">All Regions (G.LOC)</option>
                <option value="MM">MM (Metro Manila)</option>
                <option value="N">N (North Luzon / Bulacan / Pampanga)</option>
                <option value="S">S (South Luzon / Laguna / Cavite / Batangas)</option>
                <option value="GMM">GMM (Greater Metro Manila / Rizal)</option>
                <option value="SL">SL (South Luzon Corridor)</option>
              </select>

              {/* Priority Filter */}
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="h-9 border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="">All Priorities</option>
                <option value="Priority">Priority (Urgent)</option>
                <option value="Normal">Normal</option>
                <option value="Low">Low</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="h-9 border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="">All Statuses</option>
                {[...new Set(demands.map((demand) => demand.status).filter(Boolean))].sort().map((status) => <option key={status} value={status}>{status}</option>)}
              </select>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-9 items-center gap-1 border border-slate-200 bg-white px-2.5 text-xs text-slate-600 transition-colors hover:border-[#003366] hover:text-[#003366]"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>

            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-slate-500">
                {filteredDemands.length} of {demands.length}
              </span>

              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex h-9 items-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366]"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV (Excel)
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-[#003366] text-white text-[11px] uppercase tracking-wider select-none">
                <tr>
                  <th className="p-3 border-r border-blue-900 w-12 text-center">#</th>
                  <th onClick={() => handleSort("date")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors whitespace-nowrap">
                    <div className="flex items-center gap-1">Date Inquired <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("assoc")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors whitespace-nowrap">
                    <div className="flex items-center gap-1">Assoc <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("type")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">Type <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("client")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors whitespace-nowrap min-w-[180px]">
                    <div className="flex items-center gap-1">Client / Brand <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("industry")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors whitespace-nowrap">
                    <div className="flex items-center gap-1">Industry <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("minSqm")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">Min (sqm) <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th onClick={() => handleSort("maxSqm")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">Max (sqm) <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th className="p-3 border-r border-blue-900 min-w-[260px]">Target Locations</th>
                  <th onClick={() => handleSort("priority")} className="p-3 border-r border-blue-900 cursor-pointer hover:bg-blue-900 transition-colors text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">Priority <ArrowUpDown className="w-3 h-3 opacity-70" /></div>
                  </th>
                  <th className="p-3 border-r border-blue-900 whitespace-nowrap">Purpose</th>
                  <th className="p-3 border-r border-blue-900 whitespace-nowrap">Timeline</th>
                  <th className="p-3 border-r border-blue-900 whitespace-nowrap">Status</th>
                  <th className="p-3 border-r border-blue-900 whitespace-nowrap">Action Taken</th>
                  <th className="p-3 min-w-[220px]">Remarks / Specifications</th>
                  <th className="p-3 text-center">Update</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {isLoadingDemands ? (
                  <tr><td colSpan={16} className="p-12 text-center text-slate-500">Loading demand records…</td></tr>
                ) : filteredDemands.map((d, i) => {
                  const isPriority = d.priority === "Priority";
                  const isIndustrial = d.type === "INDL";
                  const isRollout = d.fulfillmentMode === "rollout";
                  const isEither = d.fulfillmentMode === "either";

                  return (
                    <tr 
                      key={d.id} 
                      className={`hover:bg-amber-50/40 transition-colors ${
                        isPriority ? "bg-rose-50/30" : ""
                      }`}
                    >
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono text-slate-400">
                        {i + 1}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                        {d.date}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 font-bold text-[#003366] whitespace-nowrap">
                        {d.assoc}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-bold border ${
                          isIndustrial
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : d.type === "CL"
                            ? "bg-blue-100 text-blue-900 border-blue-300"
                            : "bg-emerald-100 text-emerald-900 border-emerald-300"
                        }`}>
                          {d.type}
                        </span>
                      </td>

                      <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{d.client}</span>
                          {isRollout && (
                            <span className="text-[9px] font-mono text-[#003366] bg-blue-50 px-1 border border-blue-200" title="Multi-Store Rollout Site">
                              Rollout
                            </span>
                          )}
                          {isEither && (
                            <span className="text-[9px] font-mono text-amber-900 bg-amber-50 px-1 border border-amber-200" title="Either-Or Mandate">
                              Either-Or
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                        {d.industry}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono text-slate-700">
                        {Number(d.minSqm).toLocaleString()}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-[#003366]">
                        {Number(d.maxSqm).toLocaleString()}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-700">
                        <div className="space-y-1.5">
                          {(d.locations?.length ? d.locations : [{ gloc: d.gloc, city: d.city, area: d.location }]).map((location, index) => (
                            <div key={"id" in location ? location.id : index} className="flex items-start gap-1.5">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#C9AB4C]" />
                              <span><b>{location.city}</b><span className="text-slate-500"> · {location.gloc} · {location.area}</span></span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                        {isPriority ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                            PRIORITY
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[9px] font-medium text-slate-600">
                            Normal
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">
                        {d.purpose || "—"}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-500 whitespace-nowrap">
                        {d.timeline || "—"}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-600">
                        {d.status || "—"}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-slate-600">
                        <span className="line-clamp-2" title={d.actionTaken}>
                          {d.actionTaken || "—"}
                        </span>
                      </td>

                      <td className="p-2.5 text-slate-600">
                        <span className="line-clamp-2" title={d.remarks}>
                          {d.remarks || "—"}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <button type="button" onClick={() => setTrackingDemand(d)} aria-label={`Update tracking for ${d.client}`} className="inline-flex items-center gap-1 border border-slate-300 px-2 py-1 text-[11px] font-bold text-[#003366] hover:border-[#003366]">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!isLoadingDemands && filteredDemands.length === 0 && (
                  <tr>
                    <td colSpan={16} className="p-12 text-center text-slate-400">
                      <p className="font-semibold text-slate-700">No demands found.</p>
                      <p className="mt-1 text-xs text-slate-500">Change the filters or create a demand.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* VIEW 3: CLICKUP ARCHIVE INTEGRATION PREVIEW (LIST 901420989525) */}
      {viewMode === "clickup" && (
        <div className="bg-[#FFFCFB] border border-slate-200 shadow-xs p-6 space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-[#003366]" />
                <h2 className="font-serif text-2xl font-bold text-[#003366]">
                  Connected Demand Records
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Demand records are read from and saved to the connected list.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={`https://app.clickup.com/9014981136/v/li/${DEMANDS_CLICKUP_LIST_ID}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-xs font-bold text-[#003366] bg-[#FFFCFB] border border-slate-300 hover:border-[#003366] transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open connected list
              </a>

              <button
                type="button"
                onClick={handleRefreshDemands}
                disabled={isSyncing}
                className="px-5 py-2 text-xs font-bold bg-[#003366] hover:bg-[#002244] text-white shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Refreshing…" : "Refresh records"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-[#FFFCFB] border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Connected list</span>
              <p className="font-mono text-lg font-extrabold text-[#003366] mt-1">{DEMANDS_CLICKUP_LIST_ID}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Demands Monitoring Archive Space</p>
            </div>

            <div className="p-4 bg-[#FFFCFB] border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Mandates</span>
              <p className="font-serif text-lg font-extrabold text-slate-900 mt-1">{demands.length} Corporate Demands</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Loaded from the connected demand list</p>
            </div>

            <div className="p-4 bg-[#FFFCFB] border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Task Naming Standard</span>
              <p className="font-mono text-xs font-bold text-slate-800 mt-1 truncate">
                [Type] Client — Min-Max sqm | City, Target Location (Assoc)
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Demand details stored with each record</p>
            </div>
          </div>

          {/* Sample Markdown Task Card Previews */}
          <div className="space-y-4">
            <h3 className="font-serif text-base font-bold text-[#003366]">
              Current Demand Record Previews
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {demands.slice(0, 4).map((d, i) => (
                <div key={d.id} className="border border-slate-200 p-4 bg-[#FFFCFB] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-mono text-xs font-bold text-[#003366] truncate max-w-[420px]" title={formatDemandClickUpTitle(d)}>
                      {formatDemandClickUpTitle(d)}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-[#003366] border border-blue-200">
                      Task #{i + 1}
                    </span>
                  </div>

                  <div className="bg-[#FFFCFB] p-3 text-[11px] font-mono text-slate-700 space-y-1 overflow-x-auto border border-slate-100">
                    <pre className="whitespace-pre-wrap font-sans text-xs">
                      {formatDemandClickUpDescription(d)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* 4. INTAKE MODAL */}
      <NewDemandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateDemand}
        defaultAssetClass={activeAssetClass}
      />
      <EditDemandTrackingModal key={String(trackingDemand?.id ?? "closed")} demand={trackingDemand} onClose={() => setTrackingDemand(null)} onSave={handleSaveTracking} />

    </div>
  );
}

export default DemandsView;
