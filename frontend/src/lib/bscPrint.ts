import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type BscSheet = {
  name: string;
  rows: string[][];
};

export type PaperSize = "a4" | "legal";
export type PageOrientation = "portrait" | "landscape";

export type PrintOptions = {
  paperSize: PaperSize;
  orientation: PageOrientation;
  margins: { top: number; right: number; bottom: number; left: number };
  headerRowBySheet: Record<string, number>;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}

function trimTrailingEmptyColumns(rows: string[][]) {
  const columnCount = rows.reduce((largest, row) => {
    const lastValue = row.reduce((index, cell, cellIndex) => (cell.trim() ? cellIndex + 1 : index), 0);
    return Math.max(largest, lastValue);
  }, 0);
  return rows.map((row) => row.slice(0, columnCount));
}

export async function readBscFile(file: File): Promise<BscSheet[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const rows = trimTrailingEmptyColumns(parseCsv(await file.text()));
    if (!rows.length) throw new Error("This CSV has no printable rows.");
    return [{ name: file.name.replace(/\.csv$/i, ""), rows }];
  }

  if (extension !== "xlsx" && extension !== "xlsm") {
    throw new Error("Choose a CSV file or an Excel workbook saved as .xlsx or .xlsm.");
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets = workbook.worksheets.map((worksheet) => {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        const cell = row.getCell(column);
        values.push(cell.text || "");
      }
      rows.push(values);
    });
    return { name: worksheet.name, rows: trimTrailingEmptyColumns(rows) };
  }).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim())));

  if (!sheets.length) throw new Error("This workbook has no printable worksheets.");
  return sheets;
}

export function detectHeaderRow(rows: string[][]): number {
  const sample = rows.slice(0, 80);
  const scorecardHeader = sample.findIndex((row) => row.some((cell) => /performance objectives/i.test(cell)) && row.some((cell) => /key performance indicators/i.test(cell)));
  if (scorecardHeader >= 0) return scorecardHeader;
  const maximumColumns = Math.max(1, ...sample.map((row) => row.length));
  let bestIndex = 0;
  let bestScore = -1;

  sample.forEach((row, index) => {
    const filled = row.filter((cell) => cell.trim()).length;
    if (filled < 2) return;
    const shortText = row.filter((cell) => cell.trim() && cell.trim().length <= 48).length;
    const knownHeader = row.filter((cell) => /objective|indicator|target|weight|deadline|status|rating|description|category|owner|date|name|score/i.test(cell)).length;
    const density = filled / maximumColumns;
    const score = filled * 2 + shortText + knownHeader * 3 + density * 5 - index * 0.03;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function headerBlock(rows: string[][], startIndex: number) {
  const first = rows[startIndex] || [];
  const next = rows[startIndex + 1] || [];
  const firstText = first.join(" ");
  const nextText = next.join(" ");
  const firstCount = first.filter((cell) => cell.trim()).length;
  const nextCount = next.filter((cell) => cell.trim()).length;
  const isGroupedScorecardHeader = /performance objectives/i.test(firstText)
    && /key performance indicators/i.test(firstText)
    && nextCount >= Math.max(4, firstCount * 0.5)
    && /performance standard|targets achieved|percentage achieved|validated rating/i.test(nextText);
  return isGroupedScorecardHeader ? [first, next] : [first];
}

export function createBscPdf(fileName: string, sheets: BscSheet[], options: PrintOptions): Blob {
  const doc = new jsPDF({ orientation: options.orientation, unit: "pt", format: options.paperSize });
  const margin = {
    top: options.margins.top * 72,
    right: options.margins.right * 72,
    bottom: options.margins.bottom * 72,
    left: options.margins.left * 72,
  };
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableTop = margin.top + 27;
  const fontSize = Math.max(5, Math.min(8, 155 / Math.max(1, ...sheets.map((sheet) => Math.max(...sheet.rows.map((row) => row.length))))));

  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) doc.addPage();
    const headerIndex = Math.max(0, Math.min(options.headerRowBySheet[sheet.name] ?? detectHeaderRow(sheet.rows), sheet.rows.length - 1));
    const repeatedHeaderRows = headerBlock(sheet.rows, headerIndex);
    const header = repeatedHeaderRows.map((row) => row.map((cell, index) => cell.trim() || (row === repeatedHeaderRows[repeatedHeaderRows.length - 1] ? `Column ${index + 1}` : "")));
    const skippedHeaderIndexes = new Set(repeatedHeaderRows.map((_, index) => headerIndex + index));
    const body = sheet.rows
      .filter((_, index) => !skippedHeaderIndexes.has(index))
      .map((row) => header[header.length - 1].map((_, index) => row[index] || ""));
    const title = sheet.name || fileName;

    autoTable(doc, {
      head: [header],
      body,
      startY: tableTop,
      margin: { top: tableTop, right: margin.right, bottom: margin.bottom + 18, left: margin.left },
      tableWidth: "auto",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize,
        cellPadding: 1.7,
        overflow: "linebreak",
        valign: "top",
        lineColor: [203, 213, 225],
        lineWidth: 0.25,
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [0, 51, 102],
        textColor: [255, 252, 251],
        fontStyle: "bold",
        lineColor: [49, 87, 125],
      },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      didDrawPage: () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(0, 51, 102);
        doc.text("MOSAIC  /  BSC PRINT", margin.left, margin.top + 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(`${title}  ·  ${options.paperSize.toUpperCase()} ${options.orientation}`, margin.left, margin.top + 19);
        doc.setDrawColor(201, 168, 76);
        doc.setLineWidth(0.7);
        doc.line(margin.left, margin.top + 23, pageWidth - margin.right, margin.top + 23);
      },
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${fileName}  ·  ${pageNumber} / ${pageCount}`, margin.left, doc.internal.pageSize.getHeight() - margin.bottom / 2);
  }

  return doc.output("blob");
}
