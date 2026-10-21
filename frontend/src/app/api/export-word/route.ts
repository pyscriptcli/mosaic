import { NextRequest, NextResponse } from "next/server";
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  HeadingLevel, 
  WidthType, 
  AlignmentType, 
  BorderStyle,
  ShadingType
} from "docx";
import { requireFeature } from "@/lib/access-control-server";
import { formatEchoTime } from "@/lib/dateUtils";

function cleanField(val: any): string {
  if (!val) return "";
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "none" ||
    lower === "n/a" ||
    lower === "tbd" ||
    lower === "unassigned" ||
    lower === "null" ||
    lower === "undefined"
  ) {
    return "";
  }
  return s;
}

function formattedRuns(value: string, size = 20, color = "181D1E") {
  return value.replace(/\\+\*/g, "*").split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({ text: bold ? part.slice(2, -2) : part, bold, size, color, font: "Montserrat" });
  });
}

function bodyContentParagraphs(value: string, size = 20, color = "181D1E") {
  return value.split(/\r?\n/).map((rawLine) => rawLine.trim()).filter(Boolean).map((line) => {
    const normalized = line.replace(/\\-/g, "-").replace(/\\+\*/g, "*");
    const bullet = normalized.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    return new Paragraph({
      ...(bullet ? { bullet: { level: 0 } } : {}),
      alignment: AlignmentType.LEFT,
      children: formattedRuns(bullet ? bullet[1] : normalized, size, color),
      spacing: { line: 276, lineRule: "auto", after: 80 },
    });
  });
}

function bodyParagraph(children: TextRun[], after = 100) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children,
    spacing: { line: 276, lineRule: "auto", after },
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireFeature(req, "meetings-export");
  if (denied) return denied;
  try {
    const { meeting_details, discussion_points = [], action_items = [], summary, other_discussions } = await req.json();

    const clientName = cleanField(meeting_details?.client_name);
    const dateStr = cleanField(meeting_details?.date);
    const startT = formatEchoTime(cleanField(meeting_details?.start_time));
    const endT = formatEchoTime(cleanField(meeting_details?.end_time));
    let timeStr = "";
    if (startT && endT) {
      timeStr = `${startT} - ${endT}`;
    } else if (startT || endT) {
      timeStr = startT || endT;
    }
    const dateTimeStr = dateStr && timeStr ? `${dateStr} (${timeStr})` : (dateStr || timeStr);
    const locationStr = cleanField(meeting_details?.location);
    const typeStr = cleanField(meeting_details?.meeting_type);
    const teamAtt = cleanField(meeting_details?.team_attendees || meeting_details?.prime_attendees);
    const extAtt = cleanField(meeting_details?.external_attendees);

    // 1. Editorial masthead: a generous serif title on an open page.
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "C9A84C" },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Minutes of the Meeting",
                      bold: false,
                      italics: true,
                      color: "003366",
                      size: 56,
                      font: "Cormorant Garamond",
                    }),
                  ],
                  spacing: { before: 100, after: 180 },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // 2. Meeting details
    const sectionHeading = (text: string) => new Paragraph({
      children: [new TextRun({ text, bold: false, italics: true, size: 36, color: "003366", font: "Cormorant Garamond" })],
      spacing: { before: 260, after: 120 },
    });

    // Metadata Info Table
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "CDD2DA" },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        [["PROJECT / CLIENT", clientName], ["DATE & TIME", dateTimeStr], ["VENUE / LOCATION", locationStr]],
        [["MEETING TYPE", typeStr], ["TEAM ATTENDEES", teamAtt], ["EXTERNAL ATTENDEES", extAtt]],
      ].map((row) => new TableRow({ children: row.map(([label, value]) => new TableCell({
        width: { size: 33, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [
          new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 15, color: "003366", font: "Montserrat" })], spacing: { after: 30 } }),
          new Paragraph({ children: [new TextRun({ text: value, size: 18, color: "181D1E", font: "Montserrat" })], spacing: { after: 120 } }),
        ],
      })) })),
    });

    // 3. Summary
    const summaryParagraphs = cleanField(summary).split(/\r?\n\s*\r?\n/).filter(Boolean);

    const summaryTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.SINGLE, size: 12, color: "C9A84C" },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
                  children: [
                    ...bodyContentParagraphs(summaryParagraphs[0] || "No summary provided.", 20, "181D1E"),
                    ...(summaryParagraphs[1] ? [bodyParagraph([new TextRun({ text: "Bottom line: ", bold: true, color: "003366", size: 20, font: "Montserrat" }), ...formattedRuns(summaryParagraphs[1], 20, "181D1E")])] : []),
                  ],
                }),
              ],
            }),
          ],
        });

    // Each discussion is exported as its own topic card, separate from follow-up actions.
    const rowRule = {
      style: BorderStyle.SINGLE,
      size: 2,
      color: "DCDFE3",
    };
    const discussionCards: Table[] = (discussion_points || []).map((item: any, index: number) => {
      const title = cleanField(item.topic_title) || `Discussion ${index + 1}`;
      const discussion = cleanField(item.discussion_point) || "No discussion details recorded.";
      const discussionParagraphs = bodyContentParagraphs(discussion);
      const contentParagraphs = discussionParagraphs.length > 0 ? discussionParagraphs : [new Paragraph({ text: "" })];

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: rowRule, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [
          new TableRow({
            children: [new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ keepNext: true, children: [new TextRun({ text: title, bold: false, italics: true, color: "003366", size: 34, font: "Cormorant Garamond" })], spacing: { before: 160, after: 80 } })],
            })],
          }),
          new TableRow({
            children: [new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: contentParagraphs,
            })],
          }),
        ],
      });
    });
    const actionItemRecords = (action_items || []).filter((item: any) => cleanField(item.action_plan));
    const actionRows: TableRow[] = [new TableRow({
      tableHeader: true,
      children: ["Discussion Point", "Action Plan", "Target Date", "Person in Charge"].map((label) => new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "FFFCFB" },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "003366" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "003366", size: 16, font: "Montserrat" })] })],
      })),
    })];
    actionItemRecords.forEach((item: any, index: number) => {
      const rowFill = "FFFCFB";
      const discussionCell: Paragraph[] = [];
      const topic = cleanField(item.discussion_point_title || item.topic_title);
      const discussion = cleanField(item.discussion_point);
      if (topic) discussionCell.push(new Paragraph({ children: [new TextRun({ text: topic, bold: true, color: "003366", size: 18, font: "Montserrat" })], spacing: { after: 60 } }));
      if (discussion) discussionCell.push(...bodyContentParagraphs(discussion));
      if (discussionCell.length === 0) discussionCell.push(new Paragraph({ text: "" }));
      const cells = [cleanField(item.action_plan), cleanField(item.target_date || item.indicative_delivery_date), cleanField(item.person_in_charge)];
      actionRows.push(new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.CLEAR, fill: rowFill },
          borders: { top: { style: BorderStyle.NONE }, bottom: rowRule, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: discussionCell,
        }), ...cells.map((value) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: rowFill },
          borders: { top: { style: BorderStyle.NONE }, bottom: rowRule, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: [bodyParagraph([new TextRun({ text: value, size: 18, color: "181D1E", font: "Montserrat" })])],
        }))],
      }));
    });
    const docChildren: any[] = [
      headerTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("MEETING DETAILS"),
      metaTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("SUMMARY"),
      summaryTable,
      new Paragraph({ text: "", spacing: { after: 150 } }),
      sectionHeading("DISCUSSION POINTS"),
      ...(discussionCards.length > 0
        ? discussionCards.flatMap((card) => [card, new Paragraph({ text: "", spacing: { after: 120 } })])
        : [new Paragraph({ text: "No discussion points recorded.", spacing: { after: 150 } })]),
      new Paragraph({ text: "", spacing: { after: 200 } }),
      ...(actionItemRecords.length > 0 ? [
        sectionHeading("ACTION ITEMS"),
        new Table({ rows: actionRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ text: "", spacing: { after: 200 } }),
      ] : []),
      sectionHeading("OTHER DISCUSSIONS"),
      ...bodyContentParagraphs(cleanField(other_discussions) || "None recorded.", 20, "181D1E"),
    ];
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1100,
              bottom: 1100,
              left: 1100,
              right: 1100,
            }
          }
        },
        children: docChildren,
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeClient = clientName || "Meeting";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="MoM_${safeClient.replace(/\s+/g, "_")}.docx"`,
      }
    });
  } catch (error: any) {
    console.error("Error generating executive Word doc:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
