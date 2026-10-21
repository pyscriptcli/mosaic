import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { requireFeature } from "@/lib/access-control-server";
import {
  cleanMeetingExportField,
  MEETING_EXPORT_STYLE,
  meetingExportActionFields,
  meetingExportContentLines,
  meetingExportDetails,
  meetingExportInlineRuns,
  meetingExportSummary,
  type MeetingExportRequest,
} from "@/lib/meetingExport";

const { blueRgb: BLUE, goldRgb: GOLD, grayRgb: GRAY, pdfBodyFont: BODY_FONT, pdfHeadingFont: HEADING_FONT } = MEETING_EXPORT_STYLE;
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
    const { meeting_details, discussion_points = [], action_items = [], summary, other_discussions } = input;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setLineHeightFactor(1.2);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - LEFT - RIGHT;
    let y: number = TOP;

    const nextPageIfNeeded = (height: number) => {
      if (y + height > pageHeight - BOTTOM) {
        doc.addPage();
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
      meetingExportContentLines(value).forEach(({ text, bullet }) => {
        if (!text) {
          y += LINE_HEIGHT / 2;
          return;
        }
        const indent = bullet ? 4 : 0;
        const runs = meetingExportInlineRuns(text);
        const lines = wrapRuns(runs, contentWidth - indent);
        lines.forEach((line, index) => {
          nextPageIfNeeded(LINE_HEIGHT);
          if (bullet && index === 0) writeLine([{ text: "• ", bold: false }], LEFT, y);
          writeLine(line, LEFT + indent, y);
          y += LINE_HEIGHT;
        });
      });
    };

    const writeHeading = (text: string, title = false) => {
      const size = title ? MEETING_EXPORT_STYLE.titlePt : MEETING_EXPORT_STYLE.headingPt;
      const height = title ? 10 : 8;
      nextPageIfNeeded(height + 3);
      doc.setFont(HEADING_FONT, title ? "bold" : "bolditalic");
      doc.setFontSize(size);
      doc.setTextColor(...BLUE);
      if (title) {
        doc.text(text, LEFT, y + 6);
        y += 11;
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.35);
        doc.line(LEFT, y - 1, pageWidth - RIGHT, y - 1);
        y += 4;
      } else {
        y += 2;
        doc.text(text, LEFT, y + 3);
        y += 9;
      }
    };

    writeHeading("Minutes of the Meeting", true);
    writeHeading("MEETING DETAILS");
    meetingExportDetails(meeting_details).forEach(([label, value]) => {
      const labelRun = { text: `${label}: `, bold: true, color: BLUE };
      const valueRun = { text: value, bold: false, color: GRAY };
      const lines = wrapRuns([labelRun, valueRun], contentWidth);
      lines.forEach((line) => {
        nextPageIfNeeded(LINE_HEIGHT);
        writeLine(line, LEFT, y);
        y += LINE_HEIGHT;
      });
    });

    writeHeading("SUMMARY");
    const summaryContent = meetingExportSummary(summary);
    if (summaryContent.summary) writeContent(summaryContent.summary);
    if (summaryContent.outcome) {
      writeContent(`**Bottom line:** ${summaryContent.outcome}`);
    }

    writeHeading("DISCUSSION POINTS");
    discussion_points.forEach((item, index) => {
      const title = cleanMeetingExportField(item.topic_title) || `Discussion ${index + 1}`;
      nextPageIfNeeded(9);
      doc.setFont(BODY_FONT, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BLUE);
      const titleLines = doc.splitTextToSize(title, contentWidth);
      titleLines.forEach((line: string) => {
        nextPageIfNeeded(5);
        doc.text(line, LEFT, y + 3.5);
        y += 5;
      });
      y += 1;
      writeContent(cleanMeetingExportField(item.discussion_point));
      y += 2;
    });

    const actions = action_items.filter((item) => cleanMeetingExportField(item.action_plan));
    if (actions.length) {
      writeHeading("ACTION PLAN");
      autoTable(doc, {
        startY: y,
        margin: { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM },
        head: [["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]],
        body: actions.map(meetingExportActionFields),
        theme: "plain",
        showHead: "everyPage",
        rowPageBreak: "auto",
        headStyles: { fillColor: [255, 252, 251], textColor: BLUE, font: "helvetica", fontStyle: "bold", fontSize: 9.5, halign: "left", valign: "top", lineColor: BLUE, lineWidth: { bottom: 0.35 }, cellPadding: { top: 2, right: 2, bottom: 2, left: 1 } },
        bodyStyles: { fillColor: [255, 252, 251], textColor: GRAY, font: "helvetica", fontSize: 9.5, halign: "left", valign: "top", cellPadding: { top: 2, right: 2, bottom: 2.5, left: 1 }, lineColor: [216, 221, 227], lineWidth: { bottom: 0.2 } },
        columnStyles: { 0: { cellWidth: 42.5 }, 1: { cellWidth: 68 }, 2: { cellWidth: 25.5 }, 3: { cellWidth: 34 } },
        styles: { overflow: "linebreak", halign: "left", valign: "top" },
      });
      const tableFinalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      y = tableFinalY || y + 12;
    }

    writeHeading("OTHER DISCUSSIONS");
    writeContent(cleanMeetingExportField(other_discussions));

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const safeClient = cleanMeetingExportField(meeting_details?.client_name) || "Meeting";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/\s+/g, "_")}.pdf"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generating executive PDF:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
