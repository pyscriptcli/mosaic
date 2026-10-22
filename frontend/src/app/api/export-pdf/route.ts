import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireFeature } from "@/lib/access-control-server";
import {
  cleanMeetingExportField,
  formatMeetingExportTitleDate,
  MEETING_EXPORT_STYLE,
  meetingExportActionFields,
  meetingExportContentLines,
  meetingExportInlineRuns,
  meetingExportSummary,
  meetingExportTemplateDetails,
  type MeetingExportRequest,
} from "@/lib/meetingExport";

const { blueRgb: BLUE, goldRgb: GOLD, grayRgb: GRAY, warmWhiteRgb: WARM_WHITE, pdfBodyFont: BODY_FONT, pdfHeadingFont: HEADING_FONT } = MEETING_EXPORT_STYLE;
const LEFT = MEETING_EXPORT_STYLE.pageMarginMm;
const RIGHT = LEFT;
const TOP = LEFT;
const BOTTOM = LEFT;
const BODY_SIZE = MEETING_EXPORT_STYLE.bodyPt;
const LINE_HEIGHT = BODY_SIZE * 0.42;
type PdfRun = { text: string; bold: boolean; color?: [number, number, number] };

export async function POST(req: NextRequest) {
  const denied = await requireFeature(req, "meetings-export");
  if (denied) return denied;

  try {
    const input = await req.json() as MeetingExportRequest;
    const { meeting_details, discussion_points = [], action_items = [], summary, outcome, other_discussions } = input;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setLineHeightFactor(1.2);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - LEFT - RIGHT;
    const clientName = cleanMeetingExportField(meeting_details?.client_name);
    const logo = await readFile(join(process.cwd(), "public", "forms", "prime-philippines-logo-blue.png"));
    const logoData = `data:image/png;base64,${logo.toString("base64")}`;
    doc.setProperties({ title: `Meeting minutes - ${clientName || "Meeting"}`, author: "PRIME Philippines", subject: "Meeting minutes" });
    let y: number = TOP;

    const nextPageIfNeeded = (height: number) => {
      if (y + height > pageHeight - BOTTOM) {
        doc.addPage();
        doc.setFillColor(...WARM_WHITE);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        y = TOP;
      }
    };

    const writeLine = (runs: PdfRun[], x: number, lineY: number) => {
      let cursorX = x;
      runs.forEach((run) => {
        doc.setFont(BODY_FONT, run.bold ? "bold" : "normal");
        doc.setFontSize(BODY_SIZE);
        doc.setTextColor(...(run.color || GRAY));
        doc.text(run.text, cursorX, lineY);
        cursorX += doc.getTextWidth(run.text);
      });
    };

    const wrapRuns = (runs: PdfRun[], maxWidth: number) => {
      const lines: PdfRun[][] = [];
      let current: PdfRun[] = [];
      let lineWidth = 0;
      for (const run of runs) {
        const words = run.text.match(/\S+\s*/g) || [];
        for (const word of words) {
          doc.setFont(BODY_FONT, run.bold ? "bold" : "normal");
          doc.setFontSize(BODY_SIZE);
          const wordWidth = doc.getTextWidth(word);
          if (lineWidth + wordWidth > maxWidth && current.length) {
            lines.push(current);
            current = [];
            lineWidth = 0;
          }
          const last = current[current.length - 1];
          if (last && last.bold === run.bold && last.color === run.color) last.text += word;
          else current.push({ ...run, text: word });
          lineWidth += wordWidth;
        }
      }
      if (current.length) lines.push(current);
      return lines;
    };

    const writeContent = (value: string) => {
      meetingExportContentLines(value).forEach(({ text, bullet, number }) => {
        if (!text) {
          y += LINE_HEIGHT / 2;
          return;
        }
        const indent = bullet ? 4 : 0;
        const runs = meetingExportInlineRuns(text);
        const lines = wrapRuns(runs, contentWidth - indent);
        lines.forEach((line, index) => {
          nextPageIfNeeded(LINE_HEIGHT);
          if ((bullet || number) && index === 0) writeLine([{ text: number ? `${number}. ` : "• ", bold: false }], LEFT, y);
          writeLine(line, LEFT + indent, y);
          y += LINE_HEIGHT;
        });
      });
    };

    const writeHeading = (text: string, title = false) => {
      const size = title ? MEETING_EXPORT_STYLE.titlePt : MEETING_EXPORT_STYLE.headingPt;
      const height = title ? 13 : 11;
      nextPageIfNeeded(height + (title ? 0 : LINE_HEIGHT * 2));
      doc.setFont(HEADING_FONT, title ? "bold" : "italic");
      doc.setFontSize(size);
      doc.setTextColor(...BLUE);
      if (title) {
        doc.text(text, LEFT, y + 7);
        y += 12;
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.35);
        doc.line(LEFT, y - 1, pageWidth - RIGHT, y - 1);
        y += 4;
      } else {
        y += 3;
        doc.text(text, LEFT, y + 4);
        y += 10;
      }
    };

    doc.setFillColor(...WARM_WHITE);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.addImage(logoData, "PNG", LEFT, y, 49, 15.5);
    doc.setFont(HEADING_FONT, "normal");
    doc.setFontSize(MEETING_EXPORT_STYLE.titlePt);
    doc.setTextColor(...BLUE);
    doc.text("Meeting Minutes", pageWidth - RIGHT, y + 7, { align: "right" });
    doc.setFont(BODY_FONT, "bold");
    doc.setFontSize(MEETING_EXPORT_STYLE.actionPt);
    doc.text(formatMeetingExportTitleDate(meeting_details?.date), pageWidth - RIGHT, y + 13, { align: "right" });
    y += 19;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(LEFT, y, pageWidth - RIGHT, y);
    y += 3;

    const details = new Map(meetingExportTemplateDetails(meeting_details));
    const metadataRows = [
      ["CLIENT", details.get("CLIENT") || "", "ATTENDEES", details.get("ATTENDEES") || ""],
      ["LOCATION", details.get("LOCATION") || "", "MEETING TYPE", details.get("MEETING TYPE") || ""],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM },
      body: metadataRows,
      theme: "plain",
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold", textColor: BLUE },
        1: { cellWidth: 53, textColor: GRAY },
        2: { cellWidth: 30, fontStyle: "bold", textColor: BLUE },
        3: { cellWidth: contentWidth - 105, textColor: GRAY },
      },
      styles: { font: BODY_FONT, fontSize: MEETING_EXPORT_STYLE.actionPt, fillColor: WARM_WHITE, cellPadding: { top: 2, right: 1, bottom: 2, left: 1 }, lineColor: GOLD, lineWidth: { bottom: 0.2 }, overflow: "linebreak", halign: "left", valign: "top" },
    });
    y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 12) + 2;

    const summaryContent = meetingExportSummary(summary, outcome);
    writeHeading("SUMMARY");
    writeContent([summaryContent.summary, summaryContent.outcome].filter(Boolean).join("\n\n"));

    writeHeading("DISCUSSION POINTS");
    discussion_points.forEach((item, index) => {
      const discussion = cleanMeetingExportField(item.discussion_point);
      if (!discussion) return;
      const title = cleanMeetingExportField(item.topic_title) || `Discussion ${index + 1}`;
      const titleLines = doc.splitTextToSize(title, contentWidth);
      nextPageIfNeeded(5 * titleLines.length + LINE_HEIGHT * 2);
      doc.setFont(BODY_FONT, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BLUE);
      titleLines.forEach((line: string) => {
        doc.text(line, LEFT, y + 3.5);
        y += 5.5;
      });
      y += 2;
      writeContent(discussion);
      y += 4;
    });

    writeHeading("ACTION PLAN");
    const actions = action_items.filter((item) => cleanMeetingExportField(item.action_plan));
    autoTable(doc, {
      startY: y,
      margin: { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM },
      head: [["DISCUSSION POINT", "ACTION PLAN", "DUE DATE", "PERSON IN CHARGE"]],
      body: actions.map((item) => meetingExportActionFields(item).map((value) => meetingExportInlineRuns(value).map((run) => run.text).join(""))),
      theme: "plain",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      headStyles: { fillColor: WARM_WHITE, textColor: BLUE, font: BODY_FONT, fontStyle: "bold", fontSize: MEETING_EXPORT_STYLE.actionPt, halign: "left", valign: "top", lineColor: BLUE, lineWidth: { bottom: 0.35 }, cellPadding: { top: 2, right: 2, bottom: 2, left: 1 } },
      bodyStyles: { fillColor: WARM_WHITE, textColor: GRAY, font: BODY_FONT, fontSize: MEETING_EXPORT_STYLE.actionPt, halign: "left", valign: "top", cellPadding: { top: 2, right: 2, bottom: 2.5, left: 1 }, lineColor: GRAY, lineWidth: { bottom: 0.1 } },
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 70 }, 2: { cellWidth: 27 }, 3: { cellWidth: contentWidth - 139 } },
      styles: { overflow: "linebreak", halign: "left", valign: "top" },
    });
    const tableFinalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = tableFinalY || y + 12;

    writeHeading("OTHER DISCUSSIONS");
    writeContent(cleanMeetingExportField(other_discussions));

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const safeClient = clientName || "Meeting";
    const safeDate = cleanMeetingExportField(meeting_details?.date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "undated";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/[^a-z0-9-_]+/gi, "_")}_${safeDate}.pdf"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generating executive PDF:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
