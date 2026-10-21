import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
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
  return meetingExportContentLines(value).filter(({ text }) => text).map(({ text, bullet }) => {
    return new Paragraph({
      ...(bullet ? { bullet: { level: 0 } } : {}),
      alignment: AlignmentType.LEFT,
      children: formatRuns(text, options),
      spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto", after: 90 },
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

function summaryParagraphs(summary: unknown): Paragraph[] {
  const paragraphs = meetingExportSummary(summary);
  const result: Paragraph[] = [];
  if (paragraphs.summary) result.push(...contentParagraphs(paragraphs.summary));
  if (paragraphs.outcome) {
    result.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: "BOTTOM LINE: ", bold: true, color: BLUE, size: MEETING_EXPORT_STYLE.bodyPt * 2, font: BODY_FONT }),
        ...formatRuns(paragraphs.outcome),
      ],
      spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto", before: 90, after: 90 },
    }));
  }
  return result;
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
  const header = new TableRow({
    tableHeader: true,
    children: ["DISCUSSION POINT", "ACTION PLAN", "TARGET DATE", "PERSON IN CHARGE"].map((label) => new TableCell({
      width: { size: label === "Discussion Point" ? 25 : label === "Action Plan" ? 40 : label === "Target Date" ? 15 : 20, type: WidthType.PERCENTAGE },
      borders: { ...cellBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE } },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: MEETING_EXPORT_STYLE.actionPt * 2, color: BLUE, font: BODY_FONT })], spacing: { after: 40 } })],
    })),
  });
  const rows = items.map((item) => new TableRow({
    children: [
      ...meetingExportActionFields(item),
    ].map((value) => new TableCell({
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
    columnWidths: [2500, 4000, 1500, 2000],
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
    const { meeting_details, discussion_points = [], action_items = [], summary, other_discussions } = input;
    const clientName = cleanMeetingExportField(meeting_details?.client_name);
    const meetingDetails = meetingExportDetails(meeting_details);

    const children: (Paragraph | Table)[] = [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        keepNext: true,
        children: [new TextRun({ text: "Minutes of the Meeting", size: MEETING_EXPORT_STYLE.titlePt * 2, color: BLUE, font: DISPLAY_FONT })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 7 } },
        spacing: { after: 100 },
      }),
      sectionHeading("MEETING DETAILS"),
      ...(meetingDetails.length ? [meetingDetailsTable(meetingDetails)] : []),
      sectionHeading("SUMMARY"),
      ...summaryParagraphs(summary),
      sectionHeading("DISCUSSION POINTS"),
    ];

    discussion_points.forEach((item, index) => {
      const title = cleanMeetingExportField(item.topic_title) || `Discussion ${index + 1}`;
      children.push(new Paragraph({
        keepNext: true,
        children: [new TextRun({ text: title, bold: true, size: MEETING_EXPORT_STYLE.bodyPt * 2, color: BLUE, font: BODY_FONT })],
        spacing: { before: 120, after: 45 },
      }));
      children.push(...contentParagraphs(cleanMeetingExportField(item.discussion_point)));
    });

    const actions = action_items.filter((item) => cleanMeetingExportField(item.action_plan));
    if (actions.length) {
      children.push(sectionHeading("ACTION PLAN"), actionTable(actions));
    }

    children.push(sectionHeading("OTHER DISCUSSIONS"), ...contentParagraphs(cleanMeetingExportField(other_discussions)));

    const doc = new Document({
      background: { color: WARM_WHITE },
      styles: {
        default: { document: { run: { font: BODY_FONT, size: MEETING_EXPORT_STYLE.bodyPt * 2, color: GRAY }, paragraph: { alignment: AlignmentType.LEFT, spacing: { line: MEETING_EXPORT_STYLE.lineSpacingTwips, lineRule: "auto" } } } },
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeClient = clientName || "Meeting";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/\s+/g, "_")}.docx"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generating executive Word doc:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
