"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Download, ExternalLink, Loader2, Mail, X } from "lucide-react";
import { downloadBlob, requestMeetingPdf } from "@/lib/api";
import { createMeetingEmailDraft, createOutlookComposeUrl, isValidRecipientList, OutlookMeetingDraft } from "@/lib/outlookCompose";

interface EmailMeetingModalProps {
  isOpen: boolean;
  meeting: { title?: string; date?: string; metadata: any; items: any[]; summary?: string };
  fromEmail?: string;
  onClose: () => void;
}

export function EmailMeetingModal({ isOpen, meeting, fromEmail, onClose }: EmailMeetingModalProps) {
  const [draft, setDraft] = useState<OutlookMeetingDraft>(() => createMeetingEmailDraft(meeting));
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [outlookUrl, setOutlookUrl] = useState("");
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(createMeetingEmailDraft(meeting));
      setFilename("");
      setError("");
      setOutlookUrl("");
      setPopupBlocked(false);
    }
  }, [isOpen, meeting.title, meeting.date]);

  if (!isOpen) return null;

  const updateDraft = (key: keyof OutlookMeetingDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const handleDownload = async () => {
    setError("");
    setIsPreparing(true);
    try {
      const { blob, filename: generatedFilename } = await requestMeetingPdf(meeting.metadata, meeting.items, meeting.summary || "", "");
      downloadBlob(blob, generatedFilename);
      setFilename(generatedFilename);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the PDF.");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSendViaEmail = () => {
    if (!filename) return;
    if (!isValidRecipientList(draft.to)) {
      setError("Enter at least one valid email address in To.");
      return;
    }
    if (draft.cc.trim() && !isValidRecipientList(draft.cc)) {
      setError("Check the CC email addresses.");
      return;
    }
    setError("");
    const url = createOutlookComposeUrl(draft);
    setOutlookUrl(url);
    setPopupBlocked(false);
    const popup = window.open(url, "echo-outlook-compose");
    if (!popup) {
      setPopupBlocked(true);
      setError("Your browser blocked Outlook. Use the fallback link below.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#001E3C]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="email-meeting-title">
      <div className="w-full max-w-xl border border-slate-200 bg-[#FFFCFB] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><div className="flex items-center gap-2 text-[#003366]"><Mail size={17} className="text-[#C9AB4C]" /><h2 id="email-meeting-title" className="font-serif text-lg font-bold italic">Email meeting minutes</h2></div><p className="mt-1 text-[11px] text-slate-500">Mosaic opens Outlook with the message ready for your review.</p></div>
          <button type="button" onClick={onClose} disabled={isPreparing} aria-label="Close email dialog" className="text-slate-400 hover:text-[#003366] disabled:opacity-40"><X size={17} /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="border border-[#C9AB4C]/50 bg-[#FAF9F7] px-3 py-2 text-[11px] text-slate-600"><b className="text-[#003366]">From:</b> {fromEmail || "ClickUp user email unavailable"}</div>
          <label className="block text-xs font-semibold text-[#003366]">To<input value={draft.to} onChange={(e) => updateDraft("to", e.target.value)} placeholder="recipient@company.com" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#C9AB4C]" autoFocus /></label>
          <label className="block text-xs font-semibold text-[#003366]">CC <span className="font-normal text-slate-400">(optional)</span><input value={draft.cc} onChange={(e) => updateDraft("cc", e.target.value)} placeholder="manager@company.com" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#C9AB4C]" /></label>
          <label className="block text-xs font-semibold text-[#003366]">Subject<input value={draft.subject} onChange={(e) => updateDraft("subject", e.target.value)} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-[#C9AB4C]" /></label>
          <label className="block text-xs font-semibold text-[#003366]">Message<textarea value={draft.body} onChange={(e) => updateDraft("body", e.target.value)} rows={6} className="mt-1 w-full resize-y border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-[#C9AB4C]" /></label>
          <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><b className="text-[#003366]">Next:</b> Download the PDF first, then open the prefilled Outlook draft and attach it manually.</div>
          {error && <div className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</div>}
          {filename && <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800"><Download size={14} /><span><b>PDF downloaded:</b> {filename}. Attach it in the Outlook draft before sending.</span></div>}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={onClose} disabled={isPreparing} className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">{filename ? "Done" : "Cancel"}</button><button type="button" onClick={handleDownload} disabled={isPreparing || !!filename} className="flex items-center gap-2 border border-[#003366] bg-white px-4 py-2 text-xs font-bold text-[#003366] disabled:cursor-not-allowed disabled:opacity-45">{isPreparing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-[#C9AB4C]" />}{isPreparing ? "Downloading…" : filename ? "MoM PDF Downloaded" : "Download MoM PDF"}</button><ArrowRight size={16} className={filename ? "text-[#C9AB4C]" : "text-slate-300"} aria-hidden="true" /><button type="button" onClick={handleSendViaEmail} disabled={!filename || isPreparing} className="flex items-center gap-2 bg-[#003366] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-35" title={!filename ? "Download the MoM PDF first" : "Open the prefilled Outlook draft"}><Mail size={14} className="text-[#C9AB4C]" />Send via Email</button>{popupBlocked && outlookUrl && <a href={outlookUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 border border-[#003366] px-3 py-2 text-[11px] font-semibold text-[#003366] hover:bg-[#003366]/5">Open Outlook <ExternalLink size={12} /></a>}</div>
        </div>
      </div>
    </div>
  );
}
