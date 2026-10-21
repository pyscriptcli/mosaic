import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { requireFeature } from "@/lib/access-control-server";
import {
  cleanMeetingExportField,
  MEETING_EXPORT_STYLE,
  meetingExportActionFields,
  meetingExportContentLines,
  meetingExportDetails,
  meetingExportInlineRuns,
  meetingExportSummary,
  type MeetingExportAction,
  type MeetingExportRequest,
} from "@/lib/meetingExport";

const { blue: BLUE, gold: GOLD, gray: GRAY, warmWhite: WARM_WHITE, wordBodyFont: BODY_FONT, wordHeadingFont: DISPLAY_FONT } = MEETING_EXPORT_STYLE;

function formatRuns(value: string, options: { bold?: boolean; color?: string; size?: number } = {}) {
  return meetingExportInlineRuns(value).map(({ text, bold: markedBold }) => {
    return new TextRun({
      text,
      bold: options.bold || markedBold,
      color: options.color || GRAY,
      size: options.size ?? MEETING_EXPORT_STYLE.bodyPt * 2,
      font: BODY_FONT,
    });
  });
}

function contentParagraphs(value: string, options: { size?: number; color?: string } = {}): Paragraph[] {
  return meetingExportContentLines(value).filter(({ text }) => text).map(({ text, bullet, number }) => {
    return new Paragraph({
      ...(bullet ? { bullet: { level: 0 } } : {}),
      alignment: AlignmentType.LEFT,
      children: [...(number ? [new TextRun({ text: `${number}. `, font: BODY_FONT })] : []), ...formatRuns(text, options)],
      spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto", after: 100 },
    });
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    children: [new TextRun({ text, bold: false, italics: true, size: MEETING_EXPORT_STYLE.headingPt * 2, color: BLUE, font: DISPLAY_FONT })],
    spacing: { before: 240, after: 100 },
  });
}

function meetingDetailsTable(rows: [string, string][]) {
  const rowRule = { style: BorderStyle.SINGLE, size: 2, color: GRAY };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2700, 7300],
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: rowRule,
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: 27, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: rowRule, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: MEETING_EXPORT_STYLE.actionPt * 2, color: BLUE, font: BODY_FONT })],
            spacing: { after: 35 },
          })],
        }),
        new TableCell({
          width: { size: 73, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: rowRule, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            children: formatRuns(value),
            spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto", after: 35 },
          })],
        }),
      ],
    })),
  });
}

function actionTable(items: MeetingExportAction[]) {
  const bottomRule = { style: BorderStyle.SINGLE, size: 2, color: "D8DDE3" };
  const cellBorders = {
    top: { style: BorderStyle.NONE },
    bottom: bottomRule,
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
  };
  const labels = ["ID", "ACTION", "OWNER", "DUE DATE"];
  const widths = [700, 5300, 2300, 1700];
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: labels.map((label, index) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      borders: { ...cellBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE } },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: MEETING_EXPORT_STYLE.actionPt * 2, color: BLUE, font: BODY_FONT })], spacing: { after: 40 } })],
    })),
  });
  const rows = items.map((item, index) => new TableRow({
    cantSplit: true,
    children: [
      ...meetingExportActionFields(item, index),
    ].map((value, cellIndex) => new TableCell({
      width: { size: widths[cellIndex], type: WidthType.DXA },
      borders: cellBorders,
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: formatRuns(value, { size: MEETING_EXPORT_STYLE.actionPt * 2 }),
        spacing: { line: 250, lineRule: "auto", before: 55, after: 65 },
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: bottomRule,
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [header, ...rows],
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireFeature(req, "meetings-export");
  if (denied) return denied;

  try {
    const input = await req.json() as MeetingExportRequest;
    const { meeting_details, discussion_points = [], action_items = [], summary, outcome, other_discussions } = input;
    const clientName = cleanMeetingExportField(meeting_details?.client_name);
    const meetingDetails = meetingExportDetails(meeting_details);
    const meetingDate = meetingDetails.find(([label]) => label === "DATE" || label === "DATE / TIME")?.[1] || "";

    const children: (Paragraph | Table)[] = [
      new Paragraph({
        children: [new TextRun({ text: "MEETING MINUTES", bold: true, size: 16, color: BLUE, font: BODY_FONT })],
        spacing: { after: 80 },
      }),
      new Paragraph({
        heading: HeadingLevel.TITLE,
        keepNext: true,
        children: [new TextRun({ text: clientName || "Meeting minutes", size: MEETING_EXPORT_STYLE.titlePt * 2, color: BLUE, font: DISPLAY_FONT })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 7 } },
        spacing: { after: 100 },
      }),
      ...(meetingDetails.length ? [sectionHeading("MEETING DETAILS")] : []),
      ...(meetingDetails.length ? [meetingDetailsTable(meetingDetails)] : []),
    ];

    const parsedSummary = meetingExportSummary(summary, outcome);
    if (parsedSummary.summary) children.push(sectionHeading("OVERVIEW"), ...contentParagraphs(parsedSummary.summary));
    if (parsedSummary.outcome) children.push(sectionHeading("OUTCOME"), ...contentParagraphs(`**${parsedSummary.outcome}**`));
    const actions = action_items.filter((item) => cleanMeetingExportField(item.action_plan));
    if (actions.length) {
      children.push(sectionHeading("ACTIONS"), actionTable(actions));
    }

    const discussions = discussion_points.filter((item) => cleanMeetingExportField(item.discussion_point));
    if (discussions.length) children.push(sectionHeading("DISCUSSION"));

    discussions.forEach((item, index) => {
      const title = cleanMeetingExportField(item.topic_title) || `Discussion ${index + 1}`;
      children.push(new Paragraph({
        keepNext: true,
        children: [new TextRun({ text: title, bold: true, size: MEETING_EXPORT_STYLE.bodyPt * 2, color: BLUE, font: BODY_FONT })],
        spacing: { before: 180, after: 80 },
      }));
      children.push(...contentParagraphs(cleanMeetingExportField(item.discussion_point)));
    });

    if (cleanMeetingExportField(other_discussions)) children.push(sectionHeading("ADDITIONAL NOTES"), ...contentParagraphs(cleanMeetingExportField(other_discussions)));

    const doc = new Document({
      creator: "PRIME Philippines",
      title: `Meeting minutes - ${clientName || "Meeting"}`,
      subject: "Meeting minutes",
      background: { color: WARM_WHITE },
      styles: {
        default: { document: { run: { font: BODY_FONT, size: MEETING_EXPORT_STYLE.bodyPt * 2, color: GRAY }, paragraph: { alignment: AlignmentType.LEFT, spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto" } } } },
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: { default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `${clientName || "Meeting"}${meetingDate ? ` | ${meetingDate}` : ""} | `, size: 16, color: GRAY, font: BODY_FONT }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY, font: BODY_FONT }), new TextRun({ text: " of ", size: 16, color: GRAY, font: BODY_FONT }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRAY, font: BODY_FONT })],
        })] }) },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeClient = clientName || "Meeting";
    const safeDate = cleanMeetingExportField(meeting_details?.date).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "undated";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/[^a-z0-9-_]+/gi, "_")}_${safeDate}.docx"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generating executive Word doc:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
