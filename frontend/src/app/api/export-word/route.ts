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

function formattedRuns(value: string, size = 18, color = "333333") {
  return value.replace(/\\+\*/g, "*").split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({ text: bold ? part.slice(2, -2) : part, bold, size, color });
  });
}

function bodyContentParagraphs(value: string, size = 18, color = "333333") {
  return value.split(/\r?\n/).map((rawLine) => rawLine.trim()).filter(Boolean).map((line) => {
    const normalized = line.replace(/\\-/g, "-").replace(/\\+\*/g, "*");
    const bullet = normalized.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    return new Paragraph({
      ...(bullet ? { bullet: { level: 0 } } : {}),
      alignment: AlignmentType.JUSTIFIED,
      children: formattedRuns(bullet ? bullet[1] : normalized, size, color),
      spacing: { line: 276, lineRule: "auto", after: 80 },
    });
  });
}

function bodyParagraph(children: TextRun[], after = 100) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
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

    // 1. Sleek Top Header Banner (Charcoal with Gold Accent Bottom Border - 1-of-1 PDF Clone)
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.SINGLE, size: 14, color: "C9AB4C" },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "1A1A1A" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Minutes of the Meeting",
                      bold: true,
                      italics: true,
                      color: "FFFFFF",
                      size: 24,
                    }),
                  ],
                  spacing: { before: 140, after: 140 },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // 2. Meeting details
    const sectionHeading = (text: string) => new Paragraph({
      children: [new TextRun({ text, bold: true, italics: true, size: 20, color: "003366" })],
      spacing: { before: 100, after: 80 },
    });

    // Metadata Info Table
    const cellBorderLight = {
      style: BorderStyle.SINGLE,
      size: 1,
      color: "CDD2DA",
    };

    const metaBorders = {
      top: cellBorderLight,
      bottom: cellBorderLight,
      left: cellBorderLight,
      right: cellBorderLight,
    };

    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "PROJECT / CLIENT:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: clientName, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "MEETING TYPE:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: typeStr, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "DATE & TIME:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: dateTimeStr, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "TEAM ATTENDEES:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: teamAtt, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "VENUE / LOCATION:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: locationStr, size: 18, color: "23282D" })] })],
            }),
            new TableCell({
              width: { size: 19, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: "EXTERNAL ATTENDEES:", bold: true, size: 17, color: "003366" })] })],
            }),
            new TableCell({
              width: { size: 31, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "F8F6F2" },
              borders: metaBorders,
              children: [new Paragraph({ children: [new TextRun({ text: extAtt, size: 18, color: "23282D" })] })],
            }),
          ],
        }),
      ],
    });

    // 3. Summary
    const summaryParagraphs = cleanField(summary).split(/\r?\n\s*\r?\n/).filter(Boolean);

    const summaryTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "DCDFE3" },
            left: { style: BorderStyle.SINGLE, size: 24, color: "C9AB4C" },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: "FAF9F7" },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "SUMMARY",
                          bold: true,
                          color: "003366",
                          size: 17,
                        }),
                      ],
                      spacing: { before: 100, after: 60 },
                    }),
                    ...bodyContentParagraphs(summaryParagraphs[0] || "No summary provided.", 18, "374151"),
                    ...(summaryParagraphs[1] ? [bodyParagraph([new TextRun({ text: "Bottom line: ", bold: true, color: "003366", size: 18 }), ...formattedRuns(summaryParagraphs[1], 18, "374151")])] : []),
                  ],
                }),
              ],
            }),
          ],
        });

    // Each discussion is exported as its own topic card, separate from follow-up actions.
    const gridBorder = {
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
        borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder, insideHorizontal: gridBorder, insideVertical: gridBorder },
        rows: [
          new TableRow({
            children: [new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "FAF9F7" },
              borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
              children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, color: "003366", size: 19 })] })],
            })],
          }),
          new TableRow({
            children: [new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "FFFFFF" },
              borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
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
        shading: { type: ShadingType.CLEAR, fill: "003366" },
        borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 19 })] })],
      })),
    })];
    actionItemRecords.forEach((item: any, index: number) => {
      const rowFill = index % 2 ? "FAF9F7" : "FFFFFF";
      const discussionCell: Paragraph[] = [];
      const topic = cleanField(item.discussion_point_title || item.topic_title);
      const discussion = cleanField(item.discussion_point);
      if (topic) discussionCell.push(new Paragraph({ children: [new TextRun({ text: topic, bold: true, color: "003366", size: 18 })], spacing: { after: 60 } }));
      if (discussion) discussionCell.push(...bodyContentParagraphs(discussion));
      if (discussionCell.length === 0) discussionCell.push(new Paragraph({ text: "" }));
      const cells = [cleanField(item.action_plan), cleanField(item.target_date || item.indicative_delivery_date), cleanField(item.person_in_charge)];
      actionRows.push(new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.CLEAR, fill: rowFill },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: discussionCell,
        }), ...cells.map((value) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: rowFill },
          borders: { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder },
          children: [bodyParagraph([new TextRun({ text: value, size: 18, color: "333333" })])],
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
      ...bodyContentParagraphs(cleanField(other_discussions) || "None recorded.", 18, "333333"),
    ];
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
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
