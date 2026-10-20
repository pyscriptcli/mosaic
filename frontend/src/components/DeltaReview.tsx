"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { AlertCircle, ArrowLeft, Check, Download, FileText, FolderOpen, LoaderCircle, MessageSquareText, Plus, RefreshCw, Save, Trash2, Upload, X } from "lucide-react";
import { compareSections, readWordSections, type DeltaEntry } from "@/lib/delta/compare";
import { comparePdfPages, type PdfComparisonResult } from "@/lib/delta/pdfCompare";
import { filterBlankOnlyChanges, type ChangeFilter } from "@/lib/delta/changeFilter";
import { readPdfDocument, type LoadedPdfDocument } from "@/lib/delta/readPdfDocument";
import { readWordHtml } from "@/lib/delta/wordDocument";
import { compareTextDocuments } from "@/lib/delta/compareText";
import { readTextFile, readTextSections } from "@/lib/delta/textDocument";
import { chooseReviewFolder, deleteReview, getReviewStorageMode, hasChosenFolder, listReviews, saveReview, supportsDocumentsFolderSaving, type ReviewStorageMode, type SavedDeltaReview } from "@/lib/delta/localStore";
import { PdfComparisonPanel } from "@/components/delta/PdfComparisonPanel";
import { TextResultPanel } from "@/components/delta/TextResultPanel";

const WordComparisonPanel = dynamic(() => import("@/components/delta/WordComparisonPanel").then((module) => module.WordComparisonPanel), { ssr: false });

const controlClass = "inline-flex min-h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] transition-colors hover:border-[#003366] hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003366] disabled:cursor-not-allowed disabled:opacity-50";

function fileNameSafe(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "delta-register";
}

type DiffPart = { text: string; changed: boolean };

function registerWording(text: string, counterpart: string, side: "original" | "revised") {
  if (!text) return [new TextRun({ text: side === "original" ? "Not present" : "Removed", italics: true, color: "64748B" })];
  const parts = side === "original" ? diffParts(text, counterpart).original : diffParts(counterpart, text).revised;
  return parts.map((part) => new TextRun({ text: part.text, ...(part.changed ? side === "original" ? { color: "B42318", strike: true } : { color: "16794B", bold: true } : {}) }));
}

function diffParts(original: string, revised: string) {
  const tokenize = (value: string) => value.match(/\s+|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s]/gu) || [];
  const left = tokenize(original);
  const right = tokenize(revised);
  if (left.length > 1200 || right.length > 1200) {
    let start = 0;
    while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
    let leftEnd = left.length;
    let rightEnd = right.length;
    while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) { leftEnd -= 1; rightEnd -= 1; }
    return {
      original: [{ text: left.slice(0, start).join(""), changed: false }, { text: left.slice(start, leftEnd).join(""), changed: true }, { text: left.slice(leftEnd).join(""), changed: false }].filter((part) => part.text),
      revised: [{ text: right.slice(0, start).join(""), changed: false }, { text: right.slice(start, rightEnd).join(""), changed: true }, { text: right.slice(rightEnd).join(""), changed: false }].filter((part) => part.text),
    };
  }
  const width = right.length + 1;
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint16Array(width));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const originalParts: DiffPart[] = [];
  const revisedParts: DiffPart[] = [];
  const push = (parts: DiffPart[], token: string, changed: boolean) => {
    const last = parts[parts.length - 1];
    if (last?.changed === changed) last.text += token;
    else parts.push({ text: token, changed });
  };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      push(originalParts, left[i], false); push(revisedParts, right[j], false); i += 1; j += 1;
    } else if (i < left.length && (j === right.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      push(originalParts, left[i], true); i += 1;
    } else {
      push(revisedParts, right[j], true); j += 1;
    }
  }
  return { original: originalParts, revised: revisedParts };
}

function cleanExplanation(value: string) {
  return value
    .replace(/^\s*(?:here is )?(?:a )?plain[- ]language reading(?: aid)?(?: for section [\w.-]+)?[.:]?\s*/i, "")
    .replace(/\*\*?(?:what changed|plain[- ]language reading(?: aid)?)\*\*?\s*:?/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reviewMatchesContext(review: SavedDeltaReview, contextId?: string, contextName?: string) {
  if (!contextId) return true;
  if (review.contextId) return review.contextId === contextId;
  return Boolean(contextName && (review.contextName?.toLocaleLowerCase() === contextName.toLocaleLowerCase() || review.title.toLocaleLowerCase().startsWith(`${contextName} contract review`.toLocaleLowerCase())));
}

function documentFamily(file: File): "pdf" | "docx" | "text" | "unsupported" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) return "docx";
  if (name.endsWith(".md") || name.endsWith(".txt") || file.type === "text/plain") return "text";
  return "unsupported";
}

function createRegisterDocument(review: SavedDeltaReview) {
  const rows = review.entries.flatMap((entry) => [
    new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: entry.section })], width: { size: 18, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: entry.summary })], width: { size: 22, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: registerWording(entry.originalText, entry.revisedText, "original") })], width: { size: 30, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ children: registerWording(entry.revisedText, entry.originalText, "revised") })], width: { size: 30, type: WidthType.PERCENTAGE } }),
    ] }),
    new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: "Decision" })] }),
      new TableCell({ children: [new Paragraph({ text: entry.approval === "approved" ? "Approved" : entry.amendment ? "Amendment proposed" : "Pending review" })], columnSpan: 3 }),
    ] }),
    ...(entry.amendment ? [new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: "Reviewer amendment" })] }),
      new TableCell({ children: [new Paragraph({ text: [entry.amendment.comment, entry.amendment.wording ? `Proposed wording: ${entry.amendment.wording}` : ""].filter(Boolean).join("\n\n") })], columnSpan: 3 }),
    ] })] : []),
    ...entry.comments.map((comment) => new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: "Word comment" })] }),
      new TableCell({ children: [new Paragraph({ text: comment.author })] }),
      new TableCell({ children: [new Paragraph({ text: comment.text })], columnSpan: 2 }),
    ] })),
  ]);
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [18, 22, 30, 30],
    rows: [new TableRow({ tableHeader: true, children: ["Section", "Change summary", "Earlier wording", "Later wording"].map((text) => new TableCell({ children: [new Paragraph({ text, heading: HeadingLevel.HEADING_3 })] })) }), ...rows],
  });
  return new Document({ sections: [{ children: [
    new Paragraph({ text: "Contract Review Register", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: review.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Earlier version: ${review.originalName} | Later version: ${review.revisedName}` }),
    new Paragraph({ text: `Prepared ${new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(review.savedAt))}` }),
    new Paragraph({ text: "Review aid only. Verify every entry against the source documents." }),
    new Paragraph({ text: review.commentsFound ? "Word comments were found and are shown with the relevant register entry." : "No Word comments were found in either document." }),
    table,
    ...review.entries.filter((entry) => entry.explanation).flatMap((entry) => [
      new Paragraph({ text: `AI explanation: Section ${entry.section}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: cleanExplanation(entry.explanation || "") }),
    ]),
  ] }] });
}

export function DeltaReview({ contextName, contextId, initialReview, onBack, renderContractGallery, persistenceEnabled = true, readOnly = false }: { contextName?: string; contextId?: string; initialReview?: SavedDeltaReview; onBack?: () => void; renderContractGallery?: (actions: { compareFiles: (original: File, revised: File) => void }) => ReactNode; persistenceEnabled?: boolean; readOnly?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const isStandaloneWorkspace = !contextId;
  const reviewRouteActive = Boolean(pathname?.startsWith("/contracts/review"));
  const [originalFile, setOriginalFile] = useState<File | undefined>(() => initialReview?.originalFile);
  const [revisedFile, setRevisedFile] = useState<File | undefined>(() => initialReview?.revisedFile);
  const [pdfDocuments, setPdfDocuments] = useState<{ original: LoadedPdfDocument; revised: LoadedPdfDocument } | null>(null);
  const [pdfComparison, setPdfComparison] = useState<PdfComparisonResult | null>(null);
  const [wordDocuments, setWordDocuments] = useState<{ original: { name: string; html: string }; revised: { name: string; html: string } } | null>(null);
  const [sourceTexts, setSourceTexts] = useState<{ original: string; revised: string } | null>(null);
  const [title, setTitle] = useState(() => initialReview?.title || (contextName ? `${contextName} contract review` : "Contract review"));
  const [entries, setEntries] = useState<DeltaEntry[]>(() => initialReview?.entries || []);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const visibleEntries = useMemo(() => filterBlankOnlyChanges(entries, changeFilter), [entries, changeFilter]);
  const [workspaceTab, setWorkspaceTab] = useState<"contracts" | "history" | "compare" | "review">(() => initialReview || reviewRouteActive ? "review" : "contracts");
  const [inputModes, setInputModes] = useState<{ original: "file" | "text"; revised: "file" | "text" }>({ original: "file", revised: "file" });
  const [pastedText, setPastedText] = useState({ original: "", revised: "" });
  const [redline, setRedline] = useState(false);
  const [amendmentEntryId, setAmendmentEntryId] = useState("");
  const [amendmentComment, setAmendmentComment] = useState("");
  const [amendmentWording, setAmendmentWording] = useState("");
  const [reviewId, setReviewId] = useState(() => initialReview?.id || "");
  const [savedAt, setSavedAt] = useState(() => initialReview?.savedAt || "");
  const [savedReviews, setSavedReviews] = useState<SavedDeltaReview[]>([]);
  const [folderReady, setFolderReady] = useState(false);
  const [storageMode, setStorageMode] = useState<ReviewStorageMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const comparisonWorkspaceRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState("");
  const comparisonVersion = useRef(0);

  const commentsFound = useMemo(() => entries.some((entry) => entry.comments.length > 0), [entries]);
  const canCompare = Boolean(originalFile && revisedFile && originalFile.size > 0 && revisedFile.size > 0
    && originalFile.size <= 20 * 1024 * 1024 && revisedFile.size <= 20 * 1024 * 1024
    && documentFamily(originalFile) !== "unsupported" && documentFamily(originalFile) === documentFamily(revisedFile) && !busy);

  const selectComparisonFile = (side: "original" | "revised", file?: File, mode?: "file" | "text") => {
    comparisonVersion.current += 1;
    if (side === "original") setOriginalFile(file); else setRevisedFile(file);
    if (mode) setInputModes((current) => ({ ...current, [side]: mode }));
    setPdfDocuments(null);
    setPdfComparison(null);
    setWordDocuments(null);
    setSourceTexts(null);
    setEntries([]);
    setReviewId("");
    setSavedAt("");
    setError("");
    setNotice("");
    setAmendmentEntryId("");
  };

  useEffect(() => {
    if (!isStandaloneWorkspace) return;
    const tab = reviewRouteActive ? "review" : "contracts";
    queueMicrotask(() => setWorkspaceTab(tab));
  }, [isStandaloneWorkspace, reviewRouteActive]);

  useEffect(() => () => {
    void pdfDocuments?.original.loadingTask.destroy();
    void pdfDocuments?.revised.loadingTask.destroy();
  }, [pdfDocuments]);

  const selectWorkspaceTab = (tab: "contracts" | "history" | "compare" | "review") => {
    setWorkspaceTab(tab);
    if (isStandaloneWorkspace && tab !== "compare") router.push(tab === "review" ? "/contracts/review" : "/contracts");
  };

  const updateEntry = (entryId: string, update: Partial<DeltaEntry>) => {
    if (readOnly) return;
    setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, ...update } : entry));
  };

  const startAmendment = (entry: DeltaEntry) => {
    setAmendmentEntryId(entry.id);
    setAmendmentComment(entry.amendment?.comment || "");
    setAmendmentWording(entry.amendment?.wording || "");
  };

  const saveAmendment = (entry: DeltaEntry) => {
    if (readOnly) return;
    const comment = amendmentComment.trim();
    const wording = amendmentWording.trim();
    if (!comment && !wording) {
      setError("Add a comment or proposed wording before saving the amendment.");
      return;
    }
    updateEntry(entry.id, { amendment: { ...(comment ? { comment } : {}), ...(wording ? { wording } : {}) } });
    setAmendmentEntryId(""); setError("");
  };

  useEffect(() => {
    if (!persistenceEnabled) return;
    getReviewStorageMode().then((mode) => { setStorageMode(mode); setFolderReady(Boolean(mode)); }).catch(() => undefined);
  }, [persistenceEnabled]);

  const chooseFolder = async () => {
    setBusy(true); setError(""); setNotice(""); setBusyLabel(supportsDocumentsFolderSaving() ? "Opening Documents" : "Setting up local saving");
    try {
      const storage = await chooseReviewFolder();
      setStorageMode(storage.mode);
      setFolderReady(true);
      setNotice(storage.mode === "documents"
        ? "Contract review storage is ready in Documents. Your review files stay on this device."
        : storage.mode === "browser"
          ? "A local contract reviews folder is ready in this browser's private storage. Your files stay on this device."
          : "Local contract review storage is ready in this browser. Reviews stay in this browser profile on this device.");
      const reviews = await listReviews();
      setSavedReviews(reviews.filter((review) => reviewMatchesContext(review, contextId, contextName)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The local save folder could not be created.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  const refreshSavedReviews = async () => {
    setBusy(true); setError(""); setBusyLabel("Reading saved reviews");
    try {
      const reviews = await listReviews();
      setSavedReviews(reviews.filter((review) => reviewMatchesContext(review, contextId, contextName))); setFolderReady(true);
      setStorageMode(await getReviewStorageMode());
      setNotice(reviews.length ? `${reviews.length} saved review${reviews.length === 1 ? "" : "s"} found locally.` : "No saved contract reviews found yet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saved reviews could not be read.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  const runComparison = async (originalDocument = originalFile, revisedDocument = revisedFile) => {
    if (readOnly) return;
    if (!originalDocument || !revisedDocument) return;
    setChangeFilter("all");
    const version = ++comparisonVersion.current;
    setOriginalFile(originalDocument); setRevisedFile(revisedDocument);
    setBusy(true); setError(""); setNotice("");
    try {
      if (originalDocument.size > 20 * 1024 * 1024 || revisedDocument.size > 20 * 1024 * 1024) throw new Error("Each document must be 20 MiB or smaller.");
      const originalFamily = documentFamily(originalDocument);
      const revisedFamily = documentFamily(revisedDocument);
      if (originalFamily === "unsupported" || revisedFamily === "unsupported") throw new Error("Supported formats: PDF, DOCX, TXT, and Markdown (.md).");
      if (originalFamily !== revisedFamily) throw new Error("Choose two documents from the same format family: PDF, DOCX, or text.");
      const originalIsPdf = originalFamily === "pdf";

      if (originalIsPdf) {
        setWordDocuments(null);
        setBusyLabel("Reading both PDFs in this browser");
        const [original, revised] = await Promise.all([readPdfDocument(originalDocument), readPdfDocument(revisedDocument)]);
        if (original.pages.length > 200 || revised.pages.length > 200) {
          await Promise.all([original.loadingTask.destroy(), revised.loadingTask.destroy()]);
          throw new Error("PDFs are limited to 200 pages each.");
        }
        const result = comparePdfPages(original.pages, revised.pages);
        if (version !== comparisonVersion.current) { await Promise.all([original.loadingTask.destroy(), revised.loadingTask.destroy()]); return; }
        const pdfEntries: DeltaEntry[] = result.changes.map((change) => ({
          id: change.id,
          section: `Earlier page ${change.originalPageNumber ?? "not present"} · Later page ${change.revisedPageNumber ?? "not present"}`,
          originalSection: change.originalPageNumber ? `Page ${change.originalPageNumber}` : "Not present",
          revisedSection: change.revisedPageNumber ? `Page ${change.revisedPageNumber}` : "Not present",
          comments: [],
          originalText: change.originalText,
          revisedText: change.revisedText,
          summary: change.kind === "added" ? "Text added" : change.kind === "removed" ? "Text removed" : "Wording changed",
        }));
        setPdfDocuments({ original, revised });
        setPdfComparison(result);
        setSourceTexts({ original: original.pages.map((page) => page.spans.map((span) => span.text).join(" ")).join("\n\n"), revised: revised.pages.map((page) => page.spans.map((span) => span.text).join(" ")).join("\n\n") });
        setEntries(pdfEntries);
        setReviewId(crypto.randomUUID()); setSavedAt(new Date().toISOString()); setAmendmentEntryId("");
        setWorkspaceTab("compare"); setRedline(false);
        const scanPages = result.scannedPages.original.length + result.scannedPages.revised.length;
        setNotice(scanPages ? `Comparison ready with ${result.changes.length} text changes. ${scanPages} page${scanPages === 1 ? " has" : "s have"} no selectable text and were not compared.` : `${result.changes.length} text change${result.changes.length === 1 ? "" : "s"} ready. Source PDFs remain unchanged.`);
      } else if (originalFamily === "docx") {
        setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null);
        setBusyLabel("Reading both Word documents");
        if (!originalDocument.name.toLowerCase().endsWith(".docx") || !revisedDocument.name.toLowerCase().endsWith(".docx")) {
          throw new Error("Choose two PDFs or two .docx Word documents. Older .doc files are not supported.");
        }
        const [original, revised, renderedDocuments] = await Promise.all([
          readWordSections(originalDocument),
          readWordSections(revisedDocument),
          Promise.all([readWordHtml(originalDocument), readWordHtml(revisedDocument)]),
        ]);
        const result = compareSections(original, revised);
        if (version !== comparisonVersion.current) return;
        setWordDocuments(renderedDocuments ? {
          original: { name: originalDocument.name, html: renderedDocuments[0] },
          revised: { name: revisedDocument.name, html: renderedDocuments[1] },
        } : null);
        setSourceTexts({ original: original.map((section) => [section.heading, section.text].filter(Boolean).join("\n")).join("\n\n"), revised: revised.map((section) => [section.heading, section.text].filter(Boolean).join("\n")).join("\n\n") });
        setEntries(result); setReviewId(crypto.randomUUID()); setSavedAt(new Date().toISOString()); setAmendmentEntryId("");
        setWorkspaceTab("compare"); setRedline(false);
        setNotice(result.length ? `${result.length} register entr${result.length === 1 ? "y" : "ies"} ready. Check each against the source files.` : "No wording, numbering, or comment changes were found between these documents.");
      } else {
        setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null);
        setBusyLabel("Comparing text in this browser");
        const [original, revised] = await Promise.all([readTextFile(originalDocument), readTextFile(revisedDocument)]);
        const result = compareTextDocuments(original, revised);
        if (version !== comparisonVersion.current) return;
        setSourceTexts({ original, revised });
        setEntries(result); setReviewId(crypto.randomUUID()); setSavedAt(new Date().toISOString()); setAmendmentEntryId("");
        setWorkspaceTab("compare"); setRedline(false);
        setNotice(result.length ? `${result.length} text changes ready. Source text stays in this browser.` : "No text differences found.");
      }
    } catch (cause) {
      if (version !== comparisonVersion.current) return;
      setEntries([]); setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null); setSourceTexts(null);
      setError(cause instanceof Error ? cause.message : "The documents could not be compared.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  const compare = () => runComparison();

  const makeReview = (includeFiles = true, reviewEntries = entries): SavedDeltaReview => ({
    comparisonVersion: 1,
    id: reviewId || crypto.randomUUID(),
    title: title.trim() || "Contract review",
    savedAt: savedAt || new Date().toISOString(),
    originalName: originalFile?.name || "earlier.docx",
    revisedName: revisedFile?.name || "later.docx",
    ...(contextId ? { contextId } : {}),
    ...(contextName ? { contextName } : {}),
    entries: reviewEntries,
    commentsFound,
    ...(includeFiles ? { originalFile, revisedFile } : {}),
  });

  const saveCurrentReview = async () => {
    if (readOnly || !reviewId || !originalFile || !revisedFile) return;
    setBusy(true); setError(""); setBusyLabel(storageMode === "documents" ? "Saving to Documents" : "Saving locally");
    try {
      const review = makeReview();
      const registerFile = await Packer.toBlob(createRegisterDocument(review));
      await saveReview({ ...review, registerFile });
      const mode = await getReviewStorageMode();
      setStorageMode(mode);
      setReviewId(review.id); setSavedAt(review.savedAt); setFolderReady(true);
      setSavedReviews((await listReviews()).filter((review) => reviewMatchesContext(review, contextId, contextName)));
      setNotice(mode === "browser"
        ? "Review, register, and source files saved locally in this browser."
        : mode === "indexeddb"
          ? "Review, register, and source files saved in local browser storage."
          : "Review, register, and both source files saved in Documents.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review could not be saved locally.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  const restorePreview = async (review: SavedDeltaReview) => {
    setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null); setSourceTexts(null);
    if (!review.originalFile || !review.revisedFile) {
      setSourceTexts(null);
      setNotice("This saved review has no source files available for comparison preview. Its review notes are preserved.");
      return;
    }
    const version = ++comparisonVersion.current;
    try {
      if (review.originalFile.size > 20 * 1024 * 1024 || review.revisedFile.size > 20 * 1024 * 1024) throw new Error("A saved source exceeds the 20 MiB file limit.");
      const type = documentFamily(review.originalFile);
      if (type === "unsupported" || type !== documentFamily(review.revisedFile)) throw new Error("Saved source formats do not match.");
      if (type === "pdf") {
        const [original, revised] = await Promise.all([readPdfDocument(review.originalFile), readPdfDocument(review.revisedFile)]);
        if (version !== comparisonVersion.current) { await Promise.all([original.loadingTask.destroy(), revised.loadingTask.destroy()]); return; }
        const result = comparePdfPages(original.pages, revised.pages);
        setPdfDocuments({ original, revised }); setPdfComparison(result); setWordDocuments(null);
        setSourceTexts({ original: original.pages.map((page) => page.spans.map((span) => span.text).join(" ")).join("\n\n"), revised: revised.pages.map((page) => page.spans.map((span) => span.text).join(" ")).join("\n\n") });
      } else if (type === "docx") {
        const [left, right, sectionsLeft, sectionsRight] = await Promise.all([readWordHtml(review.originalFile), readWordHtml(review.revisedFile), readWordSections(review.originalFile), readWordSections(review.revisedFile)]);
        if (version !== comparisonVersion.current) return;
        setWordDocuments({ original: { name: review.originalFile.name, html: left }, revised: { name: review.revisedFile.name, html: right } }); setPdfDocuments(null); setPdfComparison(null);
        setSourceTexts({ original: sectionsLeft.map((section) => [section.heading, section.text].filter(Boolean).join("\n")).join("\n\n"), revised: sectionsRight.map((section) => [section.heading, section.text].filter(Boolean).join("\n")).join("\n\n") });
      } else {
        const [original, revised] = await Promise.all([readTextFile(review.originalFile), readTextFile(review.revisedFile)]);
        readTextSections(original); readTextSections(revised);
        if (version !== comparisonVersion.current) return;
        setSourceTexts({ original, revised }); setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null);
      }
      setNotice(`Opened ${review.title}. Source preview is ready; saved review decisions are unchanged.`);
    } catch {
      if (version !== comparisonVersion.current) return;
      setSourceTexts(null); setPdfDocuments(null); setPdfComparison(null); setWordDocuments(null);
      setNotice("Source preview could not be rebuilt. Saved review decisions are preserved.");
    }
  };

  useEffect(() => {
    if (initialReview) queueMicrotask(() => void restorePreview(initialReview));
  }, [initialReview]);

  const openReview = async (review: SavedDeltaReview) => {
    setTitle(review.title); setEntries(review.entries); setReviewId(review.id); setSavedAt(review.savedAt);
    setChangeFilter("all");
    setOriginalFile(review.originalFile); setRevisedFile(review.revisedFile);
    setWorkspaceTab("review"); setAmendmentEntryId("");
    setError(""); setNotice(`Opening ${review.title}…`);
    await restorePreview(review);
  };

  const removeReview = async (review: SavedDeltaReview) => {
    if (readOnly) return;
    const location = storageMode === "documents" ? "Documents" : storageMode === "browser" ? "this browser's local contract reviews folder" : "local browser storage";
    if (!window.confirm(`Delete ${review.title} and its source files from ${location}?`)) return;
    setBusy(true); setError(""); setBusyLabel("Deleting saved review");
    try {
      await deleteReview(review.id);
      setSavedReviews((current) => current.filter((item) => item.id !== review.id));
      if (reviewId === review.id) { setEntries([]); setOriginalFile(undefined); setRevisedFile(undefined); setReviewId(""); setWorkspaceTab("contracts"); }
      setNotice(`${review.title} and its local source files were deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The saved review could not be deleted.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  const explain = async (entry: DeltaEntry) => {
    if (readOnly) return;
    if (!window.confirm("This sends the selected change wording and Word comments to the AI explanation service. Continue?")) return;
    const comparisonId = comparisonVersion.current;
    setBusy(true); setError(""); setBusyLabel(`Requesting explanation for section ${entry.section}`);
    try {
      const response = await fetch("/api/delta/explain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: entry.section, summary: entry.summary, original: entry.originalText, revised: entry.revisedText, comments: entry.comments }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The AI explanation could not be generated.");
      if (comparisonId === comparisonVersion.current) setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, explanation: payload.explanation } : item));
      setNotice("");
    } catch (cause) {
      if (comparisonId !== comparisonVersion.current) return;
      setError(cause instanceof Error ? cause.message : "The AI explanation could not be generated.");
    } finally { if (comparisonId === comparisonVersion.current) { setBusy(false); setBusyLabel(""); } }
  };

  const exportRegister = async () => {
    if (!visibleEntries.length) return;
    setBusy(true); setBusyLabel("Preparing Word register"); setError("");
    try {
      const blob = await Packer.toBlob(createRegisterDocument(makeReview(false, visibleEntries)));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${fileNameSafe(title)}-register.docx`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Word register downloaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Word register could not be exported.");
    } finally { setBusy(false); setBusyLabel(""); }
  };

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-5 pb-10 text-[#181D1E]">
      <header className="flex flex-col justify-between gap-3 border-b border-[#003366]/15 pb-4 md:flex-row md:items-end">
        <div className="flex items-start gap-3">
          {onBack && <button type="button" onClick={onBack} aria-label="Back to contracts" title="Back to contracts" className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 bg-white text-[#003366] hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>}
          <div className="border-l-4 border-[#C9A84C] pl-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31577D]">{contextId ? "Project contracts" : "Contract review"}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#003366]">{contextName || "Contract review"}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">{contextId ? "Add contract drafts, review saved comparisons, and record decisions against each change." : "Add contract drafts, review the differences by section, and record decisions against each change."}</p>
          </div>
        </div>
        {persistenceEnabled && !readOnly && <div className="flex flex-wrap gap-2">
          <button type="button" className={controlClass} onClick={chooseFolder} disabled={busy}><FolderOpen aria-hidden="true" className="h-4 w-4" />Set up local saving</button>
        </div>}
      </header>

      {error && <div role="alert" className="flex items-start gap-2 border border-red-300 bg-white p-3 text-sm text-red-900"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
      {notice && <div role="status" className="flex items-start gap-2 border border-emerald-300 bg-white p-3 text-sm text-emerald-900"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>{notice}</p></div>}
      {busy && <div role="status" className="flex items-center gap-2 text-xs text-slate-600"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#003366]" />{busyLabel}</div>}

      <div role="tablist" aria-label="Contract workspace" className="flex border-b border-slate-200 bg-white">
        {(contextId ? [{ id: "contracts", label: "Contract gallery" }, { id: "history", label: "Contract history" }, ...(reviewId ? [{ id: "compare", label: "Compare" }] : []), { id: "review", label: "Review" }] : [{ id: "contracts", label: "Contracts" }, ...(reviewId ? [{ id: "compare", label: "Compare" }] : []), { id: "review", label: "Review" }]).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={workspaceTab === tab.id} onClick={() => selectWorkspaceTab(tab.id as "contracts" | "history" | "compare" | "review")} className={`min-h-11 border-b-2 px-5 text-xs font-semibold ${workspaceTab === tab.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]"}`}>{tab.label}{tab.id === "review" && entries.length > 0 ? <span className="ml-2 text-slate-400">{entries.length}</span> : null}</button>)}
      </div>

      {/* Gallery comparison runs after its file selection interaction. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {workspaceTab === "contracts" && contextId && renderContractGallery ? renderContractGallery({ compareFiles: (original, revised) => { void runComparison(original, revised); } }) : workspaceTab === "contracts" && <div className="grid gap-5">
        <section className="border border-slate-200 bg-[#FFFCFB]">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-[#003366]">Add contract documents</h2><p className="mt-1 text-xs text-slate-600">Compare two PDFs, DOCX files, or text documents. Inputs are read in this browser and must use the same format family.</p></div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {(["original", "revised"] as const).map((side) => <section key={side} className="min-w-0 border border-slate-200 bg-white p-3">
              <h3 className="mb-3 text-xs font-semibold text-[#003366]">{side === "original" ? "Earlier version" : "Later version"}</h3>
              <div role="group" aria-label={`${side === "original" ? "Earlier" : "Later"} input type`} className="mb-3 flex gap-2"><button type="button" aria-pressed={inputModes[side] === "file"} onClick={() => selectComparisonFile(side, undefined, "file")} className={`${controlClass} ${inputModes[side] === "file" ? "bg-[#003366] text-white" : ""}`}>Choose file</button><button type="button" aria-pressed={inputModes[side] === "text"} onClick={() => selectComparisonFile(side, undefined, "text")} className={`${controlClass} ${inputModes[side] === "text" ? "bg-[#003366] text-white" : ""}`}>Paste text</button></div>
              {inputModes[side] === "text" ? <><label className="block text-xs text-slate-600">Paste {side === "original" ? "earlier" : "later"} text<textarea aria-label={`Paste ${side} version`} value={pastedText[side]} onChange={(event) => { const value = event.target.value; setPastedText((current) => ({ ...current, [side]: value })); const file = new File([value], `Pasted ${side} version.txt`, { type: "text/plain" }); selectComparisonFile(side, file, "text"); }} disabled={readOnly} rows={7} maxLength={500_000} className="mt-1 min-h-36 w-full border border-slate-300 p-3 text-xs leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]" placeholder="Paste document text here" /></label>{pastedText[side] && <button type="button" onClick={() => { setPastedText((current) => ({ ...current, [side]: "" })); selectComparisonFile(side, undefined, "text"); }} className="mt-2 text-xs font-semibold text-[#003366] underline">Clear text</button>}</> : <><FileField label="PDF, DOCX, TXT, or Markdown" file={side === "original" ? originalFile : revisedFile} onChange={(file) => selectComparisonFile(side, file, "file")} disabled={readOnly} />{(side === "original" ? originalFile : revisedFile) && <button type="button" onClick={() => selectComparisonFile(side, undefined, "file")} className="mt-2 text-xs font-semibold text-[#003366] underline">Remove file</button>}</>}
            </section>)}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-[#003366]">Review name<input value={title} onChange={(event) => setTitle(event.target.value)} readOnly={readOnly} maxLength={120} className="mt-1 min-h-10 w-full border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]" /></label>
            <button type="button" onClick={compare} disabled={!canCompare || readOnly} className="inline-flex min-h-10 items-center justify-center gap-2 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-[#FFFCFB] transition-colors hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C] disabled:cursor-not-allowed disabled:opacity-50"><Upload aria-hidden="true" className="h-4 w-4" />Compare documents</button>
          </div>
        </section>

        {persistenceEnabled && !contextId && <aside className="border border-[#C9A84C]/60 bg-[#FFFCFB]">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-[#003366]">Saved on this device</h2><p className="mt-1 text-xs leading-5 text-slate-600">{storageMode === "browser" ? <>Reviews save in a private browser folder. The register and both Word files stay on this device.</> : storageMode === "indexeddb" ? <>Reviews save in local browser storage on this device.</> : <>Choose Documents once. The review register and both Word files are stored there.</>}</p></div>
          <div className="p-4">
            <div className="mb-3 flex justify-end"><button type="button" className={controlClass} onClick={refreshSavedReviews} disabled={busy}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />Refresh list</button></div>
            {folderReady && !savedReviews.length && <p className="text-xs leading-5 text-slate-600">No saved reviews yet. Save a completed review to keep it with its source documents.</p>}
            {savedReviews.length > 0 && <ul className="divide-y divide-slate-100">{savedReviews.map((review) => <li key={review.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><button type="button" onClick={() => openReview(review)} className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><span className="block truncate text-sm font-semibold text-[#003366]">{review.title}</span><span className="mt-1 block text-[11px] text-slate-500">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(review.savedAt))} · {review.entries.length} entries</span></button>{!readOnly && <button type="button" aria-label={`Delete ${review.title}`} title="Delete saved review and its Word files" onClick={() => void removeReview(review)} disabled={busy} className="inline-flex min-h-9 min-w-9 items-center justify-center border border-slate-300 text-slate-600 hover:border-red-500 hover:text-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}</li>)}</ul>}
          </div>
        </aside>}
      </div>}

      {workspaceTab === "history" && contextId && <DeltaReviewList contextName={contextName || "Project"} contextId={contextId} onStart={() => selectWorkspaceTab("contracts")} onOpen={openReview} />}

      {workspaceTab === "compare" && <section ref={comparisonWorkspaceRef} className="space-y-3">
        <div className="contracts-comparison-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div><h2 className="text-sm font-semibold text-[#003366]">Comparison</h2><p className="text-xs text-slate-600">{visibleEntries.length}{visibleEntries.length !== entries.length ? ` of ${entries.length}` : ""} changes. Review each against its source.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 items-center gap-2 border border-slate-300 bg-white px-3 text-xs text-[#003366]">Changes settings<select aria-label="Changes settings" value={changeFilter} onChange={(event) => setChangeFilter(event.target.value as ChangeFilter)} className="bg-transparent font-semibold"><option value="all">All changes</option><option value="meaningful">Hide blank-only</option></select></label>
            {pdfComparison ? <button type="button" aria-pressed={redline} onClick={() => setRedline((value) => !value)} className={`${controlClass} ${redline ? "bg-[#003366] text-white" : ""}`}>{redline ? "PDF comparison" : "Redline"}</button> : <div role="group" aria-label="Comparison view" className="flex border border-slate-300 bg-white p-1"><button type="button" aria-pressed={!redline} onClick={() => setRedline(false)} className={`min-h-8 px-3 text-xs font-semibold ${!redline ? "bg-[#003366] text-white" : "text-[#003366]"}`}>Side by side</button><button type="button" aria-pressed={redline} onClick={() => setRedline(true)} className={`min-h-8 px-3 text-xs font-semibold ${redline ? "bg-[#003366] text-white" : "text-[#003366]"}`}>Redline</button></div>}
            <details className="relative">
              <summary className={controlClass + " cursor-pointer list-none"}>More <span aria-hidden="true">▾</span></summary>
              <div className="absolute right-0 z-30 mt-1 flex w-60 flex-col gap-2 border border-slate-300 bg-white p-3 shadow-lg">
                {!pdfComparison && <><label className="sr-only" htmlFor="comparison-doc-search">Search documents</label><input id="comparison-doc-search" aria-label="Search documents" type="search" placeholder="Search documents" className={controlClass} onKeyDown={(event) => { if (event.key === "Enter" && event.currentTarget.value) { const query = event.currentTarget.value.toLocaleLowerCase(); const match = Array.from(comparisonWorkspaceRef.current?.querySelectorAll<HTMLElement>("pre, p, [data-word-change]") || []).find((node) => node.textContent?.toLocaleLowerCase().includes(query)); match?.scrollIntoView?.({ block: "center" }); } }} /></>}
                <button type="button" onClick={() => { if (!document.fullscreenElement) void comparisonWorkspaceRef.current?.requestFullscreen(); else void document.exitFullscreen(); }} className={controlClass}>Full screen</button>
                <button type="button" onClick={() => window.print()} className={controlClass}>Print</button>
                <button type="button" onClick={exportRegister} disabled={busy || !visibleEntries.length} className={controlClass}>Download register</button>
                <p className="text-[11px] leading-4 text-slate-500">Use Changes settings to hide blank-only wording. Source documents stay unchanged.</p>
              </div>
            </details>
          </div>
        </div>
        {!sourceTexts && <p role="status" className="border border-amber-300 bg-[#FCFAF2] p-3 text-xs text-[#66551F]">Source preview is unavailable. Saved review decisions remain available in the Review tab.</p>}
        {redline && sourceTexts && <TextResultPanel key={`${reviewId}-${changeFilter}`} earlierName={originalFile?.name || "Earlier version"} laterName={revisedFile?.name || "Later version"} earlierText={sourceTexts.original} laterText={sourceTexts.revised} entries={visibleEntries} caveat={pdfComparison && (pdfComparison.scannedPages.original.length || pdfComparison.scannedPages.revised.length) ? "Some PDF pages have no selectable text and were not compared. Text is compared in this browser; confirm each change against the source PDFs." : undefined} />}
        {!redline && pdfComparison && pdfDocuments && <PdfComparisonPanel key={`${reviewId}-${changeFilter}`} originalName={pdfDocuments.original.name} revisedName={pdfDocuments.revised.name} originalPages={pdfDocuments.original.pages} revisedPages={pdfDocuments.revised.pages} originalDocument={pdfDocuments.original.document} revisedDocument={pdfDocuments.revised.document} comparison={{ ...pdfComparison, changes: filterBlankOnlyChanges(pdfComparison.changes, changeFilter) }} />}
        {!redline && wordDocuments && !pdfComparison && <WordComparisonPanel key={`${reviewId}-${changeFilter}`} originalName={wordDocuments.original.name} revisedName={wordDocuments.revised.name} originalHtml={wordDocuments.original.html} revisedHtml={wordDocuments.revised.html} entries={visibleEntries} />}
        {!redline && !pdfComparison && !wordDocuments && sourceTexts && <TextResultPanel key={`${reviewId}-${changeFilter}`} earlierName={originalFile?.name || "Earlier version"} laterName={revisedFile?.name || "Later version"} earlierText={sourceTexts.original} laterText={sourceTexts.revised} entries={visibleEntries} />}
      </section>}

      {workspaceTab === "review" && visibleEntries.length > 0 && <section className="border border-slate-200 bg-[#FFFCFB]">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold text-[#003366]">Change register <span className="ml-1 font-normal text-slate-500">{visibleEntries.length} entries</span></h2><p className="mt-1 text-xs text-slate-600">Review aid only. Verify each entry against the source documents.</p></div>{persistenceEnabled && <div className="flex flex-wrap gap-2"><button type="button" className={controlClass} onClick={exportRegister} disabled={busy}><Download aria-hidden="true" className="h-4 w-4" />Export Word</button>{!readOnly && <button type="button" className={controlClass} onClick={saveCurrentReview} disabled={busy || !reviewId || !originalFile || !revisedFile}><Save aria-hidden="true" className="h-4 w-4" />Save locally</button>}</div>}</div>
        <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-600">{pdfComparison ? "Changes are grouped by source PDF page. Verify each highlight against the original PDFs." : commentsFound ? "Word comments were found and are attached to relevant entries below." : "No Word comments found in either document."}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-100 bg-white px-4 py-2 text-[10px] text-slate-500"><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-rose-100 ring-1 ring-rose-300" />Removed from original wording</span><span><span className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-100 ring-1 ring-emerald-300" />Added to reviewed wording</span></div>
        <ol className="divide-y divide-slate-200">{visibleEntries.map((entry, index) => <li key={entry.id} className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31577D]">Entry {index + 1} · Section {entry.section}</p><h3 className="mt-1 text-sm font-semibold text-[#003366]">{entry.summary}</h3></div><div className="flex flex-wrap items-center gap-2">{!readOnly && <><button type="button" onClick={() => updateEntry(entry.id, { approval: entry.approval === "approved" ? undefined : "approved" })} disabled={busy} aria-pressed={entry.approval === "approved"} className={`${controlClass} ${entry.approval === "approved" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : ""}`}>{entry.approval === "approved" ? <><Check aria-hidden="true" className="h-4 w-4" />Approved</> : "Approve"}</button><button type="button" onClick={() => startAmendment(entry)} disabled={busy} className={controlClass}>{entry.amendment ? "Edit amendment" : "Amend"}</button><button type="button" onClick={() => void explain(entry)} disabled={busy} className={controlClass}>{entry.explanation ? <><Check aria-hidden="true" className="h-4 w-4 text-emerald-700" />Regenerate explanation</> : "Explain change"}</button></>}</div></div>
          {entry.comments.length > 0 && <div className="mt-3 border-l-2 border-[#C9A84C] bg-[#F7FAFC] p-3"><p className="flex items-center gap-2 text-xs font-semibold text-[#003366]"><MessageSquareText aria-hidden="true" className="h-4 w-4" />Word comment{entry.comments.length > 1 ? "s" : ""}</p>{entry.comments.map((comment, commentIndex) => <p key={`${entry.id}-comment-${commentIndex}`} className="mt-2 text-xs leading-5 text-slate-700"><strong>{comment.author}:</strong> {comment.text}</p>)}</div>}
          <div className="mt-3 grid gap-3 lg:grid-cols-2"><Wording label={`Earlier wording · ${entry.originalSection}`} text={entry.originalText} counterpart={entry.revisedText} side="original" empty="Section not present in the earlier version." /><Wording label={`Later wording · ${entry.revisedSection}`} text={entry.revisedText} counterpart={entry.originalText} side="revised" empty="Section removed from the later version." /></div>
          {!readOnly && amendmentEntryId === entry.id && <section className="mt-4 border border-[#C9A84C]/60 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h4 className="text-xs font-semibold text-[#003366]">Amendment suggestion</h4><button type="button" onClick={() => setAmendmentEntryId("")} aria-label="Close amendment editor" className="inline-flex h-8 w-8 items-center justify-center text-slate-500 hover:text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><X aria-hidden="true" className="h-4 w-4" /></button></div><div className="grid gap-3 p-4"><label className="text-xs font-semibold text-[#003366]">Comment<textarea value={amendmentComment} onChange={(event) => setAmendmentComment(event.target.value)} rows={3} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]" placeholder="Add context or explain the proposed change" /></label><label className="text-xs font-semibold text-[#003366]">Proposed clause wording<textarea value={amendmentWording} onChange={(event) => setAmendmentWording(event.target.value)} rows={5} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]" placeholder="Enter replacement wording for this section (optional)" /></label><p className="text-[11px] leading-5 text-slate-500">A comment or proposed wording is required. This suggestion does not change either Word file.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setAmendmentEntryId("")} className={controlClass}>Cancel</button><button type="button" onClick={() => saveAmendment(entry)} className="inline-flex min-h-10 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#174778]"><Save aria-hidden="true" className="h-4 w-4" />Save amendment</button></div></div></section>}
          {entry.amendment && amendmentEntryId !== entry.id && <section className="mt-4 border-l-2 border-[#C9A84C] bg-white p-3"><h4 className="text-xs font-semibold text-[#003366]">Amendment suggestion</h4>{entry.amendment.comment && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{entry.amendment.comment}</p>}{entry.amendment.wording && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Proposed wording</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{entry.amendment.wording}</p></div>}</section>}
          {entry.explanation && <section className="mt-4 border border-[#C9A84C]/50 bg-white"><div className="border-b border-slate-100 px-4 py-2.5"><h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31577D]">Explanation</h4></div><p className="whitespace-pre-line px-4 py-3 text-sm leading-6 text-slate-700">{cleanExplanation(entry.explanation)}</p></section>}
        </li>)}</ol>
        <p className="border-t border-slate-200 px-4 py-3 text-[11px] leading-5 text-slate-500">AI explanations are optional and sent only when you request them. Confirm all comparisons against the source documents.</p>
      </section>}
      {workspaceTab === "review" && visibleEntries.length === 0 && <section className="border border-slate-200 bg-[#FFFCFB] px-6 py-12 text-center"><FileText aria-hidden="true" className="mx-auto h-6 w-6 text-[#31577D]" /><h2 className="mt-3 text-base font-semibold text-[#003366]">{reviewId && originalFile && revisedFile ? entries.length ? "No visible differences" : "No differences found" : "No review to show yet"}</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-600">{reviewId && originalFile && revisedFile ? entries.length ? "The active filter hides blank-only changes. Choose All changes to review them." : pdfComparison ? "No wording changes were detected in comparable PDF text. Pages without selectable text are listed above." : "No wording, numbering, or comment changes were found between these documents." : "Add earlier and later PDF, DOCX, or text files, then compare them to see the results here."}</p>{persistenceEnabled && reviewId && originalFile && revisedFile && !readOnly && <button type="button" onClick={() => void saveCurrentReview()} disabled={busy} className={`${controlClass} mt-4`}><Save aria-hidden="true" className="h-4 w-4" />Save locally</button>}<button type="button" onClick={() => selectWorkspaceTab("contracts")} className="mt-4 inline-flex min-h-10 items-center border border-[#003366] px-4 text-xs font-semibold text-[#003366] hover:bg-[#F7FAFC]">Go to Contracts</button></section>}
    </section>
  );
}

export function DeltaReviewList({ contextName, contextId, initialReviewId, onStart, onOpen, readOnly = false }: { contextName: string; contextId: string; initialReviewId?: string; onStart: () => void; onOpen: (review: SavedDeltaReview) => void; readOnly?: boolean }) {
  const [reviews, setReviews] = useState<SavedDeltaReview[]>([]);
  const [folderReady, setFolderReady] = useState(false);
  const [storageMode, setStorageMode] = useState<ReviewStorageMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const scopedReviews = useMemo(() => reviews.filter((review) => reviewMatchesContext(review, contextId, contextName)), [contextId, contextName, reviews]);

  const refresh = async () => {
    setLoading(true); setError("");
    try {
      const saved = await listReviews();
      setReviews(saved); setFolderReady(true);
      setStorageMode(await getReviewStorageMode());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saved comparisons could not be read.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    hasChosenFolder().then(async (chosen) => {
      if (!active) return;
      setFolderReady(chosen);
      setStorageMode(await getReviewStorageMode());
      if (chosen) {
        try {
          const saved = await listReviews();
          if (!active) return;
          setReviews(saved);
          if (initialReviewId) {
            const requested = saved.find((review) => review.id === initialReviewId && reviewMatchesContext(review, contextId, contextName));
            if (requested) onOpen(requested);
            else setError("That saved comparison could not be found in this subproject.");
          }
        }
        catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Saved comparisons could not be read."); }
      } else if (initialReviewId) {
        setError("Choose your Documents folder to reopen this saved comparison.");
      }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "The local save folder could not be checked."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Load once from the route-selected review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFolder = async () => {
    setLoading(true); setError("");
    try { const storage = await chooseReviewFolder(); setStorageMode(storage.mode); setFolderReady(true); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The Documents folder could not be opened."); setLoading(false); }
  };

  const remove = async (review: SavedDeltaReview) => {
    if (readOnly) return;
    const location = storageMode === "documents" ? "Documents" : storageMode === "browser" ? "this browser's local contract reviews folder" : "local browser storage";
    if (!window.confirm(`Delete ${review.title} and its source files from ${location}?`)) return;
    setLoading(true); setError("");
    try { await deleteReview(review.id); setReviews((current) => current.filter((item) => item.id !== review.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The comparison could not be deleted."); }
    finally { setLoading(false); }
  };

  return <section className="space-y-4">
    <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Contract review</p><h2 className="mt-1 text-lg font-semibold text-[#003366]">Comparisons</h2><p className="mt-1 text-xs text-slate-600">Saved locally for {contextName}{storageMode === "browser" ? " · private browser folder" : storageMode === "indexeddb" ? " · browser storage" : ""}.</p></div><div className="flex flex-wrap gap-2">{!readOnly && <button type="button" onClick={() => void onStart()} className="inline-flex min-h-10 items-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]"><Plus aria-hidden="true" className="h-4 w-4" />New comparison</button>}{folderReady ? <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh comparisons" title="Refresh comparisons" className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-white text-[#003366] hover:border-[#003366] disabled:opacity-50"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button> : <button type="button" onClick={() => void chooseFolder()} disabled={loading} className={controlClass}><FolderOpen aria-hidden="true" className="h-4 w-4" />Set up local saving</button>}</div></header>
    {error && <p role="alert" className="border border-red-300 bg-white px-3 py-2 text-xs text-red-900">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 border border-slate-200 bg-white p-4 text-xs text-slate-600"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#003366]" />Loading comparisons</p>}
    {!loading && folderReady && scopedReviews.length > 0 && <ul className="divide-y divide-slate-200 border border-slate-200 bg-white">{scopedReviews.map((review) => <li key={review.id} className="flex items-center gap-3 p-4"><button type="button" onClick={() => onOpen(review)} className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><span className="block truncate text-sm font-semibold text-[#003366]">{review.title}</span><span className="mt-1 block text-[11px] text-slate-500">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(review.savedAt))} · {review.entries.length} changes</span><span className="mt-1 block truncate text-[10px] text-slate-500">{review.originalName} → {review.revisedName}</span></button>{!readOnly && <button type="button" aria-label={`Delete ${review.title}`} title="Delete comparison and its source files" onClick={() => void remove(review)} disabled={loading || readOnly} className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-slate-300 text-slate-500 hover:border-red-500 hover:text-red-800 disabled:opacity-50"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}</li>)}</ul>}
    {!loading && folderReady && scopedReviews.length === 0 && <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><FileText aria-hidden="true" className="mx-auto h-6 w-6 text-[#31577D]" /><h3 className="mt-3 text-sm font-semibold text-[#003366]">No comparisons saved for this subproject</h3><p className="mt-1 text-xs text-slate-600">{readOnly ? "No comparisons are available to view on this device." : "Start a comparison and save it to keep it in this list."}</p>{!readOnly && <button type="button" onClick={onStart} className="mt-4 inline-flex min-h-10 items-center gap-2 border border-[#003366] px-3 text-xs font-semibold text-[#003366] hover:bg-[#F7FAFC]"><Plus aria-hidden="true" className="h-4 w-4" />New comparison</button>}</div>}
    {!loading && !folderReady && <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><FolderOpen aria-hidden="true" className="mx-auto h-6 w-6 text-[#31577D]" /><h3 className="mt-3 text-sm font-semibold text-[#003366]">Choose a local save folder</h3><p className="mt-1 text-xs text-slate-600">Saved comparisons stay on this device, in Documents when folder access is available or in this browser&apos;s private storage otherwise.</p><button type="button" onClick={() => void chooseFolder()} className="mt-4 inline-flex min-h-10 items-center gap-2 border border-[#003366] px-3 text-xs font-semibold text-[#003366] hover:bg-[#F7FAFC]"><FolderOpen aria-hidden="true" className="h-4 w-4" />Set up local saving</button></div>}
  </section>;
}

function FileField({ label, file, onChange, disabled = false }: { label: string; file?: File; onChange: (file: File | undefined) => void; disabled?: boolean }) {
  return <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) onChange(event.dataTransfer.files[0]); }} className={`flex min-h-32 ${disabled ? "cursor-default" : "cursor-pointer"} flex-col justify-between border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600 transition-colors hover:border-[#31577D] focus-within:outline focus-within:outline-2 focus-within:outline-[#003366]`}><span><span className="block font-semibold text-[#003366]">{label}</span><span className="mt-1 block">PDF, DOCX, TXT, or Markdown · max 20 MiB</span></span><span className="mt-4 flex items-center gap-2 truncate"><Upload aria-hidden="true" className="h-4 w-4 shrink-0 text-[#31577D]" />{file?.name || "Choose or drop a file"}</span><input type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain,.md,text/markdown" disabled={disabled} className="sr-only" onChange={(event) => onChange(event.target.files?.[0])} /></label>;
}

function DiffWording({ text, counterpart, side, empty }: { text: string; counterpart: string; side: "original" | "revised"; empty: string }) {
  if (!text) return <p className="px-3 py-3 text-xs italic text-slate-500">{empty}</p>;
  const parts = side === "original" ? diffParts(text, counterpart).original : diffParts(counterpart, text).revised;
  return <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{parts.map((part, index) => part.changed ? <mark key={index} className={side === "original" ? "bg-rose-100 text-rose-950" : "bg-emerald-100 text-emerald-950"}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</p>;
}

function Wording({ label, text, counterpart, side, empty }: { label: string; text: string; counterpart: string; side: "original" | "revised"; empty: string }) {
  return <section className="min-w-0 border border-slate-200 bg-white"><h4 className="border-b border-slate-100 bg-[#F7FAFC] px-3 py-2 text-[10px] font-semibold text-[#003366]">{label}</h4><div className="px-3 py-3">{text ? <DiffWording text={text} counterpart={counterpart} side={side} empty={empty} /> : <p className="text-xs italic text-slate-500">{empty}</p>}</div></section>;
}
