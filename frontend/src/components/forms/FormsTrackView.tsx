"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Paperclip,
  ExternalLink,
  Edit3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { TrackedRfp } from "@/types/forms/tracked";
import { DEPARTMENT_NAMES } from "@/types/forms/rfp";
import { requestCentralClickUpSync, trackClickUpLiveRefresh } from "@/lib/clickupSyncClient";

const DEPARTMENTS = ["All Departments", ...DEPARTMENT_NAMES];

const FINANCE_STAGES = [
  { label: "Submitted", desc: "Pending Endorsement" },
  { label: "Approval Team Leader", desc: "Awaiting Team Leader approval" },
  { label: "Finance Verification", desc: "Zoho & Top Sheet Prepared" },
  { label: "Disbursement Prep", desc: "UnionBank / Check Prepared" },
  { label: "Executive Sign-Off", desc: "CFO & CEO Signed Off" },
  { label: "Completed", desc: "Payment Released & Filed" },
];

const NON_FINANCE_STAGES = [
  { label: "Submitted", desc: "To Do / Queue" },
  { label: "On Going", desc: "In Progress / Active" },
  { label: "Completed", desc: "Resolved / Closed" },
];

function TrackContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id") || "";

  const [searchQuery, setSearchQuery] = useState(initialId);
  const [emailFilter, setEmailFilter] = useState("");
  const [selectedDept, setSelectedDept] = useState("All Departments");
  const [requests, setRequests] = useState<TrackedRfp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // Submission links include an id so the new request is highlighted once.
  // Remove it from browser history after capturing it, otherwise the stale
  // query survives navigation away from Forms and re-pins the tracker on return.
  useEffect(() => {
    if (!initialId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [initialId]);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg("");

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        if (/^\d{8,}/.test(searchQuery.trim()) || searchQuery.trim().length === 11) {
          params.append("id", searchQuery.trim());
        } else {
          params.append("query", searchQuery.trim());
        }
      }
      if (emailFilter.trim()) params.append("email", emailFilter.trim());
      if (selectedDept !== "All Departments") params.append("dept", selectedDept);

      const res = await fetch(`/api/rfp/track?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load requests");
      }

      setRequests(data.requests || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Unable to reach tracking service");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, emailFilter, selectedDept]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const refreshAfterSync = (event: Event) => { trackClickUpLiveRefresh(event, () => fetchRequests(), "Forms"); };
    window.addEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
    return () => window.removeEventListener("mosaic-clickup-sync-complete", refreshAfterSync);
  }, [fetchRequests]);

  const handleRefresh = async () => {
    setIsSyncing(true);
    setErrorMsg("");
    try {
      await requestCentralClickUpSync();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Unable to start ClickUp sync.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequests();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2">
      {/* Header Banner */}
      <div className="mb-6 bg-[#FFFCFB] border border-slate-300 p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#C9AB4C]" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif italic font-bold text-2xl text-[#003366] tracking-tight">
              Request Status
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Tracking for all submitted Requests
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isLoading || isSyncing}
            className="self-start md:self-auto h-8 px-3 text-xs font-semibold text-[#003366] bg-[#FFFCFB] hover:bg-[#FFFCFB] border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isSyncing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search & Filters */}
        <form onSubmit={handleSearchSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Tracking Code / Payee Search */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by Tracking ID / Task # / Payee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#FFFCFB] border border-slate-300 focus:border-[#003366] text-xs pl-9 pr-3 h-9 focus:outline-none transition-colors"
            />
          </div>

          {/* Work Email Lookup */}
          <div className="sm:col-span-4 relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Enter work email (e.g. dave@...)"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="w-full bg-[#FFFCFB] border border-slate-300 focus:border-[#003366] text-xs pl-9 pr-3 h-9 focus:outline-none transition-colors"
            />
          </div>

          {/* Department Filter */}
          <div className="sm:col-span-3 relative">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full bg-[#FFFCFB] border border-slate-300 focus:border-[#003366] text-xs pl-9 pr-3 h-9 focus:outline-none transition-colors cursor-pointer"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {isLoading ? (
        <div className="bg-[#FFFCFB] border border-slate-200 p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#003366] mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-500">Checking live status in ClickUp...</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-rose-50 border border-rose-200 p-6 text-center text-rose-800 text-xs">
          <p className="font-bold mb-1">Failed to load requests</p>
          <p>{errorMsg}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-[#FFFCFB] border border-slate-300 p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-[#FFFCFB] rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="font-serif italic font-bold text-lg text-slate-800">No requests found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search by Task ID, Payee, or Work Email, or submit a new payment request.
          </p>
          <Link
            href="/forms?tab=create"
            className="inline-flex items-center gap-1.5 mt-4 h-8 px-4 text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] transition-colors shadow-sm"
          >
            <span>Fill Up New RFP</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {requests.map((req) => {
            const formattedTotal = Number(req.totalAmount || 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const isFinance = ["rfp", "po", "pcv"].includes((req.formType || "rfp").toLowerCase());
            const stages = isFinance ? FINANCE_STAGES : NON_FINANCE_STAGES;

            return (
              <div
                key={req.taskId}
                className={`bg-[#FFFCFB] border ${
                  req.isRevisionRequested
                    ? "border-amber-400 ring-1 ring-amber-300/40"
                    : req.currentStage === "completed"
                    ? "border-emerald-400"
                    : "border-slate-300"
                } shadow-sm p-6 relative`}
              >
                {/* Revision Alert Header */}
                {req.isRevisionRequested && (
                  <div className="mb-5 bg-amber-50 border border-amber-300 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wide block">
                          Revision Requested by {req.revisionBy === "finance" ? "Finance & Accounting" : "Team Leader"}
                        </span>
                        <span className="text-xs text-amber-800 mt-0.5 block italic">
                          {req.revisionReason ? `"${req.revisionReason}"` : "Please review comments and update form details."}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/forms?tab=create&taskId=${req.taskId}`}
                      className="h-8 px-3.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 self-start sm:self-auto"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit & Resubmit</span>
                    </Link>
                  </div>
                )}

                {/* Top Info Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <a
                        href={req.taskUrl || `https://app.clickup.com/t/${req.taskId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs font-bold text-[#003366] bg-blue-50 hover:bg-blue-100 hover:text-[#002244] px-2 py-0.5 border border-blue-200 inline-flex items-center gap-1 transition-colors group cursor-pointer"
                        title="Open task in ClickUp"
                      >
                        <span>Task #{req.taskId}</span>
                        <ExternalLink className="w-3 h-3 text-[#003366]/70 group-hover:text-[#003366]" />
                      </a>
                      <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 bg-[#003366] text-[#C9AB4C]">
                        {req.formType ? req.formType.toUpperCase() : "RFP"}
                      </span>
                      <span className="text-xs font-bold text-slate-700 uppercase bg-[#FFFCFB] px-2 py-0.5">
                        {req.department}
                      </span>
                      {req.urgency === "urgent" && (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5">
                          🚨 URGENT
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        Submitted: {new Date(req.dateCreated).toLocaleDateString()}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 border ${
                        req.currentStage === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : req.currentStage === "ongoing"
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-[#FFFCFB] text-slate-700 border-slate-300"
                      }`}>
                        Status: {req.stageLabel}
                      </span>
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-1">
                      {req.payee}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                      <span className="font-semibold text-slate-700">Purpose:</span>{" "}
                      {req.purpose || "Payment for approved business requirements."}
                    </p>
                  </div>

                  {isFinance || Number(req.totalAmount || 0) > 0 ? (
                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        TOTAL AMOUNT
                      </span>
                      <span className="font-bebas text-2xl text-[#003366] tracking-wider block">
                        ₱{formattedTotal}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Needed by: <strong className="text-slate-800">{req.dateNeeded || "N/A"}</strong>
                      </span>
                    </div>
                  ) : (
                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        STATUS
                      </span>
                      <span className={`font-bold text-base block mt-0.5 ${
                        req.currentStage === "completed"
                          ? "text-emerald-700"
                          : req.currentStage === "ongoing"
                          ? "text-blue-700"
                          : "text-slate-700"
                      }`}>
                        {req.stageLabel}
                      </span>
                      {req.dateNeeded && (
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Target: <strong className="text-slate-800">{req.dateNeeded}</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Workflow Stepper: 6 stages for finance, 3 stages for non-finance */}
                <div className="py-6 border-b border-slate-200">
                  <div className={`grid ${isFinance ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : "grid-cols-3"} gap-3 relative`}>
                    {stages.map((stage, idx) => {
                      const isCompletedState = req.currentStage === "completed";
                      const isComplete = req.stageIndex > idx || (isCompletedState && idx === stages.length - 1);
                      const isCurrent = req.stageIndex === idx && !isCompletedState;

                      let badgeColor = "bg-[#FFFCFB] text-slate-400 border-slate-300";
                      let textColor = "text-slate-400";

                      if (isComplete) {
                        badgeColor = "bg-emerald-600 text-white border-emerald-600 shadow-sm";
                        textColor = "text-emerald-700 font-bold";
                      } else if (isCurrent) {
                        if (req.isRevisionRequested) {
                          badgeColor = "bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse";
                          textColor = "text-amber-800 font-bold";
                        } else {
                          badgeColor = "bg-amber-400 text-[#003366] border-amber-500 shadow-sm animate-pulse";
                          textColor = "text-amber-800 font-bold";
                        }
                      }

                      return (
                        <div key={stage.label} className="flex flex-col items-center text-center relative px-1">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold mb-2 transition-all ${badgeColor}`}
                          >
                            {isComplete ? <CheckCircle2 className="w-4 h-4" /> : isCurrent ? <Clock className="w-4 h-4" /> : idx + 1}
                          </div>
                          <span className={`text-[11px] sm:text-xs font-bold leading-tight block ${textColor}`}>
                            {stage.label}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                            {idx === 0 && isComplete
                              ? `Submitted · ${new Date(req.dateCreated).toLocaleString()}`
                              : idx === 1 && isFinance && isComplete
                              ? `Approved by ${req.stageApprovedBy || "Team Leader"}${req.updatedAt ? ` · ${new Date(req.updatedAt).toLocaleString()}` : ""}`
                              : isCurrent && !req.isRevisionRequested
                              ? `On Going${req.updatedAt ? ` · ${new Date(req.updatedAt).toLocaleString()}` : ""}`
                              : stage.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Footer: Requestor & Attachments */}
                <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                  <div>
                    <span>Requested by: </span>
                    <strong className="text-slate-700">{req.requestedBy}</strong>
                  </div>

                  {/* Attached files preview */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {req.attachments.length > 0 ? (
                      req.attachments.map((att, attIdx) => (
                        <a
                          key={att.id || attIdx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFFCFB] hover:bg-[#FFFCFB] border border-slate-300 text-slate-700 text-[11px] font-medium transition-colors"
                        >
                          <Paperclip className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[120px]">{att.name}</span>
                        </a>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Official RFP PDF generated in ClickUp</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-12 text-center text-xs font-semibold text-slate-500">
          Loading Request Tracker...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
