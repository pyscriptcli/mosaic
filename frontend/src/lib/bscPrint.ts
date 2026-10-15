import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type CellHookData, type RowInput, type Styles } from "jspdf-autotable";

export type BscBorder = {
  color: [number, number, number];
  width: number;
  dash?: number[];
  double?: boolean;
};

export type BscCell = {
  text: string;
  styles: Partial<Styles>;
  borders: Partial<Record<"top" | "right" | "bottom" | "left", BscBorder>>;
  underline?: boolean;
};

export type BscMerge = {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
};

export type BscSheet = {
  name: string;
  rows: BscCell[][];
  columnWidths: number[];
  rowHeights: number[];
  merges: BscMerge[];
  printArea: string;
  showGridlines: boolean;
  pageSetup: {
    paperSize?: PaperSize;
    orientation?: PageOrientation;
    margins?: { top: number; right: number; bottom: number; left: number };
  };
};

export type PaperSize = "a4" | "legal";
export type PageOrientation = "portrait" | "landscape";

export type PrintOptions = {
  paperSize: PaperSize;
  orientation: PageOrientation;
  margins: { top: number; right: number; bottom: number; left: number };
  headerRowBySheet: Record<string, number>;
  printAreaBySheet: Record<string, string>;
  pageBreaksBySheet: Record<string, string>;
  repeatHeaders: boolean;
  showGridlines: boolean;
  fitToWidth: boolean;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
};

export type BscPdfResult = { blob: Blob; pageCount: number };

type Rgb = [number, number, number];
type BscPdfCellDef = CellDef & { bscBorders?: BscCell["borders"]; bscUnderline?: boolean };
type ExcelColor = { argb?: string; rgb?: string; indexed?: number; theme?: number; tint?: number };
type ExcelBorder = { style?: string; color?: ExcelColor };
type ExcelStyle = {
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: ExcelColor };
  fill?: { type?: string; pattern?: string; fgColor?: ExcelColor; bgColor?: ExcelColor };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean; indent?: number; textRotation?: number };
  border?: { top?: ExcelBorder; right?: ExcelBorder; bottom?: ExcelBorder; left?: ExcelBorder };
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

function inferCsvColumnWidths(rows: string[][]): number[] {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const lengths = rows
      .map((row) => row[columnIndex]?.trim())
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(/\r?\n/).map((line) => line.length))
      .sort((left, right) => left - right);

    if (!lengths.length) return 18;

    // CSV has no saved column widths. Estimate a useful width from typical cell
    // content, then cap it so a single long note cannot dominate the whole page.
    const typicalLength = lengths[Math.floor((lengths.length - 1) * 0.75)];
    return Math.max(24, Math.min(160, typicalLength * 5 + 16));
  });
}

function colorToRgb(color?: ExcelColor | null): Rgb | undefined {
  if (!color) return undefined;
  const source = color.argb || color.rgb;
  if (!source && typeof color.theme === "number") {
    const themeColors: Rgb[] = [[255, 255, 255], [0, 0, 0], [231, 230, 230], [68, 84, 106], [68, 114, 196], [237, 125, 49], [165, 165, 165], [255, 192, 0], [91, 155, 213], [112, 173, 71], [5, 99, 193], [149, 79, 114]];
    const base = themeColors[color.theme];
    if (!base) return undefined;
    const tint = Math.max(-1, Math.min(1, color.tint || 0));
    return base.map((channel) => Math.round(tint < 0 ? channel * (1 + tint) : channel * (1 - tint) + 255 * tint)) as Rgb;
  }
  if (!source) return undefined;
  const normalized = source.replace(/^#/, "");
  const rgb = normalized.length === 8 ? normalized.slice(2) : normalized;
  if (!/^[\da-f]{6}$/i.test(rgb)) return undefined;
  return [parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)];
}

function borderWidth(style?: string): number {
  switch (style) {
    case "hair":
    case "dotted": return 0.25;
    case "medium":
    case "mediumDashed":
    case "mediumDashDot":
    case "mediumDashDotDot": return 0.8;
    case "thick":
    case "double": return 1.2;
    case "thin":
    case "dashed":
    case "dashDot":
    case "dashDotDot": return 0.45;
    default: return 0;
  }
}

function borderDash(style?: string): number[] | undefined {
  if (style?.toLowerCase().includes("dot")) return [0.8, 1.2];
  if (style?.toLowerCase().includes("dash")) return [3, 2];
  return undefined;
}

function pdfFont(name?: string): Styles["font"] {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("courier") || normalized.includes("consolas")) return "courier";
  if (normalized.includes("times") || normalized.includes("georgia") || normalized.includes("cambria")) return "times";
  return "helvetica";
}

function cellStyle(style: ExcelStyle): Pick<BscCell, "styles" | "borders" | "underline"> {
  const font = style.font || {};
  const alignment = style.alignment || {};
  const fill = style.fill || {};
  const fillColor = colorToRgb(fill.fgColor) || colorToRgb(fill.bgColor);
  const textColor = colorToRgb(font.color);
  const fontStyle = font.bold && font.italic ? "bolditalic" : font.bold ? "bold" : font.italic ? "italic" : "normal";
  const horizontal = alignment.horizontal;
  const vertical = alignment.vertical;
  const borderSides = ["top", "right", "bottom", "left"] as const;
  const borders = Object.fromEntries(borderSides.flatMap((side) => {
    const border = style.border?.[side];
    const width = borderWidth(border?.style);
    if (!width) return [];
    return [[side, { color: colorToRgb(border?.color) || [148, 163, 184], width, dash: borderDash(border?.style), double: border?.style === "double" }]];
  })) as BscCell["borders"];

  return {
    styles: {
      font: pdfFont(font.name),
      fontStyle,
      fontSize: Math.max(4, Math.min(36, font.size || 10)),
      textColor: textColor || [30, 41, 59],
      fillColor: fillColor && fill.pattern !== "none" ? fillColor : false,
      halign: horizontal === "center" || horizontal === "right" || horizontal === "justify" ? horizontal : "left",
      valign: vertical === "top" || vertical === "bottom" ? vertical : "middle",
      overflow: "linebreak",
      cellPadding: { top: 1.4, right: 1.4, bottom: 1.4, left: 1.4 + Math.max(0, alignment.indent || 0) * 3 },
      lineWidth: 0,
      minCellHeight: 0,
    },
    borders,
    underline: font.underline === true,
  };
}

function columnWidthPoints(width?: number): number {
  const excelWidth = width && Number.isFinite(width) ? width : 8.43;
  return Math.max(8, (excelWidth * 7 + 5) * 0.75);
}

function worksheetRows(worksheet: import("exceljs").Worksheet): BscCell[][] {
  const rows: BscCell[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells: BscCell[] = [];
    for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      const { styles, borders, underline } = cellStyle(cell.style as ExcelStyle);
      cells.push({ text: cell.text || "", styles, borders, underline });
    }
    rows.push(cells);
  }
  return rows;
}

export async function readBscFile(file: File): Promise<BscSheet[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const rows = trimTrailingEmptyColumns(parseCsv(await file.text()));
    if (!rows.length) throw new Error("This CSV has no printable rows.");
    return [{
      name: file.name.replace(/\.csv$/i, ""),
      rows: rows.map((row) => row.map((text) => ({ text, styles: {}, borders: {} }))),
      columnWidths: inferCsvColumnWidths(rows),
      rowHeights: rows.map(() => 0),
      merges: [],
      printArea: "",
      showGridlines: true,
      pageSetup: {},
    }];
  }

  if (extension !== "xlsx" && extension !== "xlsm") {
    throw new Error("Choose a CSV file or an Excel workbook saved as .xlsx or .xlsm.");
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets = workbook.worksheets.map((worksheet) => {
    const rows = worksheetRows(worksheet);
    const columnWidths = Array.from({ length: worksheet.columnCount }, (_, index) => columnWidthPoints(worksheet.getColumn(index + 1).width));
    const rowHeights = Array.from({ length: worksheet.rowCount }, (_, index) => worksheet.getRow(index + 1).height || 0);
    const merges = worksheet.model.merges.map((range) => {
      const [first, last] = range.split(":");
      const start = parseCellReference(first);
      const end = parseCellReference(last || first);
      return { startRow: start.row, startColumn: start.column, endRow: end.row, endColumn: end.column };
    });
    const printArea = worksheet.pageSetup.printArea?.split(",")[0]?.split("!").pop() || "";
    const showGridlines = worksheet.pageSetup.showGridLines ?? false;
    const paperSize: PaperSize | undefined = worksheet.pageSetup.paperSize === 5 ? "legal" : worksheet.pageSetup.paperSize === 9 ? "a4" : undefined;
    const orientation: PageOrientation | undefined = worksheet.pageSetup.orientation === "portrait" || worksheet.pageSetup.orientation === "landscape" ? worksheet.pageSetup.orientation : undefined;
    const sourceMargins = worksheet.pageSetup.margins;
    const pageMargins = sourceMargins && [sourceMargins.top, sourceMargins.right, sourceMargins.bottom, sourceMargins.left].every(Number.isFinite)
      ? { top: sourceMargins.top, right: sourceMargins.right, bottom: sourceMargins.bottom, left: sourceMargins.left }
      : undefined;
    const pageSetup = { paperSize, orientation, margins: pageMargins };
    return { name: worksheet.name, rows, columnWidths, rowHeights, merges, printArea, showGridlines, pageSetup };
  }).filter((sheet) => sheet.rows.some((row) => row.some((cell) => cell.text.trim())));

  if (!sheets.length) throw new Error("This workbook has no printable worksheets.");
  return sheets;
}

function parseCellReference(reference: string): { row: number; column: number } {
  const cleaned = reference.replace(/\$/g, "").toUpperCase();
  const match = cleaned.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error("Use a cell range such as A1:Q180.");
  let column = 0;
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]), column };
}

function parseRange(value: string, maxRows: number, maxColumns: number) {
  if (!value.trim()) return { startRow: 1, startColumn: 1, endRow: maxRows, endColumn: maxColumns };
  const parts = value.replace(/\$/g, "").split(":");
  if (parts.length > 2) throw new Error("Use a cell range such as A1:Q180.");
  const start = parseCellReference(parts[0]);
  const end = parseCellReference(parts[1] || parts[0]);
  const range = {
    startRow: Math.max(1, Math.min(start.row, end.row)),
    startColumn: Math.max(1, Math.min(start.column, end.column)),
    endRow: Math.min(maxRows, Math.max(start.row, end.row)),
    endColumn: Math.min(maxColumns, Math.max(start.column, end.column)),
  };
  if (range.startRow > range.endRow || range.startColumn > range.endColumn) throw new Error("That range is outside the worksheet.");
  return range;
}

export function detectHeaderRow(rows: BscCell[][]): number {
  const sample = rows.slice(0, 80);
  const textRows = sample.map((row) => row.map((cell) => cell.text));
  const scorecardHeader = textRows.findIndex((row) => row.some((cell) => /performance objectives/i.test(cell)) && row.some((cell) => /key performance indicators/i.test(cell)));
  if (scorecardHeader >= 0) return scorecardHeader;
  const maximumColumns = Math.max(1, ...sample.map((row) => row.length));
  let bestIndex = 0;
  let bestScore = -1;

  textRows.forEach((row, index) => {
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

function headerBlockLength(rows: BscCell[][], startIndex: number): number {
  const first = rows[startIndex]?.map((cell) => cell.text).join(" ") || "";
  const next = rows[startIndex + 1]?.map((cell) => cell.text).join(" ") || "";
  const firstCount = rows[startIndex]?.filter((cell) => cell.text.trim()).length || 0;
  const nextCount = rows[startIndex + 1]?.filter((cell) => cell.text.trim()).length || 0;
  return /performance objectives/i.test(first)
    && /key performance indicators/i.test(first)
    && nextCount >= Math.max(4, firstCount * 0.5)
    && /performance standard|targets achieved|percentage achieved|validated rating/i.test(next) ? 2 : 1;
}

function rowCellInputs(sheet: BscSheet, range: ReturnType<typeof parseRange>, rowIndex: number, scale: number, showGridlines: boolean): CellDef[] {
  const cells: CellDef[] = [];
  const mergeAt = (row: number, column: number) => sheet.merges.find((merge) => row >= merge.startRow && row <= merge.endRow && column >= merge.startColumn && column <= merge.endColumn);

  for (let column = range.startColumn - 1; column < range.endColumn; column += 1) {
    const merge = mergeAt(rowIndex, column);
    const firstVisibleRow = merge ? Math.max(merge.startRow, range.startRow - 1) : rowIndex;
    const firstVisibleColumn = merge ? Math.max(merge.startColumn, range.startColumn - 1) : column;
    if (merge && (rowIndex !== firstVisibleRow || column !== firstVisibleColumn)) continue;
    const source = merge
      ? sheet.rows[merge.startRow]?.[merge.startColumn] || { text: "", styles: {}, borders: {} }
      : sheet.rows[rowIndex]?.[column] || { text: "", styles: {}, borders: {} };
    const span = merge
      ? {
        colSpan: Math.max(1, Math.min(merge.endColumn + 1, range.endColumn) - firstVisibleColumn),
        rowSpan: Math.max(1, Math.min(merge.endRow + 1, range.endRow) - firstVisibleRow),
      }
      : {};
    const styles = { ...source.styles, fontSize: (source.styles.fontSize || 10) * scale, lineWidth: 0 };
    const rowHeight = sheet.rowHeights[rowIndex] || 0;
    if (rowHeight > 0) styles.minCellHeight = Math.max(styles.minCellHeight || 0, rowHeight * scale);
    const borders = { ...source.borders };
    if (showGridlines) {
      for (const side of ["top", "right", "bottom", "left"] as const) {
        borders[side] ||= { color: [203, 213, 225], width: 0.25 };
      }
    }
    const definition = {
      content: source.text,
      ...span,
      styles,
      bscBorders: borders,
      bscUnderline: source.underline,
    } as unknown as CellDef;
    cells.push(definition);
  }
  return cells;
}

function drawCellBorders(data: CellHookData) {
  const raw = data.cell.raw as BscPdfCellDef | undefined;
  const borders = raw?.bscBorders || {};
  const doc = data.doc;
  const { x, y, width, height } = data.cell;
  const edges = {
    top: [x, y, x + width, y] as const,
    right: [x + width, y, x + width, y + height] as const,
    bottom: [x, y + height, x + width, y + height] as const,
    left: [x, y, x, y + height] as const,
  };

  for (const side of ["top", "right", "bottom", "left"] as const) {
    const border = borders[side];
    if (!border) continue;
    doc.setDrawColor(...border.color);
    doc.setLineWidth(border.width);
    if (border.dash?.length && "setLineDashPattern" in doc) doc.setLineDashPattern(border.dash, 0);
    doc.line(...edges[side]);
    if (border.double) {
      const offset = Math.max(1.1, border.width + 0.6);
      if (side === "top") doc.line(x, y + offset, x + width, y + offset);
      if (side === "right") doc.line(x - offset, y, x - offset, y + height);
      if (side === "bottom") doc.line(x, y - offset, x + width, y - offset);
      if (side === "left") doc.line(x + offset, y, x + offset, y + height);
    }
    if (border.dash?.length && "setLineDashPattern" in doc) doc.setLineDashPattern([], 0);
  }
  if (raw?.bscUnderline) {
    doc.setDrawColor(...((data.cell.styles.textColor as Rgb) || [30, 41, 59]));
    doc.setLineWidth(0.35);
    doc.line(x + 1.4, y + height - 1.7, x + width - 1.4, y + height - 1.7);
  }
}

function bodySegments<T extends { sourceRow: number }>(rows: T[], breakRows: Set<number>): T[][] {
  const segments: T[][] = [];
  let segment: T[] = [];
  for (const row of rows) {
    if (segment.length && breakRows.has(row.sourceRow + 1)) {
      segments.push(segment);
      segment = [];
    }
    segment.push(row);
  }
  if (segment.length) segments.push(segment);
  return segments;
}

function renderTable(doc: jsPDF, rows: CellDef[][], options: {
  head?: CellDef[][];
  startY: number;
  margin: { top: number; right: number; bottom: number; left: number };
  columnWidths: number[];
  pageBreak?: "auto" | "always";
  horizontalPageBreak?: boolean;
}) {
  autoTable(doc, {
    head: options.head || [],
    body: rows as RowInput[],
    startY: options.startY,
    margin: options.margin,
    tableWidth: "auto",
    theme: "plain",
    pageBreak: options.pageBreak || "auto",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    horizontalPageBreak: options.horizontalPageBreak,
    horizontalPageBreakBehaviour: "afterAllRows",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.4,
      overflow: "linebreak",
      valign: "middle",
      textColor: [30, 41, 59],
      fillColor: false,
      lineWidth: 0,
    },
    columnStyles: Object.fromEntries(options.columnWidths.map((width, index) => [index, { cellWidth: width }])),
    didDrawCell: drawCellBorders,
  });
}

function lastTableY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || fallback;
}

export function createBscPdf(fileName: string, sheets: BscSheet[], options: PrintOptions): BscPdfResult {
  const doc = new jsPDF({ orientation: options.orientation, unit: "pt", format: options.paperSize, compress: true });
  const baseMargins = {
    top: options.margins.top * 72,
    right: options.margins.right * 72,
    bottom: options.margins.bottom * 72,
    left: options.margins.left * 72,
  };
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - baseMargins.left - baseMargins.right;
  const headerReserve = options.headerText.trim() ? 18 : 0;
  const footerReserve = options.footerText.trim() || options.showPageNumbers ? 17 : 0;
  const margins = { ...baseMargins, top: baseMargins.top + headerReserve, bottom: baseMargins.bottom + footerReserve };
  let hasRenderedTable = false;

  sheets.forEach((sheet) => {
    const maxRows = sheet.rows.length;
    const maxColumns = Math.max(0, ...sheet.rows.map((row) => row.length));
    const range = parseRange(options.printAreaBySheet[sheet.name] || sheet.printArea, maxRows, maxColumns);
    const columnWidths = sheet.columnWidths.slice(range.startColumn - 1, range.endColumn);
    const widthTotal = columnWidths.reduce((sum, width) => sum + width, 0) || contentWidth;
    const widthScale = options.fitToWidth ? Math.min(1, contentWidth / widthTotal) : 1;
    const scale = widthScale;
    const scaledWidths = columnWidths.map((width) => width * scale);
    const selectedRows = Array.from({ length: range.endRow - range.startRow + 1 }, (_, offset) => {
      const sourceRow = range.startRow - 1 + offset;
      return {
        sourceRow,
        cells: rowCellInputs(sheet, range, sourceRow, scale, options.showGridlines),
      };
    });
    const breakRows = new Set((options.pageBreaksBySheet[sheet.name] || "")
      .split(/[\s,;]+/)
      .map(Number)
      .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > range.startRow && rowNumber <= range.endRow));
    const headerIndex = options.headerRowBySheet[sheet.name] ?? detectHeaderRow(sheet.rows);
    const headerWithinRange = options.repeatHeaders && headerIndex + 1 >= range.startRow && headerIndex + 1 <= range.endRow;
    const headerStart = headerWithinRange ? headerIndex : -1;
    const headerCount = headerWithinRange ? Math.min(headerBlockLength(sheet.rows, headerIndex), range.endRow - headerIndex) : 0;
    const hasHeaderInRange = headerStart + 1 >= range.startRow && headerStart >= 0;
    const introRows = hasHeaderInRange ? selectedRows.filter((row) => row.sourceRow < headerStart) : [];
    const mainRows = hasHeaderInRange ? selectedRows.filter((row) => row.sourceRow >= headerStart + headerCount) : selectedRows;
    const headerRows = hasHeaderInRange
      ? selectedRows.filter((row) => row.sourceRow >= headerStart && row.sourceRow < headerStart + headerCount).map((row) => row.cells)
      : [];
    let nextY = margins.top;
    const columnOptions = {
      margin: margins,
      columnWidths: scaledWidths,
      horizontalPageBreak: !options.fitToWidth,
    };

    const introSegments = bodySegments(introRows, breakRows);
    for (const [index, segment] of introSegments.entries()) {
      renderTable(doc, segment.map((row) => row.cells), {
        ...columnOptions,
        startY: nextY,
        pageBreak: hasRenderedTable || index > 0 ? "always" : "auto",
      });
      nextY = lastTableY(doc, margins.top);
      hasRenderedTable = true;
    }

    const mainSegments = bodySegments(mainRows, breakRows);
    if (headerRows.length && !mainSegments.length) {
      renderTable(doc, [], { ...columnOptions, head: headerRows, startY: nextY, pageBreak: hasRenderedTable ? "always" : "auto" });
      hasRenderedTable = true;
      nextY = lastTableY(doc, margins.top);
    }
    for (const [index, segment] of mainSegments.entries()) {
      const breakBefore = index > 0 || (hasRenderedTable && introSegments.length === 0 && sheets.indexOf(sheet) > 0);
      renderTable(doc, segment.map((row) => row.cells), {
        ...columnOptions,
        head: headerRows,
        startY: nextY,
        pageBreak: breakBefore ? "always" : "auto",
      });
      nextY = lastTableY(doc, margins.top);
      hasRenderedTable = true;
    }

    if (!headerRows.length && !introSegments.length && !mainSegments.length) {
      renderTable(doc, [[]], { ...columnOptions, startY: nextY, pageBreak: hasRenderedTable ? "always" : "auto" });
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    if (options.headerText.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(options.headerText, baseMargins.left, baseMargins.top + 7, { maxWidth: contentWidth });
    }
    if (options.footerText.trim() || options.showPageNumbers) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      const footer = [
        options.footerText.replace(/\{page\}/gi, String(pageNumber)).replace(/\{pages\}/gi, String(pageCount)),
        options.showPageNumbers ? `${pageNumber} / ${pageCount}` : "",
      ].filter(Boolean).join("  ·  ");
      doc.text(footer || fileName, baseMargins.left, pageHeight - Math.max(4, baseMargins.bottom / 2), { maxWidth: contentWidth });
    }
  }

  return { blob: doc.output("blob"), pageCount };
}
