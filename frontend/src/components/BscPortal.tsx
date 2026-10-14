"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUp, LoaderCircle, Printer, RotateCcw, ShieldCheck } from "lucide-react";
import { createBscPdf, detectHeaderRow, readBscFile, type BscSheet, type PageOrientation, type PaperSize } from "@/lib/bscPrint";

type MarginPreset = "narrow" | "normal" | "wide" | "custom";
type Margins = { top: number; right: number; bottom: number; left: number };

const PRESET_MARGINS: Record<Exclude<MarginPreset, "custom">, number> = {
  narrow: 0.25,
  normal: 0.5,
  wide: 1,
};
const INITIAL_MARGINS: Margins = { top: 0.3, right: 0.3, bottom: 0.3, left: 0.3 };

/*
Design Read: internal BSC print utility for Mosaic users, in the Mosaic navy and gold business workspace, ENERGY 1 / RHYTHM 1 / MOTION 1.
Design decisions: the compact Projects header pattern gives the tool a familiar location; the spreadsheet icon identifies the accepted source format; navy heads distinguish printed table structure; gold marks the active step and page rule; squared white panels keep controls legible beside a dense sheet preview; the worksheet preview is the focal point because users need to inspect their print source before exporting.
*/

function formatMargin(value: number) {
  return `${Number(value.toFixed(2))}″`;
}

export function BscPortal() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfUrlRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<BscSheet[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [headerRows, setHeaderRows] = useState<Record<string, number>>({});
  const [paperSize, setPaperSize] = useState<PaperSize>("a4");
  const [orientation, setOrientation] = useState<PageOrientation>("landscape");
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("custom");
  const [margins, setMargins] = useState<Margins>(INITIAL_MARGINS);
  const [pdfUrl, setPdfUrl] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
  }, []);

  const selectedSheetData = useMemo(
    () => sheets.filter((sheet) => selectedSheets.includes(sheet.name)),
    [sheets, selectedSheets],
  );
  const previewSheet = selectedSheetData[0];
  const previewRows = previewSheet?.rows.slice(0, 8) || [];
  const previewColumns = Math.min(8, Math.max(0, ...previewRows.map((row) => row.length)));

  const clearPdf = () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = "";
    setPdfUrl("");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setIsReading(true);
    setError("");
    setFileName(file.name);
    clearPdf();
    try {
      const loaded = await readBscFile(file);
      setSheets(loaded);
      setSelectedSheets([loaded[0].name]);
      setHeaderRows(Object.fromEntries(loaded.map((sheet) => [sheet.name, detectHeaderRow(sheet.rows)])));
    } catch (loadError) {
      setSheets([]);
      setSelectedSheets([]);
      setHeaderRows({});
      setError(loadError instanceof Error ? loadError.message : "The selected file could not be read.");
    } finally {
      setIsReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const reset = () => {
    setFileName("");
    setSheets([]);
    setSelectedSheets([]);
    setHeaderRows({});
    setError("");
    clearPdf();
  };

  const updateMarginPreset = (value: MarginPreset) => {
    setMarginPreset(value);
    if (value !== "custom") {
      const dimension = PRESET_MARGINS[value];
      setMargins({ top: dimension, right: dimension, bottom: dimension, left: dimension });
    }
    clearPdf();
  };

  const updateMargin = (side: keyof Margins, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setMarginPreset("custom");
    setMargins((current) => ({ ...current, [side]: Math.max(0, Math.min(2, parsed)) }));
    clearPdf();
  };

  const toggleSheet = (sheetName: string) => {
    setSelectedSheets((current) => {
      if (current.includes(sheetName)) {
        if (current.length === 1) return current;
        return current.filter((name) => name !== sheetName);
      }
      return [...current, sheetName];
    });
    clearPdf();
  };

  const generatePdf = () => {
    if (!selectedSheetData.length) return;
    setIsGenerating(true);
    setError("");
    clearPdf();
    try {
      const blob = createBscPdf(fileName || "BSC workbook", selectedSheetData, {
        paperSize,
        orientation,
        margins,
        headerRowBySheet: headerRows,
      });
      const nextUrl = URL.createObjectURL(blob);
      pdfUrlRef.current = nextUrl;
      setPdfUrl(nextUrl);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "The PDF could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  const safeFileName = (fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "BSC") + "-print.pdf";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-8">
      <header className="flex min-h-[58px] flex-col justify-between gap-2 border-b border-[#003366]/15 pb-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#C9A84C]/60 bg-[#FBF7E9] text-[#003366]"><FileSpreadsheet className="h-4 w-4" /></span>
          <div className="min-w-0 border-l-2 border-[#C9A84C] py-0.5 pl-2.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Tools / BSC</p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-[#003366]">Print-ready scorecards</h1>
            <p className="mt-0.5 text-xs text-slate-600">Turn a CSV or Excel worksheet into a clean, page-aware PDF.</p>
          </div>
        </div>
        {sheets.length > 0 && <button type="button" onClick={reset} className="inline-flex h-8 items-center justify-center gap-1.5 self-start border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] sm:self-auto"><RotateCcw className="h-3.5 w-3.5" />Clear file</button>}
      </header>

      <section aria-labelledby="import-title" className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 id="import-title" className="text-sm font-semibold text-[#003366]">1. Import a workbook</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">CSV, XLSX, or XLSM. Files are read in this browser tab.</p>
          </div>
          {fileName && <span className="max-w-full truncate border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{fileName}</span>}
        </div>
        <div
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); void loadFile(event.dataTransfer.files[0]); }}
          className={`m-4 flex min-h-28 flex-col items-center justify-center border border-dashed px-4 py-5 text-center transition-colors ${isDragging ? "border-[#003366] bg-[#F0F5FA]" : "border-slate-300 bg-[#FFFCFB]"}`}
        >
          {isReading ? <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#31577D]" /> : <FileUp aria-hidden="true" className="h-5 w-5 text-[#31577D]" />}
          <p className="mt-2 text-xs font-semibold text-[#003366]">{isReading ? "Reading workbook locally…" : "Drop a file here, or choose one"}</p>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void loadFile(event.target.files?.[0])} className="sr-only" aria-label="Choose a CSV or Excel workbook" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isReading} className="mt-2 inline-flex min-h-8 items-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#174778] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">Choose file</button>
        </div>
        <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-2.5 text-[10px] leading-4 text-slate-500"><ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#31577D]" /><p>Workbook contents stay in memory for this session. They are not uploaded or saved, and clear when you leave or reload this page.</p></div>
      </section>

      {sheets.length > 0 && <>
        {sheets.length > 1 && <section aria-labelledby="sheets-title" className="border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3"><h2 id="sheets-title" className="text-sm font-semibold text-[#003366]">2. Choose worksheets</h2><p className="mt-0.5 text-[11px] text-slate-500">Selected worksheets are combined into one PDF, each starting on a fresh page.</p></div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {sheets.map((sheet) => <label key={sheet.name} className="flex min-h-10 items-center gap-2 border border-slate-100 px-2.5 text-xs text-slate-700 hover:border-[#C9A84C] focus-within:outline focus-within:outline-2 focus-within:outline-[#003366]">
              <input type="checkbox" checked={selectedSheets.includes(sheet.name)} onChange={() => toggleSheet(sheet.name)} className="h-4 w-4 accent-[#003366]" />
              <span className="min-w-0 flex-1 truncate">{sheet.name}</span><span className="shrink-0 text-[10px] text-slate-400">{sheet.rows.length} rows</span>
            </label>)}
          </div>
        </section>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="preview-title" className="min-w-0 border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div><h2 id="preview-title" className="text-sm font-semibold text-[#003366]">{sheets.length > 1 ? "3." : "2."} Review worksheet data</h2><p className="mt-0.5 text-[11px] text-slate-500">{previewSheet ? `${previewSheet.name} · ${previewSheet.rows.length} rows · ${Math.max(0, ...previewSheet.rows.map((row) => row.length))} columns` : "Choose at least one worksheet."}</p></div>
              {previewSheet && <label className="flex items-center gap-2 text-[10px] text-slate-600">Repeat header row<select aria-label={`Header row for ${previewSheet.name}`} value={headerRows[previewSheet.name] ?? detectHeaderRow(previewSheet.rows)} onChange={(event) => { setHeaderRows((current) => ({ ...current, [previewSheet.name]: Number(event.target.value) })); clearPdf(); }} className="h-8 max-w-52 border border-slate-300 bg-white px-2 text-[11px] text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">{previewSheet.rows.slice(0, 80).map((row, index) => <option key={index} value={index}>Row {index + 1}: {row.filter(Boolean).slice(0, 2).join(" / ").slice(0, 38) || "Blank"}</option>)}</select></label>}
            </div>
            {previewSheet ? <div className="max-h-[360px] overflow-auto">
              <table className="w-full border-collapse text-left text-[10px]">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[9px] font-semibold uppercase tracking-wide text-slate-600"><tr>{Array.from({ length: previewColumns }, (_, index) => <th key={index} className="whitespace-nowrap border border-slate-200 px-2 py-1.5">Column {index + 1}</th>)}</tr></thead>
                <tbody>{previewRows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex % 2 ? "bg-slate-50" : "bg-white"}>{Array.from({ length: previewColumns }, (_, columnIndex) => <td key={columnIndex} className="max-w-64 border border-slate-200 px-2 py-1.5 align-top text-slate-700">{row[columnIndex] || <span className="text-slate-300">·</span>}</td>)}</tr>)}</tbody>
              </table>
              <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">Showing the first 8 rows and up to 8 columns.</p>
            </div> : <p className="px-4 py-8 text-center text-xs text-slate-500">Choose at least one worksheet to continue.</p>}
          </section>

          <section aria-labelledby="print-title" className="border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3"><h2 id="print-title" className="text-sm font-semibold text-[#003366]">{sheets.length > 1 ? "4." : "3."} Print setup</h2><p className="mt-0.5 text-[11px] text-slate-500">Set paper and margins before previewing.</p></div>
            <div className="space-y-3 p-4">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Paper size<select value={paperSize} onChange={(event) => { setPaperSize(event.target.value as PaperSize); clearPdf(); }} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-normal normal-case tracking-normal text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><option value="a4">A4 · 8.27″ × 11.69″</option><option value="legal">Legal · 8.5″ × 14″</option></select></label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Orientation<select value={orientation} onChange={(event) => { setOrientation(event.target.value as PageOrientation); clearPdf(); }} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-normal normal-case tracking-normal text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Margins<select value={marginPreset} onChange={(event) => updateMarginPreset(event.target.value as MarginPreset)} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-normal normal-case tracking-normal text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><option value="narrow">Narrow · 0.25″</option><option value="normal">Normal · 0.5″</option><option value="wide">Wide · 1″</option><option value="custom">Custom · {formatMargin(margins.top)} top, {formatMargin(margins.right)} right</option></select></label>
              {marginPreset === "custom" && <fieldset className="grid grid-cols-2 gap-2 border border-slate-200 p-2.5"><legend className="px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Custom margins</legend>{(["top", "right", "bottom", "left"] as const).map((side) => <label key={side} className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{side}<span className="mt-1 flex h-8 items-center border border-slate-300 bg-white px-2"><input aria-label={`${side} margin in inches`} type="number" min="0" max="2" step="0.05" value={margins[side]} onChange={(event) => updateMargin(side, event.target.value)} className="w-full min-w-0 text-xs font-normal text-[#003366] outline-none" /><span className="text-[10px] font-normal text-slate-400">in</span></span></label>)}</fieldset>}
              <p className="border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-2.5 py-2 text-[10px] leading-4 text-slate-600">Rows stay intact when possible. Column headers repeat on each page, and oversized content wraps inside its cells.</p>
              <button type="button" onClick={generatePdf} disabled={!selectedSheetData.length || isGenerating} className="inline-flex min-h-10 w-full items-center justify-center gap-2 border border-[#003366] bg-[#003366] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#174778] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]">{isGenerating ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Printer aria-hidden="true" className="h-4 w-4" />}{isGenerating ? "Building preview…" : "Generate PDF preview"}</button>
              {pdfUrl && <a href={pdfUrl} download={safeFileName} className="inline-flex min-h-9 w-full items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] transition-colors hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><Download aria-hidden="true" className="h-4 w-4" />Download PDF</a>}
            </div>
          </section>
        </div>
      </>}

      {error && <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">{error}</div>}

      {pdfUrl && <section aria-labelledby="pdf-preview-title" className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div><h2 id="pdf-preview-title" className="text-sm font-semibold text-[#003366]">Print preview</h2><p className="mt-0.5 text-[11px] text-slate-500">Review page breaks and cell wrapping before downloading.</p></div><a href={pdfUrl} download={safeFileName} className="inline-flex h-8 items-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] hover:border-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]"><Download aria-hidden="true" className="h-3.5 w-3.5" />Download PDF</a></div>
        <iframe title="Generated BSC PDF print preview" src={pdfUrl} className="h-[min(78vh,900px)] min-h-[520px] w-full bg-slate-100" />
      </section>}
    </div>
  );
}
